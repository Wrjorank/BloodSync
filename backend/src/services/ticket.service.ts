import { Prisma } from '@prisma/client';
import { BADGES, DISPATCH, SCREENING, TICKET_STATUS_LABEL } from '../constants/blood';
import { conflict, forbidden, notFound } from '../utils/AppError';
import { Outbox } from './notification.service';
import { Tx, addEvent, lockRequest, progressOf, runInTx, settle, withdrawOtherInvites } from './dispatch.service';
import { eligibility } from '../utils/helpers';
import { audit } from './audit.service';

export interface Vitals {
  sys: number;
  dia: number;
  hb: number;
  weight: number;
}

const STATUS_LABEL = TICKET_STATUS_LABEL;

// the ticket lookup happens before the lock; everything is re-read after the request row is locked
async function lockedTicket(tx: Tx, ticketId: string) {
  const peek = await tx.donorTicket.findUnique({ where: { id: ticketId }, select: { requestId: true } });
  if (!peek) throw notFound('Tiket tidak ditemukan');
  const req = await lockRequest(tx, peek.requestId);
  const ticket = await tx.donorTicket.findUniqueOrThrow({ where: { id: ticketId } });
  return { req, ticket };
}

async function awardBadges(tx: Tx, donorId: string, responseMs: number | null) {
  const [donor, count, owned] = await Promise.all([
    tx.donor.findUniqueOrThrow({ where: { id: donorId }, select: { bloodType: true } }),
    tx.donation.count({ where: { donorId } }),
    tx.donorBadge.findMany({ where: { donorId }, select: { badgeId: true } }),
  ]);
  const have = new Set(owned.map(b => b.badgeId));
  const fresh = BADGES.filter(b => !have.has(b.id) && b.earned({ donationCount: count, bloodType: donor.bloodType, responseMs })).map(b => b.id);
  if (fresh.length) await tx.donorBadge.createMany({ data: fresh.map(badgeId => ({ donorId, badgeId })) });
  return fresh;
}

async function staffTicket(tx: Tx, faskesId: string, ticketId: string, expected: string) {
  const { req, ticket } = await lockedTicket(tx, ticketId);
  if (req.faskesId !== faskesId) throw forbidden('Tiket ini untuk faskes lain');
  if (ticket.status !== expected) throw conflict(`Tiket berstatus "${STATUS_LABEL[ticket.status]}"`, 'INVALID_STATE');
  return { req, ticket };
}

function touch(outbox: Outbox, req: { id: string; faskesId: string }, donorId: string) {
  outbox.requests.add(req.id);
  outbox.faskes.add(req.faskesId);
  outbox.donors.add(donorId);
}

export const ticketService = {
  // ---------- donor ----------

  async respond(donorId: string, ticketId: string, accept: boolean) {
    return runInTx(async (tx, outbox) => {
      const { req, ticket } = await lockedTicket(tx, ticketId);
      if (ticket.donorId !== donorId) throw notFound('Tiket tidak ditemukan');
      if (ticket.status !== 'INVITED') throw conflict('Panggilan ini sudah tidak berlaku', 'INVITE_EXPIRED');
      const now = new Date();
      touch(outbox, req, donorId);

      if (!accept) {
        await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'DECLINED', respondedAt: now } });
        await settle(tx, req, outbox); // hands the quota to a backup donor
        return { status: 'DECLINED' };
      }
      // lock order is always request -> donor; the donor lock serialises accepts across different requests
      await tx.$queryRaw`SELECT id FROM donors WHERE id = ${donorId} FOR UPDATE`;
      const donor = await tx.donor.findUniqueOrThrow({ where: { id: donorId }, select: { isActive: true, lastDonationAt: true } });
      if (!donor.isActive || !eligibility(donor.lastDonationAt, DISPATCH.eligibilityDays).eligible) {
        await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'WITHDRAWN', respondedAt: now } });
        await settle(tx, req, outbox);
        return { status: 'NOT_ELIGIBLE', message: 'Anda sedang dalam masa pemulihan atau profil tidak aktif, jadi belum bisa menerima panggilan.' };
      }
      const busy = await tx.donorTicket.count({ where: { donorId, id: { not: ticketId }, status: { in: ['RESERVED', 'ARRIVED', 'SCREENED'] } } });
      if (busy) throw conflict('Anda sudah memegang tiket donor aktif lain', 'ALREADY_COMMITTED');
      if (req.status !== 'BROADCASTING' || (await progressOf(tx, req)).uncovered === 0) {
        await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'QUOTA_FULL', respondedAt: now } });
        return { status: 'QUOTA_FULL', message: 'Kuota pendonor sudah terpenuhi. Terima kasih atas kesediaan Anda!' };
      }
      const etaMin = Math.max(5, Math.round((ticket.distanceKm / DISPATCH.travelSpeedKmh) * 60));
      const reservedUntil = new Date(now.getTime() + (etaMin + DISPATCH.reservationBufferMin) * 60000);
      await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'RESERVED', respondedAt: now, etaMin, reservedUntil } });
      await withdrawOtherInvites(tx, donorId, ticketId, outbox);
      await settle(tx, req, outbox); // withdraws other invites once reservations cover the need
      return { status: 'RESERVED', code: ticket.code, etaMin, reservedUntil };
    });
  },

  async cancelByDonor(donorId: string, ticketId: string) {
    return runInTx(async (tx, outbox) => {
      const { req, ticket } = await lockedTicket(tx, ticketId);
      if (ticket.donorId !== donorId) throw notFound('Tiket tidak ditemukan');
      if (ticket.status !== 'RESERVED') throw conflict('Tiket tidak bisa dibatalkan', 'INVALID_STATE');
      await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'CANCELLED' } });
      touch(outbox, req, donorId);
      await settle(tx, req, outbox);
      return { status: 'CANCELLED' };
    });
  },

  async acknowledge(donorId: string, ticketId: string) {
    return runInTx(async (tx, outbox) => {
      const ticket = await tx.donorTicket.findUnique({ where: { id: ticketId } });
      if (!ticket || ticket.donorId !== donorId) throw notFound('Tiket tidak ditemukan');
      await tx.donorTicket.update({ where: { id: ticketId }, data: { acknowledgedAt: new Date() } });
      outbox.donors.add(donorId);
      return { acknowledged: true };
    });
  },

  // ---------- staff ----------

  async scan(faskesId: string, rawCode: string) {
    let code = rawCode.trim().toUpperCase().replace(/^BLOODSYNC:/, '');
    if (!code.startsWith('TKT-')) code = 'TKT-' + code;
    return runInTx(async (tx, outbox) => {
      const peek = await tx.donorTicket.findUnique({ where: { code }, select: { id: true } });
      if (!peek) throw notFound('Tiket tidak ditemukan');
      const { req, ticket } = await lockedTicket(tx, peek.id);
      if (req.faskesId !== faskesId) throw forbidden('Tiket ini untuk faskes lain');
      if (ticket.status === 'RESERVED') {
        await tx.donorTicket.update({ where: { id: ticket.id }, data: { status: 'ARRIVED', arrivedAt: new Date() } });
        touch(outbox, req, ticket.donorId);
      } else if (ticket.status !== 'ARRIVED' && ticket.status !== 'SCREENED') {
        throw conflict(`Tiket berstatus "${STATUS_LABEL[ticket.status]}"`, 'INVALID_STATE');
      }
      return ticketService.detailForStaff(tx, ticket.id);
    });
  },

  async detailForStaff(tx: Tx, ticketId: string) {
    const t = await tx.donorTicket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { donor: { select: { id: true, name: true, bloodType: true } }, request: { select: { id: true, code: true, bloodType: true, component: true } } },
    });
    return {
      id: t.id, code: t.code, status: t.status, distanceKm: t.distanceKm, etaMin: t.etaMin, reservedUntil: t.reservedUntil,
      donor: t.donor, request: t.request,
      screening: t.screenedAt ? { sys: t.bpSystolic, dia: t.bpDiastolic, hb: t.hemoglobin, weight: t.weightKg, pass: t.screeningPass, reasons: t.screeningReasons } : null,
    };
  },

  async screening(faskesId: string, userId: string, ticketId: string, v: Vitals) {
    return runInTx(async (tx, outbox) => {
      const { req, ticket } = await staffTicket(tx, faskesId, ticketId, 'ARRIVED');
      const s = SCREENING;
      const reasons: string[] = [];
      if (v.hb < s.hbMin || v.hb > s.hbMax) reasons.push(`Hb ${v.hb} g/dL di luar ${s.hbMin}–${s.hbMax}`);
      if (v.sys < s.sysMin || v.sys > s.sysMax || v.dia < s.diaMin || v.dia > s.diaMax) reasons.push(`Tekanan darah ${v.sys}/${v.dia} mmHg di luar batas`);
      if (v.weight < s.weightMin) reasons.push(`Berat badan di bawah ${s.weightMin} kg`);
      const pass = reasons.length === 0;
      await tx.donorTicket.update({
        where: { id: ticketId },
        data: {
          status: pass ? 'SCREENED' : 'SCREENING_FAILED', bpSystolic: v.sys, bpDiastolic: v.dia, hemoglobin: v.hb, weightKg: v.weight,
          screeningPass: pass, screeningReasons: reasons as Prisma.InputJsonValue, screenedAt: new Date(),
        },
      });
      await audit(tx, `staff:${userId}`, 'donation.screening', ticket.code, { pass });
      touch(outbox, req, ticket.donorId);
      if (!pass) await settle(tx, req, outbox);
      return { pass, reasons };
    });
  },

  // donation done: cut the remaining need, log stock in/out, lock the donor for the recovery period
  async collect(faskesId: string, userId: string, ticketId: string) {
    return runInTx(async (tx, outbox) => {
      const { req, ticket } = await staffTicket(tx, faskesId, ticketId, 'SCREENED');
      const donor = await tx.donor.findUniqueOrThrow({ where: { id: ticket.donorId } });
      const now = new Date();
      const stillNeeded = ['APPROVED', 'BROADCASTING', 'EXPIRED'].includes(req.status) && (await progressOf(tx, req)).remaining > 0;
      await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'COLLECTED', collectedAt: now } });
      if (stillNeeded) {
        await tx.bloodRequest.update({ where: { id: req.id }, data: { bagsCollected: { increment: 1 } } });
        await addEvent(tx, req.id, `1 kantong diambil dari pendonor (${ticket.code})`);
        await tx.stockMovement.createMany({
          data: [
            { faskesId, component: req.component, bloodType: donor.bloodType, quantity: 1, kind: 'IN', note: `Donor ${ticket.code}`, requestId: req.id },
            { faskesId, component: req.component, bloodType: donor.bloodType, quantity: -1, kind: 'OUT', note: `Alokasi ke ${req.code}`, requestId: req.id },
          ],
        });
      } else {
        await tx.stock.upsert({
          where: { faskesId_component_bloodType: { faskesId, component: req.component, bloodType: donor.bloodType } },
          create: { faskesId, component: req.component, bloodType: donor.bloodType, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
        await tx.stockMovement.create({
          data: { faskesId, component: req.component, bloodType: donor.bloodType, quantity: 1, kind: 'IN', note: `Donor ${ticket.code} masuk stok (${req.code} tidak membutuhkan lagi)`, requestId: req.id },
        });
      }
      await withdrawOtherInvites(tx, donor.id, ticketId, outbox);
      await tx.donation.create({ data: { donorId: donor.id, faskesId, requestCode: req.code, component: req.component, donatedAt: now } });
      const responseMs = ticket.respondedAt ? ticket.respondedAt.getTime() - ticket.invitedAt.getTime() : null;
      // responders nudge their response rate up, which improves their ranking in future waves
      await tx.donor.update({ where: { id: donor.id }, data: { lastDonationAt: now, responseRate: Math.min(1, donor.responseRate * 0.8 + 0.2) } });
      const newBadges = await awardBadges(tx, donor.id, responseMs);
      await tx.donorTicket.update({ where: { id: ticketId }, data: { newBadges } });
      await audit(tx, `staff:${userId}`, 'donation.collect', ticket.code);
      touch(outbox, req, donor.id);
      await settle(tx, req, outbox);
      const p = await progressOf(tx, await tx.bloodRequest.findUniqueOrThrow({ where: { id: req.id } }));
      return { collected: true, toStock: !stillNeeded, remaining: p.remaining, newBadges };
    });
  },

  async noShow(faskesId: string, userId: string, ticketId: string) {
    return runInTx(async (tx, outbox) => {
      const { req, ticket } = await staffTicket(tx, faskesId, ticketId, 'RESERVED');
      await tx.donorTicket.update({ where: { id: ticketId }, data: { status: 'NO_SHOW', note: 'Slot dilepas oleh petugas karena Anda belum tiba.' } });
      await audit(tx, `staff:${userId}`, 'ticket.no_show', ticket.code);
      touch(outbox, req, ticket.donorId);
      await settle(tx, req, outbox);
      return { status: 'NO_SHOW' };
    });
  },
};

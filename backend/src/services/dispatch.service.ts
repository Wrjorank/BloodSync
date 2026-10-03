import { BloodRequest, Prisma, RequestStatus, TicketStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { DISPATCH, compatibleDonorTypes } from '../constants/blood';
import { DAY_MS, boundingBox, distanceKm, eligibility, randomCode } from '../utils/helpers';
import { notFound } from '../utils/AppError';
import { Outbox, flush } from './notification.service';

export type Tx = Prisma.TransactionClient;

// tickets that currently hold a reserved slot
export const ACTIVE_TICKET: TicketStatus[] = ['RESERVED', 'ARRIVED', 'SCREENED'];
export const ACTIVE_REQUEST: RequestStatus[] = ['PENDING_VERIFICATION', 'APPROVED', 'BROADCASTING'];
// seed dummies never reach production calls or numbers, even if a dev seed ran against the production db
export const LIVE_DONOR: Prisma.DonorWhereInput = env.isProduction ? { isActive: true, isSimulated: false } : { isActive: true };

// every mutation runs in one transaction; realtime events go out only after commit
export async function runInTx<T>(fn: (tx: Tx, outbox: Outbox) => Promise<T>): Promise<T> {
  const outbox = new Outbox();
  const result = await prisma.$transaction(tx => fn(tx, outbox), {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: 15000,
  });
  await flush(outbox);
  return result;
}

// row lock serialises everything that touches one request (slot reservations, settle, escalation)
export async function lockRequest(tx: Tx, id: string): Promise<BloodRequest> {
  await tx.$queryRaw`SELECT id FROM blood_requests WHERE id = ${id} FOR UPDATE`;
  const req = await tx.bloodRequest.findUnique({ where: { id } });
  if (!req) throw notFound('Permintaan tidak ditemukan');
  return req;
}

export interface Progress {
  needed: number;
  fulfilled: number;
  fromStock: number;
  collected: number;
  reserved: number;
  invited: number;
  declined: number;
  remaining: number;
  uncovered: number;
}

// fulfilled = units already secured; reserved = donors holding a slot; uncovered = what still needs new donors
export function computeProgress(req: BloodRequest, counts: Partial<Record<TicketStatus, number>>): Progress {
  const sum = (statuses: TicketStatus[]) => statuses.reduce((s, st) => s + (counts[st] || 0), 0);
  const fulfilled = req.allocatedFromStock + req.bagsCollected;
  const reserved = sum(ACTIVE_TICKET);
  const remaining = Math.max(0, req.bagsNeeded - fulfilled);
  return {
    needed: req.bagsNeeded,
    fulfilled,
    fromStock: req.allocatedFromStock,
    collected: req.bagsCollected,
    reserved,
    invited: sum(['INVITED']),
    declined: sum(['DECLINED']),
    remaining,
    uncovered: Math.max(0, remaining - reserved),
  };
}

export async function ticketCounts(db: Tx | typeof prisma, requestIds: string[]) {
  const rows = await db.donorTicket.groupBy({ by: ['requestId', 'status'], where: { requestId: { in: requestIds } }, _count: { _all: true } });
  const map = new Map<string, Partial<Record<TicketStatus, number>>>();
  for (const r of rows) {
    const entry = map.get(r.requestId) || {};
    entry[r.status] = r._count._all;
    map.set(r.requestId, entry);
  }
  return map;
}

export async function progressOf(db: Tx | typeof prisma, req: BloodRequest): Promise<Progress> {
  return computeProgress(req, (await ticketCounts(db, [req.id])).get(req.id) || {});
}

// what the public emergency card shows; anything but OPEN tells people not to come
export function publicState(req: BloodRequest, p: Progress) {
  if (req.status === 'FULFILLED') return 'FULFILLED';
  if (req.status === 'CLOSED' || req.status === 'REJECTED') return 'CLOSED';
  if (req.status === 'EXPIRED') return 'EXPIRED';
  if (req.status === 'APPROVED') return 'VERIFIED';
  if (req.status !== 'BROADCASTING') return 'PENDING';
  return p.uncovered > 0 ? 'OPEN' : 'QUOTA_FULL';
}

export async function addEvent(tx: Tx, requestId: string, text: string) {
  await tx.requestEvent.create({ data: { requestId, text } });
}

export async function setStatus(tx: Tx, req: BloodRequest, status: RequestStatus, text: string, outbox: Outbox, extra: Prisma.BloodRequestUpdateInput = {}) {
  await tx.bloodRequest.update({ where: { id: req.id }, data: { status, ...extra } });
  req.status = status;
  await addEvent(tx, req.id, text);
  outbox.requests.add(req.id);
  outbox.faskes.add(req.faskesId);
  if (status === 'APPROVED' || status === 'FULFILLED') outbox.familyNotices.set(req.id, status);
}

export async function releaseTickets(tx: Tx, requestId: string, from: TicketStatus[], to: TicketStatus, outbox: Outbox, note?: string) {
  const affected = await tx.donorTicket.findMany({ where: { requestId, status: { in: from } }, select: { id: true, donorId: true } });
  if (!affected.length) return;
  await tx.donorTicket.updateMany({ where: { id: { in: affected.map(t => t.id) } }, data: { status: to, ...(note ? { note } : {}) } });
  affected.forEach(t => outbox.donors.add(t.donorId));
  outbox.requests.add(requestId);
}

// take compatible units off a faskes shelf, identical type first; returns units taken per type
export async function takeFromShelf(tx: Tx, req: BloodRequest, faskesId: string, limit: number, note: string, outbox: Outbox) {
  const byType: { bloodType: string; quantity: number }[] = [];
  if (limit <= 0) return { taken: 0, byType };
  const shelf = await tx.$queryRaw<{ id: string; bloodType: string; quantity: number }[]>`
    SELECT id, bloodType, quantity FROM stocks WHERE faskesId = ${faskesId} AND component = ${req.component} FOR UPDATE`;
  let taken = 0;
  for (const type of compatibleDonorTypes(req.bloodType, req.component, true)) {
    const row = shelf.find(s => s.bloodType === type);
    const n = row ? Math.min(Number(row.quantity), limit - taken) : 0;
    if (n <= 0) continue;
    await tx.stock.update({ where: { id: row!.id }, data: { quantity: { decrement: n } } });
    await tx.stockMovement.create({ data: { faskesId, component: req.component, bloodType: type, quantity: -n, kind: 'OUT', note, requestId: req.id } });
    taken += n;
    byType.push({ bloodType: type, quantity: n });
  }
  if (taken) outbox.faskes.add(faskesId);
  return { taken, byType };
}

// a donor who committed elsewhere (or just donated) must not keep open invites on other requests;
// the engine tick refills those requests with backups
export async function withdrawOtherInvites(tx: Tx, donorId: string, exceptTicketId: string, outbox: Outbox) {
  const open = await tx.donorTicket.findMany({ where: { donorId, status: 'INVITED', id: { not: exceptTicketId } }, select: { id: true, requestId: true } });
  if (!open.length) return;
  await tx.donorTicket.updateMany({ where: { id: { in: open.map(t => t.id) } }, data: { status: 'WITHDRAWN' } });
  open.forEach(t => outbox.requests.add(t.requestId));
  outbox.donors.add(donorId);
}

// shared by staff close, family cancel and faskes deactivation
export async function closeRequestTx(tx: Tx, req: BloodRequest, text: string, donorNote: string, outbox: Outbox) {
  await setStatus(tx, req, 'CLOSED', text, outbox);
  await releaseTickets(tx, req.id, ['INVITED'], 'WITHDRAWN', outbox);
  await releaseTickets(tx, req.id, ['RESERVED', 'ARRIVED', 'SCREENED'], 'CANCELLED', outbox, donorNote);
  await tx.stockTransfer.updateMany({ where: { requestId: req.id, status: 'PENDING' }, data: { status: 'CANCELLED', note: 'Permintaan ditutup' } });
}

const ALERT_STATUSES: TicketStatus[] = ['INVITED', 'DECLINED', 'WITHDRAWN', 'QUOTA_FULL'];

async function uniqueTicketCode(tx: Tx) {
  for (let i = 0; i < 5; i++) {
    const code = 'TKT-' + randomCode(6);
    if (!(await tx.donorTicket.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error('Gagal membuat kode tiket unik');
}

// targeted push: radius -> compatible type -> eligibility -> anti-spam cap, then rank and invite
async function fillInvites(tx: Tx, req: BloodRequest, p: Progress, outbox: Outbox) {
  const now = Date.now();
  const faskes = await tx.faskes.findUniqueOrThrow({ where: { id: req.faskesId } });
  const radius = req.radiusKm!;
  const box = boundingBox(faskes, radius);
  const types = compatibleDonorTypes(req.bloodType, req.component, req.allowCompatible);

  const nearby = (await tx.donor.findMany({
    where: { ...LIVE_DONOR, lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
    select: { id: true, bloodType: true, lat: true, lng: true, lastDonationAt: true, responseRate: true },
  }))
    .map(d => ({ ...d, dist: distanceKm(faskes, d) }))
    .filter(d => d.dist <= radius);

  const ids = nearby.map(d => d.id);
  const [existing, committed, alerts] = await Promise.all([
    tx.donorTicket.findMany({ where: { requestId: req.id }, select: { id: true, donorId: true, status: true } }),
    tx.donorTicket.findMany({ where: { donorId: { in: ids }, status: { in: ACTIVE_TICKET } }, select: { donorId: true } }),
    // every push counts, including repeated re-invites on the same request
    tx.donorTicket.groupBy({
      by: ['donorId'],
      where: { donorId: { in: ids }, invitedAt: { gte: new Date(now - 7 * DAY_MS) }, status: { in: ALERT_STATUSES } },
      _sum: { alertCount: true },
    }),
  ]);
  const existingByDonor = new Map(existing.map(t => [t.donorId, t]));
  const committedSet = new Set(committed.map(t => t.donorId));
  const alertCount = new Map(alerts.map(a => [a.donorId, a._sum.alertCount || 0]));

  const stats = { inRadius: nearby.length, typeMatch: 0, eligible: 0, capped: 0 };
  const candidates: (typeof nearby[number] & { ticketId?: string })[] = [];
  for (const d of nearby) {
    if (!types.includes(d.bloodType)) continue;
    stats.typeMatch++;
    if (!eligibility(d.lastDonationAt, DISPATCH.eligibilityDays, now).eligible || committedSet.has(d.id)) continue;
    const ticket = existingByDonor.get(d.id);
    if (ticket && ticket.status !== 'WITHDRAWN') {
      stats.eligible++; // already engaged with this request
      continue;
    }
    if ((alertCount.get(d.id) || 0) >= DISPATCH.maxAlertsPerWeek) {
      stats.capped++;
      continue;
    }
    stats.eligible++;
    candidates.push({ ...d, ticketId: ticket?.id });
  }

  const pendingThisWave = await tx.donorTicket.count({ where: { requestId: req.id, status: 'INVITED', wave: req.wave } });
  const slots = Math.ceil(p.uncovered * DISPATCH.overProvision) - pendingThisWave;

  const chosen = candidates
    .sort((a, b) =>
      (a.bloodType === req.bloodType ? 0 : 1) - (b.bloodType === req.bloodType ? 0 : 1) ||
      a.dist - b.dist ||
      b.responseRate - a.responseRate)
    .slice(0, Math.max(0, slots));

  for (const c of chosen) {
    const data = { status: 'INVITED' as const, wave: req.wave, invitedAt: new Date(now), respondedAt: null, distanceKm: Math.round(c.dist * 10) / 10 };
    const ticket = c.ticketId
      ? await tx.donorTicket.update({ where: { id: c.ticketId }, data: { ...data, alertCount: { increment: 1 } } })
      : await tx.donorTicket.create({ data: { ...data, code: await uniqueTicketCode(tx), requestId: req.id, donorId: c.id } });
    outbox.invites.add(ticket.id);
    outbox.donors.add(c.id);
  }

  const invited = await tx.donorTicket.count({ where: { requestId: req.id, wave: req.wave } });
  const next = { radiusKm: radius, ...stats, invited };
  const current = await tx.dispatchWave.findUnique({ where: { requestId_wave: { requestId: req.id, wave: req.wave } } });
  const changed = !current || (Object.keys(next) as (keyof typeof next)[]).some(k => current[k] !== next[k]);
  if (changed) {
    await tx.dispatchWave.upsert({
      where: { requestId_wave: { requestId: req.id, wave: req.wave } },
      create: { requestId: req.id, wave: req.wave, ...next },
      update: next,
    });
    outbox.requests.add(req.id);
    outbox.faskes.add(req.faskesId);
  }
}

// single place that reconciles a (locked) request with its tickets after any change
export async function settle(tx: Tx, req: BloodRequest, outbox: Outbox) {
  if (!['APPROVED', 'BROADCASTING', 'EXPIRED'].includes(req.status)) return;
  const fresh = await tx.bloodRequest.findUniqueOrThrow({ where: { id: req.id } });
  const p = await progressOf(tx, fresh);
  if (p.remaining === 0) {
    await setStatus(tx, fresh, 'FULFILLED', 'Semua kantong terpenuhi, tautan publik dikunci (CLOSED)', outbox);
    await releaseTickets(tx, fresh.id, ['INVITED'], 'WITHDRAWN', outbox);
    await releaseTickets(tx, fresh.id, ['RESERVED'], 'CANCELLED', outbox, 'Kebutuhan sudah terpenuhi sebelum Anda tiba. Terima kasih!');
    return;
  }
  if (fresh.status !== 'BROADCASTING') return;
  if (p.uncovered === 0) await releaseTickets(tx, fresh.id, ['INVITED'], 'WITHDRAWN', outbox);
  else await fillInvites(tx, fresh, p, outbox);
}

// time-driven rules for one request: reservation expiry, deadline, radius escalation
async function tickRequest(id: string) {
  await runInTx(async (tx, outbox) => {
    const req = await lockRequest(tx, id);
    if (req.status !== 'BROADCASTING' && req.status !== 'EXPIRED') return;
    const now = new Date();

    const expired = await tx.donorTicket.findMany({ where: { requestId: id, status: 'RESERVED', reservedUntil: { lt: now } }, select: { id: true, donorId: true } });
    if (expired.length) {
      await tx.donorTicket.updateMany({
        where: { id: { in: expired.map(t => t.id) } },
        data: { status: 'NO_SHOW', note: 'Slot dilepas otomatis karena melewati batas waktu kedatangan.' },
      });
      expired.forEach(t => outbox.donors.add(t.donorId));
      outbox.requests.add(id);
    }

    if (req.status === 'BROADCASTING') {
      if (req.deadline && req.deadline < now) {
        await setStatus(tx, req, 'EXPIRED', 'Batas waktu panggilan terlewati', outbox);
        await releaseTickets(tx, id, ['INVITED'], 'WITHDRAWN', outbox);
      } else if (req.waveStartedAt && now.getTime() - req.waveStartedAt.getTime() >= (req.escalateMinutes || 10) * 60000) {
        const p = await progressOf(tx, req);
        if (p.uncovered > 0 && (req.radiusKm || 0) < DISPATCH.maxRadiusKm) {
          const radiusKm = Math.min(DISPATCH.maxRadiusKm, (req.radiusKm || 0) + DISPATCH.radiusStepKm);
          await tx.bloodRequest.update({ where: { id }, data: { wave: { increment: 1 }, radiusKm, waveStartedAt: now } });
          await addEvent(tx, id, `Gelombang ${req.wave + 1}: radius diperluas ke ${radiusKm} km`);
          outbox.requests.add(id);
        } else if (p.uncovered > 0 && !req.maxedOut) {
          await tx.bloodRequest.update({ where: { id }, data: { maxedOut: true } });
          await addEvent(tx, id, 'Radius maksimum tercapai, Kartu Darurat perlu disebar');
          outbox.requests.add(id);
        }
      }
    }
    await settle(tx, req, outbox);
  });
}

export async function tick() {
  const now = new Date();
  const due = await prisma.bloodRequest.findMany({
    where: {
      OR: [
        { status: 'BROADCASTING' },
        { status: 'EXPIRED', tickets: { some: { status: 'RESERVED', reservedUntil: { lt: now } } } },
      ],
    },
    select: { id: true },
  });
  for (const { id } of due) {
    try {
      await tickRequest(id);
    } catch (err) {
      console.error(`[engine] gagal memproses ${id}`, err);
    }
  }
}

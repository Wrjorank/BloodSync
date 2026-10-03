import prisma from '../config/prisma';
import { AREAS, BADGES, COMPONENT_LABEL, DISPATCH } from '../constants/blood';
import { DAY_MS, distanceKm, eligibility, maskPhone } from '../utils/helpers';
import { badRequest, conflict, notFound } from '../utils/AppError';
import { signToken } from '../utils/jwt';
import { lockRequest, runInTx, settle } from './dispatch.service';
import { audit } from './audit.service';

export interface RegisterDonorInput {
  name: string;
  bloodType: string;
  area: string;
  lat?: number;
  lng?: number;
  lastDonationAt?: Date | null;
}

const OUTCOME = ['COLLECTED', 'SCREENING_FAILED', 'NO_SHOW', 'CANCELLED'] as const;

function locate(area: string) {
  const point = AREAS[area];
  if (!point) throw badRequest('Kecamatan tidak dikenal');
  // small jitter so donors in one kecamatan do not share one exact point
  const jitter = () => (Math.random() - 0.5) * 0.008;
  return { lat: point[0] + jitter(), lng: point[1] + jitter() };
}

// label a gps fix with the nearest known kecamatan; far outside the list the previous label stays
function nearestArea(point: { lat: number; lng: number }, fallback: string) {
  let best = fallback, bestKm = 10;
  for (const [name, [lat, lng]] of Object.entries(AREAS)) {
    const km = distanceKm(point, { lat, lng });
    if (km < bestKm) { best = name; bestKm = km; }
  }
  return best;
}

export const donorService = {
  async register(phone: string, input: RegisterDonorInput) {
    // the date input is a calendar day; compare it to today's date in WIB, not to the current instant in UTC
    const todayWib = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    if (input.lastDonationAt && input.lastDonationAt.toISOString().slice(0, 10) > todayWib) throw badRequest('Tanggal terakhir donor tidak boleh di masa depan');
    if (await prisma.donor.findUnique({ where: { phone } })) throw conflict('Nomor sudah terdaftar, silakan masuk', 'DONOR_EXISTS');
    const donor = await runInTx(async tx => {
      const created = await tx.donor.create({
        data: {
          name: input.name, phone, bloodType: input.bloodType, area: input.area,
          // a real gps fix beats the kecamatan centroid
          ...(input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : locate(input.area)),
          lastDonationAt: input.lastDonationAt || null,
        },
      });
      if (input.lastDonationAt) {
        await tx.donation.create({ data: { donorId: created.id, component: 'WB', donatedAt: input.lastDonationAt } });
        await tx.donorBadge.create({ data: { donorId: created.id, badgeId: 'first' } });
      }
      await audit(tx, `pendonor:${phone}`, 'donor.register', created.id);
      return created;
    });
    return { token: signToken({ kind: 'donor', sub: donor.id, phone, ver: donor.tokenVersion }), donorId: donor.id };
  },

  // one call returns everything the donor app renders
  async dashboard(donorId: string) {
    const donor = await prisma.donor.findUnique({
      where: { id: donorId },
      include: { badges: true, donations: { orderBy: { donatedAt: 'desc' }, take: 20, include: { faskes: { select: { name: true } } } } },
    });
    if (!donor) throw notFound('Pendonor tidak ditemukan');
    const el = eligibility(donor.lastDonationAt, DISPATCH.eligibilityDays);

    const [invite, active, outcome] = await Promise.all([
      prisma.donorTicket.findFirst({
        where: { donorId, status: 'INVITED', request: { status: 'BROADCASTING' } },
        include: { request: { include: { faskes: true } } },
        orderBy: { invitedAt: 'desc' },
      }),
      prisma.donorTicket.findFirst({
        where: { donorId, status: { in: ['RESERVED', 'ARRIVED', 'SCREENED'] } },
        include: { request: { include: { faskes: true } } },
      }),
      prisma.donorTicket.findFirst({
        where: {
          donorId, acknowledgedAt: null,
          OR: [{ status: { in: ['COLLECTED', 'SCREENING_FAILED', 'NO_SHOW'] } }, { status: 'CANCELLED', note: { not: null } }],
        },
        include: { request: { include: { faskes: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const faskesInfo = (f: { id: string; name: string; area: string; lat: number; lng: number }) => ({
      id: f.id, name: f.name, area: f.area, lat: f.lat, lng: f.lng,
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`,
    });

    return {
      profile: {
        id: donor.id, name: donor.name, phone: maskPhone(donor.phone), bloodType: donor.bloodType, area: donor.area, isActive: donor.isActive,
        lastDonationAt: donor.lastDonationAt,
      },
      eligibility: { ...el, cycleDays: DISPATCH.eligibilityDays },
      reminder: el.eligible && donor.lastDonationAt ? await this.reminder(donor) : null,
      // an invite is only actionable for an active, recovered donor without another ticket in progress
      invite: invite && donor.isActive && el.eligible && !active && {
        ticketId: invite.id,
        distanceKm: invite.distanceKm,
        etaMin: Math.max(5, Math.round((invite.distanceKm / DISPATCH.travelSpeedKmh) * 60)),
        wave: invite.wave,
        request: {
          id: invite.request.id, code: invite.request.code, bloodType: invite.request.bloodType, component: invite.request.component,
          componentLabel: COMPONENT_LABEL[invite.request.component], bagsNeeded: invite.request.bagsNeeded, urgency: invite.request.urgency,
          deadline: invite.request.deadline, compatibleOnly: invite.request.bloodType !== donor.bloodType,
        },
        faskes: faskesInfo(invite.request.faskes),
      },
      activeTicket: active && {
        id: active.id, code: active.code, qrPayload: `BLOODSYNC:${active.code}`, status: active.status,
        distanceKm: active.distanceKm, etaMin: active.etaMin, reservedUntil: active.reservedUntil,
        request: { code: active.request.code, bloodType: active.request.bloodType, component: active.request.component, componentLabel: COMPONENT_LABEL[active.request.component] },
        faskes: faskesInfo(active.request.faskes),
      },
      outcome: outcome && {
        ticketId: outcome.id, status: outcome.status as (typeof OUTCOME)[number], note: outcome.note,
        reasons: outcome.screeningReasons, newBadges: outcome.newBadges, requestCode: outcome.request.code, faskes: outcome.request.faskes.name,
      },
      badges: BADGES.map(b => ({ id: b.id, label: b.label, icon: b.icon, earned: donor.badges.some(x => x.badgeId === b.id) })),
      donations: donor.donations.map(d => ({ at: d.donatedAt, faskes: d.faskes?.name || null, component: d.component, requestCode: d.requestCode })),
    };
  },

  // pre-alert: nearest faskes where the donor's own type is running low
  async reminder(donor: { name: string; bloodType: string; lat: number; lng: number }) {
    const rows = await prisma.stock.findMany({
      where: { component: 'PRC', bloodType: donor.bloodType, quantity: { lt: DISPATCH.lowStockThreshold }, faskes: { isActive: true } },
      include: { faskes: true },
    });
    const nearest = rows.map(r => ({ faskes: r.faskes.name, distanceKm: Math.round(distanceKm(donor, r.faskes) * 10) / 10 })).sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const first = donor.name.split(' ')[0];
    return {
      message: `Halo ${first}! Hari ini tubuh Anda sudah siap untuk donor darah kembali.`,
      lowStock: nearest ? { ...nearest, bloodType: donor.bloodType, text: `Stok ${donor.bloodType} menipis di ${nearest.faskes}.` } : null,
    };
  },

  async updateArea(donorId: string, area: string) {
    const donor = await prisma.donor.update({ where: { id: donorId }, data: { area, ...locate(area) } });
    return { area: donor.area };
  },

  async updateLocation(donorId: string, point: { lat: number; lng: number }) {
    const current = await prisma.donor.findUnique({ where: { id: donorId }, select: { area: true } });
    if (!current) throw notFound('Pendonor tidak ditemukan');
    const donor = await prisma.donor.update({ where: { id: donorId }, data: { lat: point.lat, lng: point.lng, area: nearestArea(point, current.area) } });
    return { area: donor.area };
  },

  // opting out releases open invites and reserved slots so their requests re-invite backups right away
  async deactivate(donorId: string) {
    const open = await prisma.donorTicket.findMany({ where: { donorId, status: { in: ['INVITED', 'RESERVED'] } }, select: { requestId: true } });
    await prisma.donor.update({ where: { id: donorId }, data: { isActive: false } });
    for (const requestId of new Set(open.map(t => t.requestId))) {
      await runInTx(async (tx, outbox) => {
        const req = await lockRequest(tx, requestId);
        const mine = await tx.donorTicket.findMany({ where: { requestId, donorId, status: { in: ['INVITED', 'RESERVED'] } }, select: { id: true } });
        if (!mine.length) return;
        await tx.donorTicket.updateMany({ where: { id: { in: mine.map(t => t.id) } }, data: { status: 'CANCELLED', note: 'Pendonor menonaktifkan profil' } });
        outbox.requests.add(requestId);
        outbox.donors.add(donorId);
        await settle(tx, req, outbox);
      });
    }
    return { active: false };
  },

  async reactivate(donorId: string) {
    await prisma.donor.update({ where: { id: donorId }, data: { isActive: true } });
    return { active: true };
  },

  // revokes every token of this donor on every device, not just the one calling
  async logout(donorId: string) {
    await runInTx(async tx => {
      const donor = await tx.donor.update({ where: { id: donorId }, data: { tokenVersion: { increment: 1 } } });
      await audit(tx, `pendonor:${donor.phone}`, 'auth.logout', donorId);
    });
    return { loggedOut: true };
  },

  // demo shortcut: pretend the recovery period is over so the reminder flow can be shown
  async finishRecovery(donorId: string) {
    const donor = await prisma.donor.findUnique({ where: { id: donorId } });
    if (!donor?.lastDonationAt) throw badRequest('Pendonor belum punya riwayat donor');
    await prisma.donor.update({ where: { id: donorId }, data: { lastDonationAt: new Date(Date.now() - DISPATCH.eligibilityDays * DAY_MS) } });
    return { eligible: true };
  },
};

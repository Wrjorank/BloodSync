import { Component } from '@prisma/client';
import prisma from '../config/prisma';
import { BLOOD_TYPES, COMPONENT_LABEL, DISPATCH } from '../constants/blood';
import { boundingBox, distanceKm, eligibility } from '../utils/helpers';
import { badRequest, notFound } from '../utils/AppError';
import { LIVE_DONOR, runInTx } from './dispatch.service';
import { audit } from './audit.service';

export const faskesService = {
  async listPublic() {
    return prisma.faskes.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, area: true, lat: true, lng: true },
      orderBy: { name: 'asc' },
    });
  },

  async me(faskesId: string) {
    const f = await prisma.faskes.findUnique({ where: { id: faskesId } });
    if (!f) throw notFound('Faskes tidak ditemukan');
    return f;
  },

  // component x ABO/Rh matrix; missing rows read as zero
  async stockMatrix(faskesId: string) {
    const rows = await prisma.stock.findMany({ where: { faskesId } });
    return (Object.keys(COMPONENT_LABEL) as Component[]).map(component => {
      const byType = Object.fromEntries(BLOOD_TYPES.map(t => [t, rows.find(r => r.component === component && r.bloodType === t)?.quantity || 0]));
      return {
        component,
        label: COMPONENT_LABEL[component],
        byType,
        total: Object.values(byType).reduce((s, n) => s + n, 0),
        low: BLOOD_TYPES.filter(t => byType[t] < DISPATCH.lowStockThreshold),
      };
    });
  },

  // manual stock correction or receipt from outside the system (e.g. PMI delivery, discarded expired units)
  async adjustStock(faskesId: string, userId: string, input: { component: Component; bloodType: string; delta: number; note: string }) {
    return runInTx(async (tx, outbox) => {
      await tx.stock.upsert({
        where: { faskesId_component_bloodType: { faskesId, component: input.component, bloodType: input.bloodType } },
        create: { faskesId, component: input.component, bloodType: input.bloodType, quantity: 0 },
        update: {},
      });
      const [row] = await tx.$queryRaw<{ id: string; quantity: number }[]>`
        SELECT id, quantity FROM stocks WHERE faskesId = ${faskesId} AND component = ${input.component} AND bloodType = ${input.bloodType} FOR UPDATE`;
      if (Number(row.quantity) + input.delta < 0) throw badRequest('Stok tidak boleh negatif');
      await tx.stock.update({ where: { id: row.id }, data: { quantity: { increment: input.delta } } });
      await tx.stockMovement.create({
        data: { faskesId, component: input.component, bloodType: input.bloodType, quantity: input.delta, kind: input.delta > 0 ? 'IN' : 'OUT', note: input.note },
      });
      await audit(tx, `staff:${userId}`, 'stock.adjust', `${input.component} ${input.bloodType}`, { delta: input.delta, note: input.note });
      outbox.faskes.add(faskesId);
      return { quantity: Number(row.quantity) + input.delta };
    });
  },

  async movements(faskesId: string, limit: number) {
    return prisma.stockMovement.findMany({
      where: { faskesId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, component: true, bloodType: true, quantity: true, kind: true, note: true, createdAt: true },
    });
  },

  async arrivals(faskesId: string) {
    const tickets = await prisma.donorTicket.findMany({
      where: { status: { in: ['RESERVED', 'ARRIVED', 'SCREENED'] }, request: { faskesId } },
      include: { donor: { select: { name: true, bloodType: true } }, request: { select: { code: true } } },
      orderBy: { reservedUntil: 'asc' },
    });
    return tickets.map(t => ({
      id: t.id, code: t.code, status: t.status, etaMin: t.etaMin, reservedUntil: t.reservedUntil,
      donor: t.donor, requestCode: t.request.code,
    }));
  },

  // registered donors around the faskes, grouped by type
  async donorPool(faskesId: string, radiusKm: number = DISPATCH.maxRadiusKm) {
    const f = await this.me(faskesId);
    const box = boundingBox(f, radiusKm);
    const donors = (await prisma.donor.findMany({
      where: { ...LIVE_DONOR, lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
      select: { bloodType: true, lat: true, lng: true, lastDonationAt: true },
    })).filter(d => distanceKm(f, d) <= radiusKm);
    const byType = BLOOD_TYPES.map(type => {
      const ofType = donors.filter(d => d.bloodType === type);
      return { bloodType: type, total: ofType.length, eligible: ofType.filter(d => eligibility(d.lastDonationAt, DISPATCH.eligibilityDays).eligible).length };
    });
    return { radiusKm, total: donors.length, eligible: byType.reduce((s, t) => s + t.eligible, 0), byType };
  },
};

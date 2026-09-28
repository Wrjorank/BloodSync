import bcrypt from 'bcryptjs';
import { Component, FaskesType, UserRole } from '@prisma/client';
import prisma from '../config/prisma';
import { BLOOD_TYPES, DISPATCH } from '../constants/blood';
import { badRequest } from '../utils/AppError';
import { ACTIVE_REQUEST, closeRequestTx, lockRequest, runInTx } from './dispatch.service';
import { audit } from './audit.service';

export const adminService = {
  async listFaskes() {
    return prisma.faskes.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true, requests: true } } } });
  },

  async createFaskes(adminId: string, input: { name: string; type: FaskesType; area: string; address?: string; lat: number; lng: number }) {
    return runInTx(async tx => {
      const f = await tx.faskes.create({ data: input });
      const components: Component[] = ['PRC', 'TC', 'WB'];
      await tx.stock.createMany({ data: components.flatMap(component => BLOOD_TYPES.map(bloodType => ({ faskesId: f.id, component, bloodType, quantity: 0 }))) });
      await audit(tx, `admin:${adminId}`, 'faskes.create', f.id);
      return f;
    });
  },

  // deactivation also stops its live calls, otherwise the engine keeps inviting donors to a faskes whose staff cannot log in
  async setFaskesActive(adminId: string, id: string, isActive: boolean) {
    const f = await runInTx(async tx => {
      const updated = await tx.faskes.update({ where: { id }, data: { isActive } });
      if (!isActive) {
        await tx.stockTransfer.updateMany({
          where: { status: 'PENDING', OR: [{ fromFaskesId: id }, { toFaskesId: id }] },
          data: { status: 'CANCELLED', note: 'Faskes dinonaktifkan' },
        });
      }
      await audit(tx, `admin:${adminId}`, isActive ? 'faskes.activate' : 'faskes.deactivate', id);
      return updated;
    });
    if (!isActive) {
      const active = await prisma.bloodRequest.findMany({ where: { faskesId: id, status: { in: ACTIVE_REQUEST } }, select: { id: true } });
      for (const { id: requestId } of active) {
        await runInTx(async (tx, outbox) => {
          const req = await lockRequest(tx, requestId);
          if (!ACTIVE_REQUEST.includes(req.status)) return;
          await closeRequestTx(tx, req, 'Ditutup otomatis: faskes dinonaktifkan admin', 'Faskes tujuan sedang tidak aktif. Anda tidak perlu datang.', outbox);
        });
      }
    }
    return f;
  },

  async listUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, faskes: { select: { id: true, name: true } } },
    });
  },

  async createUser(adminId: string, input: { name: string; email: string; password: string; role: UserRole; faskesId?: string }) {
    if (input.role === 'FASKES_STAFF') {
      if (!input.faskesId) throw badRequest('Petugas faskes wajib terhubung ke faskes');
      const f = await prisma.faskes.findUnique({ where: { id: input.faskesId }, select: { isActive: true } });
      if (!f || !f.isActive) throw badRequest('Faskes tidak ditemukan atau tidak aktif');
    }
    return runInTx(async tx => {
      const user = await tx.user.create({
        data: {
          name: input.name, email: input.email.toLowerCase(), role: input.role,
          faskesId: input.role === 'FASKES_STAFF' ? input.faskesId : null,
          passwordHash: await bcrypt.hash(input.password, 10),
        },
        select: { id: true, name: true, email: true, role: true, faskesId: true },
      });
      await audit(tx, `admin:${adminId}`, 'user.create', user.id);
      return user;
    });
  },

  async setUserActive(adminId: string, id: string, isActive: boolean) {
    if (id === adminId && !isActive) throw badRequest('Tidak bisa menonaktifkan akun sendiri');
    return runInTx(async tx => {
      const user = await tx.user.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true } });
      await audit(tx, `admin:${adminId}`, isActive ? 'user.activate' : 'user.deactivate', id);
      return user;
    });
  },

  async auditLogs(page: number, pageSize: number, actor?: string) {
    const where = actor ? { actor: { contains: actor } } : {};
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },

  // impact numbers for the dinkes / jury slide: volume, outcome split, median time to fulfil
  async overview() {
    const [byStatus, donors, eligibleDonors, fulfilled, tickets] = await Promise.all([
      prisma.bloodRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.donor.count({ where: { isActive: true } }),
      prisma.donor.count({ where: { isActive: true, OR: [{ lastDonationAt: null }, { lastDonationAt: { lt: new Date(Date.now() - DISPATCH.eligibilityDays * 86400000) } }] } }),
      prisma.bloodRequest.findMany({ where: { status: 'FULFILLED' }, select: { createdAt: true, updatedAt: true }, take: 500, orderBy: { updatedAt: 'desc' } }),
      prisma.donorTicket.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const minutes = fulfilled.map(r => (r.updatedAt.getTime() - r.createdAt.getTime()) / 60000).sort((a, b) => a - b);
    const ticketMap = Object.fromEntries(tickets.map(t => [t.status, t._count._all]));
    const invited = Object.values(ticketMap).reduce((s, n) => s + n, 0);
    const accepted = (ticketMap.RESERVED || 0) + (ticketMap.ARRIVED || 0) + (ticketMap.SCREENED || 0) + (ticketMap.COLLECTED || 0) + (ticketMap.NO_SHOW || 0) + (ticketMap.SCREENING_FAILED || 0);
    return {
      requests: Object.fromEntries(byStatus.map(s => [s.status, s._count._all])),
      donors: { total: donors, eligible: eligibleDonors },
      tickets: ticketMap,
      acceptanceRate: invited ? Math.round((accepted / invited) * 100) : null,
      medianMinutesToFulfil: minutes.length ? Math.round(minutes[Math.floor(minutes.length / 2)]) : null,
    };
  },
};

import bcrypt from 'bcryptjs';
import { Component, FaskesType, Prisma, UserRole } from '@prisma/client';
import prisma from '../config/prisma';
import { BLOOD_TYPES, DISPATCH } from '../constants/blood';
import { badRequest, conflict, notFound } from '../utils/AppError';
import { ACTIVE_REQUEST, LIVE_DONOR, closeRequestTx, lockRequest, runInTx } from './dispatch.service';
import { audit } from './audit.service';

type Tx = Prisma.TransactionClient;

// locks every active super admin row first, so two admins demoting / removing each other at once cannot both pass.
// no-op when the target is not an active super admin
async function keepAnotherSuperAdmin(tx: Tx, id: string) {
  const admins = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE role = 'SUPER_ADMIN' AND isActive = true FOR UPDATE`;
  if (admins.some(a => a.id === id) && admins.length < 2) throw conflict('Harus tersisa minimal satu super admin aktif lain', 'LAST_SUPER_ADMIN');
}

async function assertFaskesNameFree(tx: Tx, name: string, exceptId?: string) {
  // the default collation compares case- and trailing-space-insensitively, same as the unique index
  const taken = await tx.faskes.findFirst({ where: { name, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
  if (taken) throw conflict('Nama faskes sudah dipakai', 'DUPLICATE');
}

export const adminService = {
  async listFaskes() {
    return prisma.faskes.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true, requests: true } } } });
  },

  async createFaskes(adminId: string, input: { name: string; type: FaskesType; area: string; address?: string; lat: number; lng: number }) {
    return runInTx(async tx => {
      await assertFaskesNameFree(tx, input.name);
      const f = await tx.faskes.create({ data: input });
      const components: Component[] = ['PRC', 'TC', 'WB'];
      await tx.stock.createMany({ data: components.flatMap(component => BLOOD_TYPES.map(bloodType => ({ faskesId: f.id, component, bloodType, quantity: 0 }))) });
      await audit(tx, `admin:${adminId}`, 'faskes.create', f.id);
      return f;
    });
  },

  async updateFaskes(adminId: string, id: string, input: { name: string; type: FaskesType; area: string; address?: string; lat: number; lng: number }) {
    return runInTx(async (tx, outbox) => {
      const before = await tx.faskes.findUnique({ where: { id } });
      if (!before) throw notFound('Faskes tidak ditemukan');
      await assertFaskesNameFree(tx, input.name, id);
      const f = await tx.faskes.update({ where: { id }, data: { ...input, address: input.address || null } });
      const changed = (['name', 'type', 'area', 'address', 'lat', 'lng'] as const).filter(k => before[k] !== f[k]);
      await audit(tx, `admin:${adminId}`, 'faskes.update', id, { changed });
      outbox.faskes.add(id);
      return f;
    });
  },

  // a faskes with history is only deactivated: requests, donations and transfers are medical records
  async deleteFaskes(adminId: string, id: string) {
    try {
      return await runInTx(async tx => {
        // the row lock holds back new users / requests pointing here (their fk check waits on it) until we are done
        await tx.$queryRaw`SELECT id FROM faskes WHERE id = ${id} FOR UPDATE`;
        const f = await tx.faskes.findUnique({
          where: { id },
          include: { _count: { select: { users: true, requests: true, donations: true, transfersIn: true, transfersOut: true } } },
        });
        if (!f) throw notFound('Faskes tidak ditemukan');
        const c = f._count;
        if (c.users) throw conflict(`Masih ada ${c.users} akun petugas di faskes ini. Hapus atau pindahkan akunnya dulu.`, 'HAS_USERS');
        const history = c.requests + c.donations + c.transfersIn + c.transfersOut;
        if (history) throw conflict('Faskes ini sudah punya riwayat permintaan, donasi, atau mutasi. Nonaktifkan saja agar riwayatnya tetap utuh.', 'HAS_HISTORY');
        // stocks and stock movements cascade with the faskes row
        await tx.faskes.delete({ where: { id } });
        await audit(tx, `admin:${adminId}`, 'faskes.delete', id, { name: f.name, type: f.type });
        return { deleted: true };
      });
    } catch (e) {
      // some other table still references the faskes
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw conflict('Faskes masih dipakai data lain, nonaktifkan saja', 'IN_USE');
      throw e;
    }
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
          passwordHash: await bcrypt.hash(input.password, 12),
        },
        select: { id: true, name: true, email: true, role: true, faskesId: true },
      });
      await audit(tx, `admin:${adminId}`, 'user.create', user.id);
      return user;
    });
  },

  async updateUser(adminId: string, id: string, input: { name: string; email: string; role: UserRole; faskesId?: string; password?: string }) {
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound('Akun tidak ditemukan');
    // the acting admin keeps their own role, so the system always has at least one super admin
    if (id === adminId && input.role !== 'SUPER_ADMIN') throw badRequest('Tidak bisa mengubah peran akun sendiri');
    const faskesId = input.role === 'FASKES_STAFF' ? input.faskesId : null;
    if (input.role === 'FASKES_STAFF') {
      if (!faskesId) throw badRequest('Petugas faskes wajib terhubung ke faskes');
      // only a new assignment needs an active faskes; staff of a paused faskes can still be renamed or get a new password
      if (before.role !== 'FASKES_STAFF' || before.faskesId !== faskesId) {
        const f = await prisma.faskes.findUnique({ where: { id: faskesId }, select: { isActive: true } });
        if (!f || !f.isActive) throw badRequest('Faskes tidak ditemukan atau tidak aktif');
      }
    }
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
    const email = input.email.toLowerCase();
    const changed = [
      ...(before.name !== input.name ? ['name'] : []),
      ...(before.email !== email ? ['email'] : []),
      ...(before.role !== input.role ? ['role'] : []),
      ...(before.faskesId !== faskesId ? ['faskes'] : []),
      ...(passwordHash ? ['password'] : []),
    ];
    // role, faskes and password are baked into sessions: changing any of them signs the owner out everywhere
    const revoke = changed.some(k => ['role', 'faskes', 'password'].includes(k));
    return runInTx(async tx => {
      if (input.role !== 'SUPER_ADMIN') await keepAnotherSuperAdmin(tx, id);
      const user = await tx.user.update({
        where: { id },
        data: { name: input.name, email, role: input.role, faskesId, ...(passwordHash ? { passwordHash } : {}), ...(revoke ? { tokenVersion: { increment: 1 } } : {}) },
        select: { id: true, name: true, email: true, role: true, faskesId: true },
      });
      await audit(tx, `admin:${adminId}`, 'user.update', id, { changed });
      return { ...user, sessionsRevoked: revoke, self: id === adminId };
    });
  },

  async deleteUser(adminId: string, id: string) {
    if (id === adminId) throw badRequest('Tidak bisa menghapus akun sendiri');
    const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true, role: true } });
    if (!user) throw notFound('Akun tidak ditemukan');
    return runInTx(async tx => {
      await keepAnotherSuperAdmin(tx, id);
      await tx.user.delete({ where: { id } });
      // the audit trail keeps who the deleted actor id belonged to
      await audit(tx, `admin:${adminId}`, 'user.delete', id, user);
      return { deleted: true };
    });
  },

  async setUserActive(adminId: string, id: string, isActive: boolean) {
    if (id === adminId && !isActive) throw badRequest('Tidak bisa menonaktifkan akun sendiri');
    return runInTx(async tx => {
      if (!isActive) await keepAnotherSuperAdmin(tx, id);
      // deactivation also burns the token generation, so old sessions stay dead after a later reactivation
      const user = await tx.user.update({
        where: { id }, data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) }, select: { id: true, isActive: true },
      });
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
      prisma.donor.count({ where: LIVE_DONOR }),
      prisma.donor.count({ where: { ...LIVE_DONOR, OR: [{ lastDonationAt: null }, { lastDonationAt: { lt: new Date(Date.now() - DISPATCH.eligibilityDays * 86400000) } }] } }),
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

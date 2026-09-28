import { Component, Urgency } from '@prisma/client';
import prisma from '../config/prisma';
import { COMPONENT_LABEL, DISPATCH, compatibleDonorTypes } from '../constants/blood';
import { distanceKm, randomCode } from '../utils/helpers';
import { badRequest, conflict, forbidden, notFound } from '../utils/AppError';
import {
  ACTIVE_REQUEST, addEvent, closeRequestTx, computeProgress, lockRequest, progressOf, runInTx, setStatus, settle, takeFromShelf, ticketCounts,
} from './dispatch.service';
import { audit } from './audit.service';
import { forFamily, forPublic, forStaff } from './presenters';

const detailInclude = {
  faskes: true,
  waves: { orderBy: { wave: 'asc' as const } },
  events: { orderBy: { createdAt: 'asc' as const } },
  tickets: { include: { donor: { select: { id: true, name: true, bloodType: true } } }, orderBy: { distanceKm: 'asc' as const } },
};

export interface CreateRequestInput {
  patientName: string;
  medicalRecordNo: string;
  ward: string;
  faskesId: string;
  bloodType: string;
  component: Component;
  bagsNeeded: number;
  urgency: Urgency;
}

export interface DispatchInput {
  radiusKm: number;
  deadlineHours: number;
  escalateMinutes: number;
  allowCompatible: boolean;
}

async function uniqueCode(prefix: string, field: 'code' | 'publicToken', length: number) {
  for (let i = 0; i < 5; i++) {
    const value = prefix + randomCode(length);
    if (!(await prisma.bloodRequest.findFirst({ where: { [field]: value }, select: { id: true } }))) return value;
  }
  throw new Error('Gagal membuat kode unik');
}

// staff-side guard: request must belong to the staff's faskes and be in one of the allowed states
function assertOwned(req: { faskesId: string; status: string }, faskesId: string, allowed: string[]) {
  if (req.faskesId !== faskesId) throw forbidden('Permintaan ini bukan untuk faskes Anda');
  if (!allowed.includes(req.status)) throw conflict(`Aksi tidak bisa dilakukan saat status ${req.status}`, 'INVALID_STATE');
}

export const requestService = {
  // ---------- family ----------

  async create(phone: string, input: CreateRequestInput, letter: Express.Multer.File) {
    const faskes = await prisma.faskes.findUnique({ where: { id: input.faskesId } });
    if (!faskes || !faskes.isActive || faskes.type !== 'RS') throw badRequest('Rumah sakit tidak valid');
    const active = await prisma.bloodRequest.count({ where: { phone, status: { in: ACTIVE_REQUEST } } });
    if (active >= 3) throw conflict('Maksimal 3 pengajuan aktif per nomor WhatsApp', 'TOO_MANY_ACTIVE');

    const code = await uniqueCode('REQ-', 'code', 6);
    const publicToken = await uniqueCode('', 'publicToken', 16);
    return runInTx(async (tx, outbox) => {
      const req = await tx.bloodRequest.create({
        data: {
          ...input, code, publicToken, phone,
          letterPath: letter.filename, letterName: letter.originalname.slice(0, 180), letterMime: letter.mimetype,
        },
      });
      await addEvent(tx, req.id, 'Pengajuan dibuat oleh keluarga pasien');
      await audit(tx, `pemohon:${phone}`, 'request.create', req.code);
      outbox.faskes.add(req.faskesId);
      outbox.requests.add(req.id);
      return { id: req.id, code: req.code, status: req.status };
    });
  },

  async listMine(phone: string) {
    const list = await prisma.bloodRequest.findMany({ where: { phone }, orderBy: { createdAt: 'desc' }, include: { faskes: true }, take: 20 });
    const counts = await ticketCounts(prisma, list.map(r => r.id));
    return list.map(r => {
      const p = computeProgress(r, counts.get(r.id) || {});
      return { id: r.id, code: r.code, status: r.status, bloodType: r.bloodType, component: r.component, faskes: r.faskes.name, progress: p, createdAt: r.createdAt };
    });
  },

  async getForFamily(phone: string, id: string) {
    const req = await prisma.bloodRequest.findUnique({ where: { id }, include: detailInclude });
    if (!req || req.phone !== phone) throw notFound('Permintaan tidak ditemukan');
    return forFamily(req, await progressOf(prisma, req));
  },

  async cancelByFamily(phone: string, id: string) {
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      if (req.phone !== phone) throw notFound('Permintaan tidak ditemukan');
      if (!ACTIVE_REQUEST.includes(req.status)) throw conflict('Permintaan sudah tidak aktif', 'INVALID_STATE');
      await closeRequestTx(tx, req, 'Dibatalkan oleh keluarga pasien', 'Permintaan dibatalkan keluarga. Anda tidak perlu datang.', outbox);
      await audit(tx, `pemohon:${phone}`, 'request.cancel', req.code);
      return { id, status: req.status };
    });
  },

  // ---------- public ----------

  async publicCard(token: string) {
    const req = await prisma.bloodRequest.findUnique({ where: { publicToken: token }, include: { faskes: true } });
    if (!req || req.status === 'PENDING_VERIFICATION') throw notFound('Kartu tidak dikenali. Waspadai pesan palsu.');
    return forPublic(req, await progressOf(prisma, req));
  },

  // ---------- staff ----------

  async listForFaskes(faskesId: string, scope: 'active' | 'history') {
    const list = await prisma.bloodRequest.findMany({
      where: { faskesId, status: scope === 'active' ? { in: ACTIVE_REQUEST } : { notIn: ACTIVE_REQUEST } },
      include: detailInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: scope === 'active' ? 100 : 50,
    });
    const counts = await ticketCounts(prisma, list.map(r => r.id));
    return list.map(r => forStaff(r, computeProgress(r, counts.get(r.id) || {})));
  },

  async getForStaff(faskesId: string, id: string) {
    const req = await prisma.bloodRequest.findUnique({ where: { id }, include: detailInclude });
    if (!req || req.faskesId !== faskesId) throw notFound('Permintaan tidak ditemukan');
    return forStaff(req, await progressOf(prisma, req));
  },

  async letterFor(faskesId: string, id: string) {
    const req = await prisma.bloodRequest.findUnique({ where: { id }, select: { faskesId: true, letterPath: true, letterName: true, letterMime: true } });
    if (!req || req.faskesId !== faskesId || !req.letterPath) throw notFound('Surat pengantar tidak ditemukan');
    return req;
  },

  // internal stock first, then nearby faskes, before any public broadcast
  async stockOptions(faskesId: string, id: string) {
    const req = await prisma.bloodRequest.findUnique({ where: { id }, include: { faskes: true } });
    if (!req || req.faskesId !== faskesId) throw notFound('Permintaan tidak ditemukan');
    const types = compatibleDonorTypes(req.bloodType, req.component, true);
    const rows = await prisma.stock.findMany({ where: { component: req.component, bloodType: { in: types }, faskes: { isActive: true } }, include: { faskes: true } });
    const home = types.map(type => ({ bloodType: type, quantity: rows.find(r => r.faskesId === faskesId && r.bloodType === type)?.quantity || 0 }));
    const byFaskes = new Map<string, { faskes: { id: string; name: string; area: string }; distanceKm: number; quantity: number }>();
    for (const r of rows) {
      if (r.faskesId === faskesId || r.quantity <= 0) continue;
      const entry = byFaskes.get(r.faskesId) || { faskes: { id: r.faskes.id, name: r.faskes.name, area: r.faskes.area }, distanceKm: Math.round(distanceKm(req.faskes, r.faskes) * 10) / 10, quantity: 0 };
      entry.quantity += r.quantity;
      byFaskes.set(r.faskesId, entry);
    }
    const pending = await prisma.stockTransfer.findMany({ where: { requestId: id, status: 'PENDING' }, select: { fromFaskesId: true, quantity: true } });
    return {
      pendingTransfers: pending,
      compatibleTypes: types,
      home,
      homeTotal: home.reduce((s, h) => s + h.quantity, 0),
      elsewhere: [...byFaskes.values()].sort((a, b) => a.distanceKm - b.distanceKm),
    };
  },

  async approve(faskesId: string, userId: string, id: string) {
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      assertOwned(req, faskesId, ['PENDING_VERIFICATION']);
      await setStatus(tx, req, 'APPROVED', 'Surat pengantar diverifikasi petugas faskes', outbox);
      await audit(tx, `staff:${userId}`, 'request.approve', req.code);
      return { id, status: req.status };
    });
  },

  async reject(faskesId: string, userId: string, id: string, reason: string) {
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      assertOwned(req, faskesId, ['PENDING_VERIFICATION']);
      await setStatus(tx, req, 'REJECTED', `Ditolak: ${reason}`, outbox, { rejectReason: reason });
      await audit(tx, `staff:${userId}`, 'request.reject', req.code, { reason });
      return { id, status: req.status };
    });
  },

  async allocate(faskesId: string, userId: string, id: string) {
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      assertOwned(req, faskesId, ['APPROVED', 'BROADCASTING']);
      const { uncovered } = await progressOf(tx, req);
      const { taken } = await takeFromShelf(tx, req, faskesId, uncovered, `Alokasi ke ${req.code}`, outbox);
      if (!taken) throw conflict('Tidak ada stok kompatibel yang bisa dialokasikan', 'NO_STOCK');
      await tx.bloodRequest.update({ where: { id }, data: { allocatedFromStock: { increment: taken } } });
      await addEvent(tx, id, `${taken} kantong dialokasikan dari stok internal`);
      await audit(tx, `staff:${userId}`, 'stock.allocate', req.code, { taken });
      outbox.requests.add(id);
      await settle(tx, req, outbox);
      return { allocated: taken };
    });
  },

  // inter-faskes transfer step 1: the requesting faskes asks; nothing moves until the source approves
  async requestTransfer(faskesId: string, userId: string, id: string, fromFaskesId: string) {
    if (fromFaskesId === faskesId) throw badRequest('Sumber mutasi harus faskes lain');
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      assertOwned(req, faskesId, ['APPROVED', 'BROADCASTING']);
      const source = await tx.faskes.findUnique({ where: { id: fromFaskesId } });
      if (!source || !source.isActive) throw badRequest('Faskes sumber tidak valid');
      if (await tx.stockTransfer.findFirst({ where: { requestId: id, fromFaskesId, status: 'PENDING' } })) {
        throw conflict('Permintaan mutasi ke faskes ini masih menunggu persetujuan', 'TRANSFER_PENDING');
      }
      const { uncovered } = await progressOf(tx, req);
      if (!uncovered) throw conflict('Kebutuhan sudah tertutup', 'NOTHING_TO_TRANSFER');
      const available = await tx.stock.aggregate({
        where: { faskesId: fromFaskesId, component: req.component, bloodType: { in: compatibleDonorTypes(req.bloodType, req.component, true) } },
        _sum: { quantity: true },
      });
      const quantity = Math.min(uncovered, available._sum.quantity || 0);
      if (!quantity) throw conflict('Faskes sumber tidak punya stok kompatibel', 'NO_STOCK');
      const transfer = await tx.stockTransfer.create({ data: { requestId: id, fromFaskesId, toFaskesId: faskesId, quantity, requestedBy: userId } });
      await addEvent(tx, id, `Permintaan mutasi ${quantity} kantong dikirim ke ${source.name}`);
      await audit(tx, `staff:${userId}`, 'transfer.request', req.code, { from: fromFaskesId, quantity });
      outbox.faskes.add(fromFaskesId);
      outbox.faskes.add(faskesId);
      outbox.requests.add(id);
      return { transferId: transfer.id, quantity, source: source.name };
    });
  },

  async listTransfers(faskesId: string) {
    const include = {
      request: { select: { code: true, bloodType: true, component: true, urgency: true } },
      fromFaskes: { select: { name: true } },
      toFaskes: { select: { name: true } },
    };
    const [incoming, outgoing] = await Promise.all([
      prisma.stockTransfer.findMany({ where: { fromFaskesId: faskesId, status: 'PENDING' }, include, orderBy: { createdAt: 'asc' } }),
      prisma.stockTransfer.findMany({ where: { toFaskesId: faskesId }, include, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const shape = (t: (typeof incoming)[number]) => ({
      id: t.id, status: t.status, quantity: t.quantity, moved: t.moved, note: t.note, createdAt: t.createdAt, decidedAt: t.decidedAt,
      request: { ...t.request, componentLabel: COMPONENT_LABEL[t.request.component] }, from: t.fromFaskes.name, to: t.toFaskes.name,
    });
    return { incoming: incoming.map(shape), outgoing: outgoing.map(shape) };
  },

  // step 2: the source faskes approves (units move and are allocated) or rejects
  async decideTransfer(faskesId: string, userId: string, transferId: string, approve: boolean) {
    const peek = await prisma.stockTransfer.findUnique({ where: { id: transferId }, select: { requestId: true } });
    if (!peek) throw notFound('Permintaan mutasi tidak ditemukan');
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, peek.requestId);
      const t = await tx.stockTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { fromFaskes: true, toFaskes: true } });
      if (t.fromFaskesId !== faskesId) throw forbidden('Mutasi ini bukan dari faskes Anda');
      if (t.status !== 'PENDING') throw conflict('Permintaan mutasi sudah diproses', 'INVALID_STATE');
      outbox.faskes.add(t.fromFaskesId);
      outbox.faskes.add(t.toFaskesId);
      outbox.requests.add(req.id);
      const decided = { decidedBy: userId, decidedAt: new Date() };

      if (!approve) {
        await tx.stockTransfer.update({ where: { id: transferId }, data: { status: 'REJECTED', note: 'Ditolak faskes sumber', ...decided } });
        await addEvent(tx, req.id, `Mutasi dari ${t.fromFaskes.name} ditolak`);
        await audit(tx, `staff:${userId}`, 'transfer.reject', req.code);
        return { status: 'REJECTED', moved: 0 };
      }
      const { uncovered } = await progressOf(tx, req);
      const need = ['APPROVED', 'BROADCASTING'].includes(req.status) ? Math.min(t.quantity, uncovered) : 0;
      const { taken, byType } = await takeFromShelf(tx, req, faskesId, need, `Mutasi ke ${t.toFaskes.name} (${req.code})`, outbox);
      if (!taken) {
        await tx.stockTransfer.update({ where: { id: transferId }, data: { status: 'CANCELLED', note: need ? 'Stok sumber sudah habis' : 'Kebutuhan sudah tertutup', ...decided } });
        return { status: 'CANCELLED', moved: 0 };
      }
      // one movement per blood type actually moved, so an O- unit is never logged as A+
      await tx.stockMovement.createMany({
        data: byType.map(b => ({
          faskesId: t.toFaskesId, component: req.component, bloodType: b.bloodType, quantity: b.quantity, kind: 'TRANSFER' as const,
          note: `Diterima dari ${t.fromFaskes.name} untuk ${req.code}`, requestId: req.id,
        })),
      });
      await tx.stockTransfer.update({ where: { id: transferId }, data: { status: 'APPROVED', moved: taken, ...decided } });
      await tx.bloodRequest.update({ where: { id: req.id }, data: { allocatedFromStock: { increment: taken } } });
      await addEvent(tx, req.id, `${taken} kantong dimutasi dari ${t.fromFaskes.name}`);
      await audit(tx, `staff:${userId}`, 'transfer.approve', req.code, { moved: taken });
      await settle(tx, req, outbox);
      return { status: 'APPROVED', moved: taken };
    });
  },

  async startDispatch(faskesId: string, userId: string, id: string, input: DispatchInput) {
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      assertOwned(req, faskesId, ['APPROVED']);
      const now = new Date();
      await tx.bloodRequest.update({
        where: { id },
        data: {
          dispatchStartedAt: now, radiusKm: Math.min(input.radiusKm, DISPATCH.maxRadiusKm), wave: 1, waveStartedAt: now,
          escalateMinutes: input.escalateMinutes, deadline: new Date(now.getTime() + input.deadlineHours * 3600000),
          allowCompatible: req.component === 'PRC' && input.allowCompatible, maxedOut: false,
        },
      });
      await setStatus(tx, req, 'BROADCASTING', `Panggilan darurat aktif, radius awal ${input.radiusKm} km`, outbox);
      await audit(tx, `staff:${userId}`, 'dispatch.start', req.code, { ...input });
      await settle(tx, req, outbox);
      const wave = await tx.dispatchWave.findUnique({ where: { requestId_wave: { requestId: id, wave: 1 } } });
      return { id, status: 'BROADCASTING', funnel: wave };
    });
  },

  async close(faskesId: string, userId: string, id: string) {
    return runInTx(async (tx, outbox) => {
      const req = await lockRequest(tx, id);
      assertOwned(req, faskesId, ACTIVE_REQUEST);
      await closeRequestTx(tx, req, 'Panggilan ditutup oleh petugas faskes', 'Permintaan ditutup faskes. Anda tidak perlu datang.', outbox);
      await audit(tx, `staff:${userId}`, 'request.close', req.code);
      return { id, status: req.status };
    });
  },
};

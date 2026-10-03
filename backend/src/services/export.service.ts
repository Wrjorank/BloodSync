import writeXlsxFile, { SheetData } from 'write-excel-file/node';
import prisma from '../config/prisma';
import { env } from '../config/env';
import {
  BLOOD_TYPES, BloodType, COMPONENT_LABEL, DISPATCH, MOVEMENT_KIND_LABEL, REQUEST_STATUS_LABEL, TICKET_STATUS_LABEL, TRANSFER_STATUS_LABEL, URGENCY_LABEL,
} from '../constants/blood';
import { maskName, maskPhone } from '../utils/helpers';

export const STAFF_DATASETS = ['stok', 'mutasi-stok', 'permintaan', 'tiket-donor', 'mutasi-antarfaskes'] as const;
export const ADMIN_DATASETS = ['audit', 'faskes', 'akun', 'permintaan', 'pendonor'] as const;
export type StaffDataset = (typeof STAFF_DATASETS)[number];
export type AdminDataset = (typeof ADMIN_DATASETS)[number];

export interface ExportFilter {
  from?: string; // yyyy-mm-dd, wib
  to?: string;
  actor?: string;
}

export interface ExportFile {
  buffer: Buffer;
  filename: string;
  rows: number;
}

// newest rows first; anything older needs a narrower date range
export const MAX_ROWS = 10000;

type CellValue = string | number | boolean | Date | null | undefined;
interface Col<T> {
  header: string;
  width?: number;
  value: (row: T) => CellValue;
}

// excel has no time zones, so timestamps are written as wall-clock wib
const WIB_MS = 7 * 3600000;
const wib = (d: Date | null | undefined) => (d ? new Date(d.getTime() + WIB_MS) : null);

function range(f: ExportFilter) {
  if (!f.from && !f.to) return undefined;
  return {
    ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000+07:00`) } : {}),
    ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999+07:00`) } : {}),
  };
}

// every value is typed explicitly: a string is always written as text, so "=cmd|..." typed by a user
// lands in the sheet as plain text and never becomes a formula
async function workbook<T>(sheet: string, rows: T[], cols: Col<T>[]): Promise<Buffer> {
  const header = cols.map(c => ({ value: c.header, type: String, fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#E11D48' }));
  const body = rows.map(r => cols.map(c => {
    const v = c.value(r);
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return { value: wib(v)!, type: Date, format: 'dd/mm/yyyy hh:mm' };
    if (typeof v === 'number') return { value: v, type: Number };
    if (typeof v === 'boolean') return { value: v ? 'Ya' : 'Tidak', type: String };
    return { value: v, type: String };
  }));
  return writeXlsxFile([header, ...body] as SheetData, {
    sheet,
    stickyRowsCount: 1,
    columns: cols.map(c => ({ width: c.width ?? 16 })),
  }).toBuffer();
}

const stamp = () => new Date(Date.now() + WIB_MS).toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

async function file<T>(name: string, sheet: string, rows: T[], cols: Col<T>[]): Promise<ExportFile> {
  return { buffer: await workbook(sheet, rows, cols), filename: `bloodsync_${name}_${stamp()}.xlsx`, rows: rows.length };
}

export const exportService = {
  // ---------- faskes staff: only their own faskes ----------
  async staff(faskesId: string, dataset: StaffDataset, f: ExportFilter): Promise<ExportFile> {
    const faskes = await prisma.faskes.findUniqueOrThrow({ where: { id: faskesId }, select: { name: true } });
    const name = `${slug(faskes.name)}_${dataset}`;

    switch (dataset) {
      case 'stok': {
        // same order as the stock matrix on screen: PRC, TC, WB x A+ .. O-
        const order = (r: { component: string; bloodType: string }) =>
          Object.keys(COMPONENT_LABEL).indexOf(r.component) * 10 + BLOOD_TYPES.indexOf(r.bloodType as BloodType);
        const rows = (await prisma.stock.findMany({ where: { faskesId } })).sort((a, b) => order(a) - order(b));
        return file(name, 'Stok', rows, [
          { header: 'Komponen', value: r => COMPONENT_LABEL[r.component] },
          { header: 'Golongan', width: 10, value: r => r.bloodType },
          { header: 'Jumlah (kantong)', value: r => r.quantity },
          { header: 'Status', width: 12, value: r => (r.quantity === 0 ? 'Kosong' : r.quantity < DISPATCH.lowStockThreshold ? 'Menipis' : 'Aman') },
          { header: 'Diperbarui (WIB)', width: 18, value: r => r.updatedAt },
        ]);
      }

      case 'mutasi-stok': {
        const rows = await prisma.stockMovement.findMany({
          where: { faskesId, createdAt: range(f) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS,
          include: { request: { select: { code: true } } },
        });
        return file(name, 'Mutasi Stok', rows, [
          { header: 'Waktu (WIB)', width: 18, value: r => r.createdAt },
          { header: 'Jenis', width: 14, value: r => MOVEMENT_KIND_LABEL[r.kind] },
          { header: 'Komponen', value: r => COMPONENT_LABEL[r.component] },
          { header: 'Golongan', width: 10, value: r => r.bloodType },
          { header: 'Jumlah (kantong)', value: r => r.quantity },
          { header: 'Keterangan', width: 48, value: r => r.note },
          { header: 'Kode permintaan', value: r => r.request?.code },
        ]);
      }

      case 'permintaan': {
        const rows = await prisma.bloodRequest.findMany({ where: { faskesId, createdAt: range(f) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS });
        return file(name, 'Permintaan', rows, [
          { header: 'Kode', width: 12, value: r => r.code },
          { header: 'Dibuat (WIB)', width: 18, value: r => r.createdAt },
          { header: 'Status', width: 20, value: r => REQUEST_STATUS_LABEL[r.status] },
          { header: 'Urgensi', width: 12, value: r => URGENCY_LABEL[r.urgency] },
          { header: 'Nama pasien', width: 24, value: r => r.patientName },
          { header: 'No. rekam medis', value: r => r.medicalRecordNo },
          { header: 'Ruang', value: r => r.ward },
          { header: 'Golongan', width: 10, value: r => r.bloodType },
          { header: 'Komponen', value: r => COMPONENT_LABEL[r.component] },
          { header: 'Kantong dibutuhkan', value: r => r.bagsNeeded },
          { header: 'Dari stok', width: 10, value: r => r.allocatedFromStock },
          { header: 'Dari pendonor', width: 13, value: r => r.bagsCollected },
          { header: 'WA keluarga', value: r => maskPhone(r.phone) },
          { header: 'Alasan penolakan', width: 32, value: r => r.rejectReason },
          { header: 'Panggilan dimulai (WIB)', width: 20, value: r => r.dispatchStartedAt },
          { header: 'Radius (km)', width: 11, value: r => r.radiusKm },
          { header: 'Tenggat (WIB)', width: 18, value: r => r.deadline },
          { header: 'Diperbarui (WIB)', width: 18, value: r => r.updatedAt },
        ]);
      }

      case 'tiket-donor': {
        const rows = await prisma.donorTicket.findMany({
          where: { request: { faskesId }, invitedAt: range(f) }, orderBy: { invitedAt: 'desc' }, take: MAX_ROWS,
          include: { donor: { select: { name: true, bloodType: true } }, request: { select: { code: true } } },
        });
        return file(name, 'Tiket Donor', rows, [
          { header: 'Kode tiket', width: 12, value: r => r.code },
          { header: 'Kode permintaan', value: r => r.request.code },
          { header: 'Pendonor', width: 24, value: r => r.donor.name },
          { header: 'Golongan', width: 10, value: r => r.donor.bloodType },
          { header: 'Status', width: 16, value: r => TICKET_STATUS_LABEL[r.status] },
          { header: 'Gelombang', width: 11, value: r => r.wave },
          { header: 'Jarak (km)', width: 11, value: r => Math.round(r.distanceKm * 10) / 10 },
          { header: 'Diundang (WIB)', width: 18, value: r => r.invitedAt },
          { header: 'Merespons (WIB)', width: 18, value: r => r.respondedAt },
          { header: 'Tiba (WIB)', width: 18, value: r => r.arrivedAt },
          { header: 'Skrining', width: 10, value: r => (r.screeningPass === null ? null : r.screeningPass ? 'Lolos' : 'Gagal') },
          { header: 'Tekanan darah', width: 14, value: r => (r.bpSystolic ? `${r.bpSystolic}/${r.bpDiastolic}` : null) },
          { header: 'Hb (g/dL)', width: 10, value: r => r.hemoglobin },
          { header: 'Berat (kg)', width: 10, value: r => r.weightKg },
          { header: 'Alasan gagal skrining', width: 36, value: r => (Array.isArray(r.screeningReasons) ? r.screeningReasons.join('; ') : null) },
          { header: 'Diambil (WIB)', width: 18, value: r => r.collectedAt },
        ]);
      }

      case 'mutasi-antarfaskes': {
        const rows = await prisma.stockTransfer.findMany({
          where: { OR: [{ fromFaskesId: faskesId }, { toFaskesId: faskesId }], createdAt: range(f) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS,
          include: { fromFaskes: { select: { name: true } }, toFaskes: { select: { name: true } }, request: { select: { code: true } } },
        });
        return file(name, 'Mutasi Antarfaskes', rows, [
          { header: 'Dibuat (WIB)', width: 18, value: r => r.createdAt },
          { header: 'Arah', width: 10, value: r => (r.toFaskesId === faskesId ? 'Masuk' : 'Keluar') },
          { header: 'Kode permintaan', value: r => r.request.code },
          { header: 'Dari', width: 26, value: r => r.fromFaskes.name },
          { header: 'Ke', width: 26, value: r => r.toFaskes.name },
          { header: 'Diminta (kantong)', value: r => r.quantity },
          { header: 'Dipindah (kantong)', value: r => r.moved },
          { header: 'Status', width: 12, value: r => TRANSFER_STATUS_LABEL[r.status] },
          { header: 'Diputuskan (WIB)', width: 18, value: r => r.decidedAt },
          { header: 'Catatan', width: 28, value: r => r.note },
        ]);
      }
    }
  },

  // ---------- super admin: system-wide, without patient identities ----------
  async admin(dataset: AdminDataset, f: ExportFilter): Promise<ExportFile> {
    switch (dataset) {
      case 'audit': {
        const rows = await prisma.auditLog.findMany({
          where: { createdAt: range(f), ...(f.actor ? { actor: { contains: f.actor } } : {}) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS,
        });
        return file('audit-log', 'Audit Log', rows, [
          { header: 'Waktu (WIB)', width: 18, value: r => r.createdAt },
          { header: 'Aktor', width: 44, value: r => r.actor },
          { header: 'Aksi', width: 22, value: r => r.action },
          { header: 'Referensi', width: 38, value: r => r.ref },
          { header: 'Detail', width: 48, value: r => (r.meta === null ? null : JSON.stringify(r.meta)) },
        ]);
      }

      case 'faskes': {
        const rows = await prisma.faskes.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true, requests: true } } } });
        return file('faskes', 'Faskes', rows, [
          { header: 'ID', width: 38, value: r => r.id },
          { header: 'Nama', width: 28, value: r => r.name },
          { header: 'Tipe', width: 8, value: r => r.type },
          { header: 'Wilayah', width: 28, value: r => r.area },
          { header: 'Alamat', width: 32, value: r => r.address },
          { header: 'Lat', width: 11, value: r => r.lat },
          { header: 'Lng', width: 11, value: r => r.lng },
          { header: 'Aktif', width: 8, value: r => r.isActive },
          { header: 'Jumlah petugas', value: r => r._count.users },
          { header: 'Jumlah permintaan', value: r => r._count.requests },
          { header: 'Terdaftar (WIB)', width: 18, value: r => r.createdAt },
        ]);
      }

      case 'akun': {
        // never select passwordHash
        const rows = await prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          select: { name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, faskes: { select: { name: true } } },
        });
        return file('akun-petugas', 'Akun', rows, [
          { header: 'Nama', width: 28, value: r => r.name },
          { header: 'Email', width: 30, value: r => r.email },
          { header: 'Peran', width: 16, value: r => (r.role === 'SUPER_ADMIN' ? 'Super admin' : 'Petugas faskes') },
          { header: 'Faskes', width: 28, value: r => r.faskes?.name },
          { header: 'Aktif', width: 8, value: r => r.isActive },
          { header: 'Login terakhir (WIB)', width: 20, value: r => r.lastLoginAt },
          { header: 'Dibuat (WIB)', width: 18, value: r => r.createdAt },
        ]);
      }

      case 'permintaan': {
        const rows = await prisma.bloodRequest.findMany({
          where: { createdAt: range(f) }, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, include: { faskes: { select: { name: true } } },
        });
        return file('permintaan-semua-faskes', 'Permintaan', rows, [
          { header: 'Kode', width: 12, value: r => r.code },
          { header: 'Faskes', width: 28, value: r => r.faskes.name },
          { header: 'Dibuat (WIB)', width: 18, value: r => r.createdAt },
          { header: 'Status', width: 20, value: r => REQUEST_STATUS_LABEL[r.status] },
          { header: 'Urgensi', width: 12, value: r => URGENCY_LABEL[r.urgency] },
          { header: 'Golongan', width: 10, value: r => r.bloodType },
          { header: 'Komponen', value: r => COMPONENT_LABEL[r.component] },
          { header: 'Kantong dibutuhkan', value: r => r.bagsNeeded },
          { header: 'Dari stok', width: 10, value: r => r.allocatedFromStock },
          { header: 'Dari pendonor', width: 13, value: r => r.bagsCollected },
          { header: 'Waktu terpenuhi (menit)', width: 22, value: r => (r.status === 'FULFILLED' ? minutesBetween(r.createdAt, r.updatedAt) : null) },
        ]);
      }

      case 'pendonor': {
        const rows = await prisma.donor.findMany({
          where: env.isProduction ? { isSimulated: false } : {}, orderBy: { createdAt: 'desc' }, take: MAX_ROWS,
          include: { _count: { select: { donations: true } } },
        });
        return file('pendonor', 'Pendonor', rows, [
          { header: 'Nama', width: 20, value: r => maskName(r.name) },
          { header: 'No. WA', width: 16, value: r => maskPhone(r.phone) },
          { header: 'Golongan', width: 10, value: r => r.bloodType },
          { header: 'Kecamatan', width: 18, value: r => r.area },
          { header: 'Aktif', width: 8, value: r => r.isActive },
          { header: 'Donor terakhir (WIB)', width: 20, value: r => r.lastDonationAt },
          { header: 'Jumlah donasi', width: 14, value: r => r._count.donations },
          { header: 'Tingkat respons (%)', width: 18, value: r => Math.round(r.responseRate * 100) },
          { header: 'Terdaftar (WIB)', width: 18, value: r => r.createdAt },
          { header: 'Data dummy', width: 12, value: r => r.isSimulated },
        ]);
      }
    }
  },
};

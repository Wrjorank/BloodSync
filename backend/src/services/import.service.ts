import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import writeXlsxFile, { SheetData } from 'write-excel-file/node';
import { Component, FaskesType, UserRole } from '@prisma/client';
import prisma from '../config/prisma';
import { BLOOD_TYPES, BloodType, COMPONENT_LABEL } from '../constants/blood';
import { AppError, badRequest } from '../utils/AppError';
import { readSheet } from '../utils/xlsx';
import { runInTx } from './dispatch.service';
import { audit } from './audit.service';

export const STAFF_IMPORTS = ['stok'] as const;
export const ADMIN_IMPORTS = ['faskes', 'akun'] as const;
export type StaffImport = (typeof STAFF_IMPORTS)[number];
export type AdminImport = (typeof ADMIN_IMPORTS)[number];

const SHEET = 'Data';

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ImportPreview {
  dataset: string;
  total: number;
  valid: number;
  issues: ImportIssue[];
  // what will happen, shown before the user confirms
  summary: string;
  preview: Record<string, string | number>[];
}

interface Column {
  key: string;
  header: string;
  required: boolean;
  width: number;
  hint: string;
  // shown instead of the generic "column not found" when this column is missing
  missing?: string;
}

interface Parsed<T> {
  rows: { n: number; value: T }[];
  issues: ImportIssue[];
  total: number;
}

// ---------- shared helpers ----------

const HEADER_STYLE = { type: String, fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: '#E11D48' };
const headerText = (c: Column) => (c.required ? `${c.header} *` : c.header);
const norm = (s: string) => s.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const firstIssue = (e: z.ZodError) => e.issues[0]?.message || 'Data tidak valid';
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
// whole counts: "10.000" typed as text is indonesian for ten thousand; any other non-integer is refused, not rounded
const int = (s: string) => {
  const t = s.replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

function instructions(columns: Column[], maxRows: number, notes: string[]): SheetData {
  return [
    [{ value: 'Kolom', ...HEADER_STYLE }, { value: 'Wajib', ...HEADER_STYLE }, { value: 'Keterangan', ...HEADER_STYLE }],
    ...columns.map(c => [c.header, c.required ? 'Ya' : 'Tidak', c.hint]),
    [],
    [{ value: 'Catatan', type: String, fontWeight: 'bold' as const }],
    [`- Isi data di sheet "${SHEET}" mulai baris 2. Jangan ganti nama sheet atau judul kolom.`],
    [`- Maksimal ${maxRows} baris per file. Baris kosong diabaikan.`],
    ['- File diperiksa dulu sebelum disimpan. Selama masih ada baris yang salah, tidak ada data yang masuk.'],
    ...notes.map(n => [`- ${n}`]),
  ];
}

async function template(columns: Column[], rows: (string | number)[][], extraSheets: { sheet: string; data: SheetData; columns?: { width: number }[] }[]) {
  const data: SheetData = [columns.map(c => ({ value: headerText(c), ...HEADER_STYLE })), ...rows];
  return writeXlsxFile([
    { sheet: SHEET, data, stickyRowsCount: 1, columns: columns.map(c => ({ width: c.width })) },
    ...extraSheets,
  ]).toBuffer();
}

// maps the header row to column keys, then turns every data row into a record
function parse<T>(buffer: Buffer, columns: Column[], maxRows: number, toValue: (r: Record<string, string>) => T | string): Parsed<T> {
  const sheet = readSheet(buffer, SHEET, maxRows);
  if (!sheet.length) throw badRequest('File kosong. Isi data di sheet "Data" mulai baris 2.');
  const [head, ...body] = sheet;
  const index = new Map(head.cells.map((h, i) => [norm(h), i]));
  const missing = columns.filter(c => c.required && !index.has(norm(c.header)));
  const special = missing.find(c => c.missing);
  if (special) throw badRequest(special.missing!, 'TEMPLATE_OUTDATED');
  if (missing.length) throw badRequest(`Kolom ${missing.map(c => `"${c.header}"`).join(', ')} tidak ditemukan. Gunakan template terbaru.`);
  if (!body.length) throw badRequest('Belum ada data. Isi data di sheet "Data" mulai baris 2.');
  if (body.length > maxRows) throw badRequest(`Maksimal ${maxRows} baris data per file`);

  const rows: Parsed<T>['rows'] = [];
  const issues: ImportIssue[] = [];
  for (const { n, cells } of body) {
    const record = Object.fromEntries(columns.map(c => [c.key, cells[index.get(norm(c.header)) ?? -1] ?? '']));
    const value = toValue(record);
    if (typeof value === 'string') issues.push({ row: n, message: value });
    else rows.push({ n, value });
  }
  return { rows, issues, total: body.length };
}

function preview(dataset: string, p: Parsed<unknown>, summary: string, items: Record<string, string | number>[]): ImportPreview {
  return { dataset, total: p.total, valid: p.rows.length, issues: p.issues.slice(0, 200), summary, preview: items.slice(0, 50) };
}

function assertClean(p: Parsed<unknown>) {
  if (p.issues.length) {
    throw new AppError(422, `${p.issues.length} baris masih salah. Perbaiki lalu unggah ulang; belum ada data yang disimpan.`, 'IMPORT_INVALID', { issues: p.issues.slice(0, 200) });
  }
}

// ---------- stok (stock opname for the staff's own faskes) ----------

const STOCK_COLUMNS: Column[] = [
  { key: 'component', header: 'Komponen', required: true, width: 16, hint: 'PRC, Trombosit, atau Whole Blood' },
  { key: 'bloodType', header: 'Golongan', required: true, width: 12, hint: 'A+, A-, B+, B-, AB+, AB-, O+, O-' },
  {
    key: 'baseline', header: 'Stok sistem (jangan diubah)', required: true, width: 26,
    hint: 'Diisi otomatis dengan stok sistem saat template diunduh. Jangan diubah: selisih dihitung dari angka ini.',
    missing: 'File ini memakai template lama (tanpa kolom "Stok sistem"). Unduh template baru, isi hitungan fisik di sana, lalu unggah ulang.',
  },
  { key: 'quantity', header: 'Jumlah', required: true, width: 12, hint: 'Jumlah kantong hasil hitung fisik (bilangan bulat 0 sampai 10000, tanpa desimal)' },
  { key: 'note', header: 'Keterangan', required: false, width: 36, hint: 'Opsional, misal "Stock opname akhir bulan"' },
];
const STOCK_MAX = 100;
const COMPONENT_ALIAS: Record<string, Component> = { prc: 'PRC', trombosit: 'TC', tc: 'TC', 'whole blood': 'WB', wb: 'WB' };
const count = (label: string) =>
  z.string().min(1, `${label} wajib diisi`).transform(int).refine(n => Number.isInteger(n) && n >= 0 && n <= 10000, `${label} harus bilangan bulat 0 sampai 10000 (tanpa desimal)`);

const stockRow = z.object({
  component: z.string().transform(s => COMPONENT_ALIAS[norm(s)]).refine(Boolean, 'Komponen harus PRC, Trombosit, atau Whole Blood'),
  bloodType: z.string().transform(s => s.toUpperCase().replace(/\s/g, '')).refine(s => BLOOD_TYPES.includes(s as BloodType), 'Golongan harus salah satu dari A+, A-, B+, B-, AB+, AB-, O+, O-'),
  baseline: count('Stok sistem'),
  quantity: count('Jumlah'),
  note: z.string().max(120, 'Keterangan maksimal 120 karakter'),
});
type StockRow = { component: Component; bloodType: string; baseline: number; quantity: number; note: string };

// the physical count is applied as a difference to today's stock: anything that moved since the template was
// downloaded (allocations, donor bags, manual adjustments) stays counted instead of being reverted
function opnameIssue(r: StockRow, current: number) {
  const after = current + r.quantity - r.baseline;
  return after < 0
    ? `Stok ${COMPONENT_LABEL[r.component]} ${r.bloodType} sekarang ${current}; selisih ${r.quantity - r.baseline} membuatnya minus. Unduh template baru lalu hitung ulang.`
    : null;
}

function parseStock(buffer: Buffer) {
  const p = parse<StockRow>(buffer, STOCK_COLUMNS, STOCK_MAX, r => {
    const v = stockRow.safeParse(r);
    return v.success ? (v.data as StockRow) : firstIssue(v.error);
  });
  const seen = new Map<string, number>();
  for (const { n, value } of p.rows) {
    const key = `${value.component}|${value.bloodType}`;
    if (seen.has(key)) p.issues.push({ row: n, message: `${COMPONENT_LABEL[value.component]} ${value.bloodType} sudah ada di baris ${seen.get(key)}` });
    else seen.set(key, n);
  }
  p.rows = p.rows.filter(({ n }) => !p.issues.some(i => i.row === n));
  p.issues.sort((a, b) => a.row - b.row);
  return p;
}

// ---------- faskes ----------

const FASKES_COLUMNS: Column[] = [
  { key: 'name', header: 'Nama', required: true, width: 30, hint: 'Nama faskes, 3 sampai 120 karakter. Tidak boleh sama dengan faskes yang sudah ada.' },
  { key: 'type', header: 'Jenis', required: true, width: 14, hint: 'RS (rumah sakit) atau UDD (UDD PMI)' },
  { key: 'area', header: 'Wilayah', required: true, width: 28, hint: 'Kecamatan dan kota, misal "Pasar Minggu, Jakarta Selatan"' },
  { key: 'address', header: 'Alamat', required: false, width: 36, hint: 'Opsional, maksimal 200 karakter' },
  { key: 'lat', header: 'Latitude', required: true, width: 12, hint: 'Angka desimal, misal -6.2850 (wilayah Indonesia: -11 sampai 6)' },
  { key: 'lng', header: 'Longitude', required: true, width: 12, hint: 'Angka desimal, misal 106.8430 (wilayah Indonesia: 94 sampai 142)' },
];
const FASKES_MAX = 200;
const FASKES_TYPE: Record<string, FaskesType> = { rs: 'RS', 'rumah sakit': 'RS', udd: 'UDD', 'udd pmi': 'UDD' };
const text = (min: number, max: number, label: string) => z.string().min(min, `${label} minimal ${min} karakter`).max(max, `${label} maksimal ${max} karakter`);

const faskesRow = z.object({
  name: text(3, 120, 'Nama'),
  type: z.string().transform(s => FASKES_TYPE[norm(s)]).refine(Boolean, 'Jenis harus RS atau UDD'),
  area: text(3, 120, 'Wilayah'),
  address: z.string().max(200, 'Alamat maksimal 200 karakter'),
  lat: z.string().min(1, 'Latitude wajib diisi').transform(num).refine(n => Number.isFinite(n) && n >= -11 && n <= 6, 'Latitude harus angka antara -11 dan 6'),
  lng: z.string().min(1, 'Longitude wajib diisi').transform(num).refine(n => Number.isFinite(n) && n >= 94 && n <= 142, 'Longitude harus angka antara 94 dan 142'),
});
type FaskesRow = { name: string; type: FaskesType; area: string; address: string; lat: number; lng: number };

async function parseFaskes(buffer: Buffer) {
  const p = parse<FaskesRow>(buffer, FASKES_COLUMNS, FASKES_MAX, r => {
    const v = faskesRow.safeParse(r);
    return v.success ? (v.data as FaskesRow) : firstIssue(v.error);
  });
  const existing = new Set((await prisma.faskes.findMany({ select: { name: true } })).map(f => norm(f.name)));
  const seen = new Map<string, number>();
  for (const { n, value } of p.rows) {
    const key = norm(value.name);
    if (existing.has(key)) p.issues.push({ row: n, message: `Faskes "${value.name}" sudah terdaftar` });
    else if (seen.has(key)) p.issues.push({ row: n, message: `Nama sama dengan baris ${seen.get(key)}` });
    else seen.set(key, n);
  }
  p.rows = p.rows.filter(({ n }) => !p.issues.some(i => i.row === n));
  p.issues.sort((a, b) => a.row - b.row);
  return p;
}

// ---------- akun petugas ----------

const USER_COLUMNS: Column[] = [
  { key: 'name', header: 'Nama', required: true, width: 28, hint: 'Nama lengkap, 2 sampai 80 karakter' },
  { key: 'email', header: 'Email', required: true, width: 30, hint: 'Email unik untuk login' },
  { key: 'role', header: 'Peran', required: true, width: 18, hint: '"Petugas faskes" atau "Super admin"' },
  { key: 'faskes', header: 'Faskes', required: false, width: 30, hint: 'Wajib untuk petugas faskes: nama atau ID faskes aktif (lihat sheet "Daftar Faskes")' },
];
// bcrypt cost 12 is deliberately slow (~0.25 s each), so account batches stay small enough to finish well inside a request
const USER_MAX = 50;
const ROLE: Record<string, UserRole> = { 'petugas faskes': 'FASKES_STAFF', petugas: 'FASKES_STAFF', 'super admin': 'SUPER_ADMIN', admin: 'SUPER_ADMIN' };

const userRow = z.object({
  name: text(2, 80, 'Nama'),
  email: z.string().transform(s => s.toLowerCase()).pipe(z.email('Email tidak valid').max(120, 'Email maksimal 120 karakter')),
  role: z.string().transform(s => ROLE[norm(s)]).refine(Boolean, 'Peran harus "Petugas faskes" atau "Super admin"'),
  faskes: z.string().max(120),
});
type UserRow = { name: string; email: string; role: UserRole; faskesId: string | null; faskesName: string };

async function parseUsers(buffer: Buffer) {
  const faskes = await prisma.faskes.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  // names are unique in the db; a key that still matches two faskes (an id equal to another's name,
  // names differing only in inner spaces) is refused instead of silently picking one
  const byKey = new Map<string, { id: string; name: string } | null>();
  for (const f of faskes) {
    for (const k of new Set([norm(f.id), norm(f.name)])) byKey.set(k, byKey.has(k) && byKey.get(k)?.id !== f.id ? null : f);
  }
  const p = parse<UserRow>(buffer, USER_COLUMNS, USER_MAX, r => {
    const v = userRow.safeParse(r);
    if (!v.success) return firstIssue(v.error);
    const d = v.data as { name: string; email: string; role: UserRole; faskes: string };
    if (d.role === 'SUPER_ADMIN') return { name: d.name, email: d.email, role: d.role, faskesId: null, faskesName: '' };
    if (!d.faskes) return 'Faskes wajib diisi untuk petugas faskes';
    const f = byKey.get(norm(d.faskes));
    if (f === null) return `Faskes "${d.faskes}" cocok dengan lebih dari satu faskes. Pakai ID faskes dari sheet "Daftar Faskes"`;
    if (!f) return `Faskes "${d.faskes}" tidak ditemukan atau tidak aktif`;
    return { name: d.name, email: d.email, role: d.role, faskesId: f.id, faskesName: f.name };
  });
  const taken = new Set((await prisma.user.findMany({ where: { email: { in: p.rows.map(r => r.value.email) } }, select: { email: true } })).map(u => u.email));
  const seen = new Map<string, number>();
  for (const { n, value } of p.rows) {
    if (taken.has(value.email)) p.issues.push({ row: n, message: `Email ${value.email} sudah dipakai akun lain` });
    else if (seen.has(value.email)) p.issues.push({ row: n, message: `Email sama dengan baris ${seen.get(value.email)}` });
    else seen.set(value.email, n);
  }
  p.rows = p.rows.filter(({ n }) => !p.issues.some(i => i.row === n));
  p.issues.sort((a, b) => a.row - b.row);
  return p;
}

// meets the same policy as accounts created by hand: 12+ chars with upper, lower, digit and symbol
function initialPassword(): string {
  for (;;) {
    const p = `${crypto.randomBytes(9).toString('base64url')}#${crypto.randomInt(10, 100)}`;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) return p;
  }
}

// ---------- public api ----------

export const importService = {
  async staffTemplate(faskesId: string, dataset: StaffImport) {
    void dataset;
    // the system count at download time is the baseline; Jumlah starts equal so staff only overwrite what they counted differently
    const stock = await prisma.stock.findMany({ where: { faskesId } });
    const rows = (Object.keys(COMPONENT_LABEL) as Component[]).flatMap(component =>
      BLOOD_TYPES.map(t => {
        const q = stock.find(s => s.component === component && s.bloodType === t)?.quantity ?? 0;
        return [COMPONENT_LABEL[component], t, q, q, ''];
      }));
    return template(STOCK_COLUMNS, rows, [{
      sheet: 'Petunjuk', columns: [{ width: 26 }, { width: 8 }, { width: 80 }],
      data: instructions(STOCK_COLUMNS, STOCK_MAX, [
        'Kolom "Stok sistem (jangan diubah)" berisi stok saat template diunduh, dan kolom Jumlah awalnya sama. Ubah Jumlah sesuai hitungan fisik; baris yang Jumlah-nya sama dengan stok sistem dilewati.',
        'Yang disimpan adalah selisihnya (Jumlah dikurangi stok sistem), ditambahkan ke stok terkini. Mutasi setelah template diunduh (alokasi, kantong dari pendonor, penyesuaian manual) tidak tertimpa.',
        'Jika selisih membuat stok terkini menjadi minus, baris itu ditolak. Unduh template baru lalu hitung ulang.',
        'Template lama tanpa kolom "Stok sistem" tidak diterima lagi.',
        'Selisih dicatat otomatis sebagai mutasi stok masuk/keluar dan tercatat di audit log.',
      ]),
    }]);
  },

  async adminTemplate(dataset: AdminImport) {
    if (dataset === 'faskes') {
      return template(FASKES_COLUMNS, [], [{
        sheet: 'Petunjuk', columns: [{ width: 14 }, { width: 8 }, { width: 80 }],
        data: instructions(FASKES_COLUMNS, FASKES_MAX, [
          'Matriks stok 0 kantong dibuat otomatis untuk setiap faskes baru.',
          'Contoh baris: RSUD Pasar Minggu | RS | Pasar Minggu, Jakarta Selatan | Jl. TB Simatupang | -6.2850 | 106.8430',
        ]),
      }]);
    }
    const faskes = await prisma.faskes.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true } });
    return template(USER_COLUMNS, [], [
      {
        sheet: 'Petunjuk', columns: [{ width: 14 }, { width: 8 }, { width: 80 }],
        data: instructions(USER_COLUMNS, USER_MAX, [
          'Kata sandi awal dibuat otomatis oleh sistem dan diunduh sekali setelah import. Bagikan langsung ke pemilik akun lalu hapus filenya.',
        ]),
      },
      {
        sheet: 'Daftar Faskes', columns: [{ width: 32 }, { width: 8 }, { width: 40 }],
        data: [[{ value: 'Nama', ...HEADER_STYLE }, { value: 'Jenis', ...HEADER_STYLE }, { value: 'ID', ...HEADER_STYLE }], ...faskes.map(f => [f.name, f.type, f.id])],
      },
    ]);
  },

  // ---------- staff: stock opname ----------
  async previewStaff(faskesId: string, dataset: StaffImport, buffer: Buffer): Promise<ImportPreview> {
    void dataset;
    const p = parseStock(buffer);
    const current = await prisma.stock.findMany({ where: { faskesId } });
    const now = (r: StockRow) => current.find(s => s.component === r.component && s.bloodType === r.bloodType)?.quantity ?? 0;
    for (const { n, value } of p.rows) {
      const issue = value.quantity !== value.baseline && opnameIssue(value, now(value));
      if (issue) p.issues.push({ row: n, message: issue });
    }
    p.rows = p.rows.filter(({ n }) => !p.issues.some(i => i.row === n));
    p.issues.sort((a, b) => a.row - b.row);
    const changed = p.rows.filter(r => r.value.quantity !== r.value.baseline);
    return preview(dataset, p, `${changed.length} stok berubah, ${p.rows.length - changed.length} tetap.`, changed.map(({ value: r }) => ({
      Komponen: COMPONENT_LABEL[r.component], Golongan: r.bloodType, 'Stok sistem saat unduh': r.baseline, 'Hitungan fisik': r.quantity,
      Selisih: r.quantity - r.baseline, 'Stok sekarang': now(r), Sesudah: now(r) + r.quantity - r.baseline,
    })));
  },

  async commitStaff(faskesId: string, userId: string, dataset: StaffImport, buffer: Buffer) {
    const p = parseStock(buffer);
    assertClean(p);
    return runInTx(async (tx, outbox) => {
      let changed = 0;
      const issues: ImportIssue[] = [];
      for (const { n, value: r } of p.rows) {
        const delta = r.quantity - r.baseline;
        if (!delta) continue;
        await tx.stock.upsert({
          where: { faskesId_component_bloodType: { faskesId, component: r.component, bloodType: r.bloodType } },
          create: { faskesId, component: r.component, bloodType: r.bloodType, quantity: 0 },
          update: {},
        });
        // locked read: an allocation running at the same moment cannot be overwritten silently
        const [row] = await tx.$queryRaw<{ id: string; quantity: number }[]>`
          SELECT id, quantity FROM stocks WHERE faskesId = ${faskesId} AND component = ${r.component} AND bloodType = ${r.bloodType} FOR UPDATE`;
        const issue = opnameIssue(r, Number(row.quantity));
        if (issue) {
          issues.push({ row: n, message: issue });
          continue;
        }
        changed++;
        await tx.stock.update({ where: { id: row.id }, data: { quantity: { increment: delta } } });
        await tx.stockMovement.create({
          data: { faskesId, component: r.component, bloodType: r.bloodType, quantity: delta, kind: delta > 0 ? 'IN' : 'OUT', note: `Stock opname (import Excel)${r.note ? `: ${r.note}` : ''}` },
        });
      }
      // all or nothing: rolls back the rows already applied
      if (issues.length) assertClean({ rows: [], issues, total: p.total });
      await audit(tx, `staff:${userId}`, `import.${dataset}`, undefined, { rows: p.rows.length, changed });
      outbox.faskes.add(faskesId);
      return { imported: p.rows.length, changed };
    });
  },

  // ---------- admin ----------
  async previewAdmin(dataset: AdminImport, buffer: Buffer): Promise<ImportPreview> {
    if (dataset === 'faskes') {
      const p = await parseFaskes(buffer);
      return preview(dataset, p, `${p.rows.length} faskes baru akan ditambahkan.`, p.rows.map(({ value: f }) => ({
        Nama: f.name, Jenis: f.type, Wilayah: f.area, Latitude: f.lat, Longitude: f.lng,
      })));
    }
    const p = await parseUsers(buffer);
    return preview(dataset, p, `${p.rows.length} akun baru akan dibuat dengan kata sandi awal acak.`, p.rows.map(({ value: u }) => ({
      Nama: u.name, Email: u.email, Peran: u.role === 'SUPER_ADMIN' ? 'Super admin' : 'Petugas faskes', Faskes: u.faskesName,
    })));
  },

  async commitAdmin(adminId: string, dataset: AdminImport, buffer: Buffer) {
    if (dataset === 'faskes') {
      const p = await parseFaskes(buffer);
      assertClean(p);
      const components = Object.keys(COMPONENT_LABEL) as Component[];
      return runInTx(async tx => {
        for (const { value: f } of p.rows) {
          const created = await tx.faskes.create({ data: { name: f.name, type: f.type, area: f.area, address: f.address || null, lat: f.lat, lng: f.lng } });
          await tx.stock.createMany({ data: components.flatMap(component => BLOOD_TYPES.map(bloodType => ({ faskesId: created.id, component, bloodType, quantity: 0 }))) });
        }
        await audit(tx, `admin:${adminId}`, 'import.faskes', undefined, { rows: p.rows.length });
        return { imported: p.rows.length };
      });
    }

    const p = await parseUsers(buffer);
    assertClean(p);
    // hash before the transaction (bcrypt must not hold row locks), one at a time with the async api
    // so the event loop keeps serving other requests in between
    const accounts: (UserRow & { password: string; passwordHash: string })[] = [];
    for (const { value: u } of p.rows) {
      const password = initialPassword();
      accounts.push({ ...u, password, passwordHash: await bcrypt.hash(password, 12) });
    }
    await runInTx(async tx => {
      await tx.user.createMany({ data: accounts.map(a => ({ name: a.name, email: a.email, role: a.role, faskesId: a.faskesId, passwordHash: a.passwordHash })) });
      await audit(tx, `admin:${adminId}`, 'import.akun', undefined, { rows: accounts.length });
    });
    // the only copy of the initial passwords; never stored or logged
    const file = await writeXlsxFile([
      [
        { value: 'Nama', ...HEADER_STYLE }, { value: 'Email', ...HEADER_STYLE }, { value: 'Peran', ...HEADER_STYLE },
        { value: 'Faskes', ...HEADER_STYLE }, { value: 'Kata sandi awal', ...HEADER_STYLE },
      ],
      ...accounts.map(a => [a.name, a.email, a.role === 'SUPER_ADMIN' ? 'Super admin' : 'Petugas faskes', a.faskesName, a.password]
        .map(v => ({ value: v, type: String }))),
    ] as SheetData, { sheet: 'Akun Baru', stickyRowsCount: 1, columns: [{ width: 28 }, { width: 30 }, { width: 16 }, { width: 30 }, { width: 22 }] }).toBuffer();
    return { imported: accounts.length, credentials: file };
  },
};

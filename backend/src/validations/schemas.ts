import { z } from 'zod';
import { AREAS, BLOOD_TYPES } from '../constants/blood';
import { isValidPhone, normalizePhone } from '../utils/helpers';
import { ADMIN_DATASETS, STAFF_DATASETS } from '../services/export.service';
import { ADMIN_IMPORTS, STAFF_IMPORTS } from '../services/import.service';

const phone = z.string().transform(normalizePhone).refine(isValidPhone, 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)');
const bloodType = z.enum(BLOOD_TYPES, { message: 'Golongan darah tidak valid' });
const component = z.enum(['PRC', 'TC', 'WB'], { message: 'Komponen darah tidak valid' });
const id = z.string().min(1).max(64);
const idParam = z.object({ id });
const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} minimal ${min} karakter`).max(max, `${label} maksimal ${max} karakter`);

export const staffLoginSchema = z.object({
  body: z.object({ email: z.email('Email tidak valid').max(120), password: z.string().min(1, 'Kata sandi wajib diisi').max(128) }),
});

export const otpRequestSchema = z.object({
  body: z.object({ phone, purpose: z.enum(['FAMILY', 'DONOR']) }),
});

export const otpVerifySchema = z.object({
  body: z.object({ phone, purpose: z.enum(['FAMILY', 'DONOR']), code: z.string().regex(/^\d{6}$/, 'Kode OTP 6 digit') }),
});

// multipart form: numbers arrive as strings
export const createRequestSchema = z.object({
  body: z.object({
    patientName: text(2, 120, 'Nama pasien'),
    medicalRecordNo: text(1, 40, 'Nomor rekam medis'),
    ward: text(1, 80, 'Ruang perawatan'),
    faskesId: id,
    bloodType,
    component,
    bagsNeeded: z.coerce.number().int().min(1, 'Minimal 1 kantong').max(10, 'Maksimal 10 kantong'),
    urgency: z.enum(['KRITIS', 'MENDESAK', 'TERJADWAL']),
  }),
});

export const idParamSchema = z.object({ params: idParam });

export const rejectSchema = z.object({ params: idParam, body: z.object({ reason: text(3, 200, 'Alasan') }) });

export const transferSchema = z.object({ params: idParam, body: z.object({ fromFaskesId: id }) });

export const dispatchSchema = z.object({
  params: idParam,
  body: z.object({
    radiusKm: z.number().min(1).max(15),
    deadlineHours: z.number().min(0.5).max(48),
    escalateMinutes: z.number().int().min(1).max(120),
    allowCompatible: z.boolean().default(false),
  }),
});

export const scanSchema = z.object({ body: z.object({ code: z.string().trim().min(4).max(24) }) });

export const screeningSchema = z.object({
  params: idParam,
  body: z.object({
    sys: z.number().int().min(50).max(250),
    dia: z.number().int().min(30).max(150),
    hb: z.number().min(3).max(25),
    weight: z.number().min(25).max(250),
  }),
});

export const requestListSchema = z.object({ query: z.object({ scope: z.enum(['active', 'history']).default('active') }) });

export const adjustStockSchema = z.object({
  body: z.object({
    component,
    bloodType,
    delta: z.number().int().refine(n => n !== 0, 'Perubahan stok tidak boleh 0').refine(n => Math.abs(n) <= 500, 'Perubahan terlalu besar'),
    note: text(3, 160, 'Keterangan'),
  }),
});

export const limitSchema = z.object({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }) });

const area = z.string().refine(a => a in AREAS, 'Kecamatan tidak dikenal');
// gps fix from the browser, limited to indonesia's bounding box
const gps = { lat: z.number().min(-11).max(6), lng: z.number().min(94).max(142) };

export const registerDonorSchema = z.object({
  body: z.object({
    name: text(2, 80, 'Nama'),
    bloodType,
    area,
    lat: gps.lat.optional(),
    lng: gps.lng.optional(),
    lastDonationAt: z.coerce.date().nullable().optional(),
    consentNotification: z.literal(true, { message: 'Izin notifikasi wajib disetujui' }),
    consentLocation: z.literal(true, { message: 'Izin lokasi wajib disetujui' }),
  }),
});

export const respondSchema = z.object({ params: idParam, body: z.object({ accept: z.boolean() }) });

export const updateAreaSchema = z.object({ body: z.object({ area }) });

export const updateLocationSchema = z.object({ body: z.object(gps) });

const faskesBody = z.object({
  name: text(3, 120, 'Nama faskes'),
  type: z.enum(['RS', 'UDD']),
  area: text(3, 120, 'Wilayah'),
  address: z.string().max(200).optional(),
  lat: z.number().min(-11, 'Latitude di luar wilayah Indonesia').max(6, 'Latitude di luar wilayah Indonesia'),
  lng: z.number().min(94, 'Longitude di luar wilayah Indonesia').max(142, 'Longitude di luar wilayah Indonesia'),
});
export const createFaskesSchema = z.object({ body: faskesBody });
export const updateFaskesSchema = z.object({ params: idParam, body: faskesBody });

export const activeSchema = z.object({ params: idParam, body: z.object({ isActive: z.boolean() }) });

const strongPassword = z.string()
  .min(12, 'Kata sandi minimal 12 karakter')
  .max(72, 'Kata sandi maksimal 72 karakter')
  .regex(/[a-z]/, 'Kata sandi harus memuat huruf kecil')
  .regex(/[A-Z]/, 'Kata sandi harus memuat huruf besar')
  .regex(/\d/, 'Kata sandi harus memuat angka')
  .regex(/[^A-Za-z0-9]/, 'Kata sandi harus memuat simbol');

const userBody = {
  name: text(2, 80, 'Nama'),
  email: z.email('Email tidak valid').max(120),
  role: z.enum(['FASKES_STAFF', 'SUPER_ADMIN']),
  faskesId: id.optional(),
};
export const createUserSchema = z.object({ body: z.object({ ...userBody, password: strongPassword }) });
// password is optional on edit: empty means "keep the current one"
export const updateUserSchema = z.object({
  params: idParam,
  body: z.object({ ...userBody, password: z.union([z.literal(''), strongPassword]).optional() }),
});

export const auditQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    actor: z.string().max(80).optional(),
  }),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').refine(d => !Number.isNaN(Date.parse(d)), 'Tanggal tidak valid');
const exportQuery = z.object({ from: day.optional(), to: day.optional(), actor: z.string().trim().max(80).optional() })
  .refine(q => !q.from || !q.to || q.from <= q.to, 'Tanggal awal harus sebelum tanggal akhir');

export const staffExportSchema = z.object({ params: z.object({ dataset: z.enum(STAFF_DATASETS, { message: 'Jenis data tidak dikenal' }) }), query: exportQuery });
export const adminExportSchema = z.object({ params: z.object({ dataset: z.enum(ADMIN_DATASETS, { message: 'Jenis data tidak dikenal' }) }), query: exportQuery });

const importQuery = z.object({ commit: z.enum(['1']).optional() });
export const staffImportSchema = z.object({ params: z.object({ dataset: z.enum(STAFF_IMPORTS, { message: 'Jenis data tidak bisa di-import' }) }), query: importQuery });
export const adminImportSchema = z.object({ params: z.object({ dataset: z.enum(ADMIN_IMPORTS, { message: 'Jenis data tidak bisa di-import' }) }), query: importQuery });

export const tokenParamSchema = z.object({ params: z.object({ token: z.string().regex(/^[A-Z2-9]{16}$/, 'Token tidak valid') }) });

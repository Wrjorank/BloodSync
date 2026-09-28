import { z } from 'zod';
import { AREAS, BLOOD_TYPES } from '../constants/blood';
import { isValidPhone, normalizePhone } from '../utils/helpers';

const phone = z.string().transform(normalizePhone).refine(isValidPhone, 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)');
const bloodType = z.enum(BLOOD_TYPES, { message: 'Golongan darah tidak valid' });
const component = z.enum(['PRC', 'TC', 'WB'], { message: 'Komponen darah tidak valid' });
const id = z.string().min(1).max(64);
const idParam = z.object({ id });
const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} minimal ${min} karakter`).max(max, `${label} maksimal ${max} karakter`);

export const staffLoginSchema = z.object({
  body: z.object({ email: z.email('Email tidak valid'), password: z.string().min(1, 'Kata sandi wajib diisi') }),
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

export const registerDonorSchema = z.object({
  body: z.object({
    name: text(2, 80, 'Nama'),
    bloodType,
    area,
    lastDonationAt: z.coerce.date().nullable().optional(),
    consentNotification: z.literal(true, { message: 'Izin notifikasi wajib disetujui' }),
    consentLocation: z.literal(true, { message: 'Izin lokasi wajib disetujui' }),
  }),
});

export const respondSchema = z.object({ params: idParam, body: z.object({ accept: z.boolean() }) });

export const updateAreaSchema = z.object({ body: z.object({ area }) });

export const createFaskesSchema = z.object({
  body: z.object({
    name: text(3, 120, 'Nama faskes'),
    type: z.enum(['RS', 'UDD']),
    area: text(3, 120, 'Wilayah'),
    address: z.string().max(200).optional(),
    lat: z.number().min(-11).max(6),
    lng: z.number().min(94).max(142),
  }),
});

export const activeSchema = z.object({ params: idParam, body: z.object({ isActive: z.boolean() }) });

export const createUserSchema = z.object({
  body: z.object({
    name: text(2, 80, 'Nama'),
    email: z.email('Email tidak valid'),
    password: z.string().min(8, 'Kata sandi minimal 8 karakter'),
    role: z.enum(['FASKES_STAFF', 'SUPER_ADMIN']),
    faskesId: id.optional(),
  }),
});

export const auditQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    actor: z.string().max(80).optional(),
  }),
});

export const tokenParamSchema = z.object({ params: z.object({ token: z.string().regex(/^[A-Z2-9]{16}$/, 'Token tidak valid') }) });

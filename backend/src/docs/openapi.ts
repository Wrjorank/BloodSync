// openapi 3.0 spec for every /api route, served at /docs. keep it in step with routes/index.ts and validations/schemas.ts
import { AREAS, BLOOD_TYPES } from '../constants/blood';
import { ADMIN_DATASETS, STAFF_DATASETS } from '../services/export.service';
import { ADMIN_IMPORTS, STAFF_IMPORTS } from '../services/import.service';

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const arr = (items: Schema): Schema => ({ type: 'array', items });
const str = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
const num = (extra: Schema = {}): Schema => ({ type: 'number', ...extra });
const int = (extra: Schema = {}): Schema => ({ type: 'integer', ...extra });
const bool = (extra: Schema = {}): Schema => ({ type: 'boolean', ...extra });
const date = (extra: Schema = {}): Schema => ({ type: 'string', format: 'date-time', ...extra });
const nullable = (s: Schema): Schema => ({ ...s, nullable: true });
const obj = (properties: Record<string, Schema>, required: string[] = Object.keys(properties), extra: Schema = {}): Schema =>
  ({ type: 'object', properties, ...(required.length ? { required } : {}), ...extra });

// every json success body is { success: true, message, data }
const ok = (data: Schema, description = 'Berhasil', message = 'Berhasil') => ({
  description,
  content: { 'application/json': { schema: obj({ success: bool({ example: true }), message: str({ example: message }), data }) } },
});
const errRef = (name: string) => ({ $ref: `#/components/responses/${name}` });
const xlsxFile = (description: string, headers: Record<string, unknown> = {}) => ({
  description,
  headers: { 'Content-Disposition': { schema: str(), description: 'attachment; filename="..."' }, ...headers },
  content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: str({ format: 'binary' }) } },
});
const json = (schema: Schema) => ({ required: true, content: { 'application/json': { schema } } });

const idParam = { name: 'id', in: 'path', required: true, schema: str({ maxLength: 64 }) };
const commitQuery = {
  name: 'commit', in: 'query', required: false, schema: str({ enum: ['1'] }),
  description: 'Tanpa parameter ini file hanya dicek (preview). Dengan `commit=1` semua baris disimpan dalam satu transaksi, atau tidak sama sekali.',
};
const exportQuery = [
  { name: 'from', in: 'query', schema: str({ format: 'date', example: '2026-10-01' }), description: 'Tanggal awal (YYYY-MM-DD, WIB)' },
  { name: 'to', in: 'query', schema: str({ format: 'date', example: '2026-10-31' }), description: 'Tanggal akhir (YYYY-MM-DD, WIB)' },
  { name: 'actor', in: 'query', schema: str({ maxLength: 80 }), description: 'Filter aktor (khusus dataset audit)' },
];

const staff = [{ staffAuth: [] }];
const admin = [{ adminAuth: [] }];
const donor = [{ donorAuth: [] }];
const familyPhone = [{ familyPhoneAuth: [] }];
const donorPhone = [{ donorPhoneAuth: [] }];
const common = { 400: errRef('BadRequest'), 401: errRef('Unauthorized'), 403: errRef('Forbidden') };

const faskesBody = obj({
  name: str({ minLength: 3, maxLength: 120, example: 'RSUD Tebet' }),
  type: ref('FaskesType'),
  area: str({ minLength: 3, maxLength: 120, example: 'Jakarta Selatan' }),
  address: str({ maxLength: 200 }),
  lat: num({ minimum: -11, maximum: 6, example: -6.226 }),
  lng: num({ minimum: 94, maximum: 142, example: 106.853 }),
}, ['name', 'type', 'area', 'lat', 'lng']);

const passwordRule = 'Minimal 12 karakter, maksimal 72, wajib huruf kecil, huruf besar, angka, dan simbol.';

const schemas: Record<string, Schema> = {
  // ---------- enums ----------
  BloodType: str({ enum: [...BLOOD_TYPES], example: 'O+' }),
  Component: str({ enum: ['PRC', 'TC', 'WB'], description: 'PRC = sel darah merah, TC = trombosit, WB = whole blood', example: 'PRC' }),
  Urgency: str({ enum: ['KRITIS', 'MENDESAK', 'TERJADWAL'] }),
  FaskesType: str({ enum: ['RS', 'UDD'], description: 'RS = rumah sakit, UDD = unit donor darah' }),
  UserRole: str({ enum: ['FASKES_STAFF', 'SUPER_ADMIN'] }),
  Area: str({ enum: Object.keys(AREAS), description: 'Kecamatan yang dikenal sistem (lihat GET /public/meta)' }),
  RequestStatus: str({ enum: ['PENDING_VERIFICATION', 'APPROVED', 'BROADCASTING', 'FULFILLED', 'CLOSED', 'REJECTED', 'EXPIRED'] }),
  TicketStatus: str({ enum: ['INVITED', 'DECLINED', 'RESERVED', 'ARRIVED', 'SCREENED', 'SCREENING_FAILED', 'COLLECTED', 'NO_SHOW', 'CANCELLED', 'WITHDRAWN', 'QUOTA_FULL'] }),
  TransferStatus: str({ enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] }),
  MovementKind: str({ enum: ['IN', 'OUT', 'TRANSFER'] }),
  PublicState: str({
    enum: ['PENDING', 'VERIFIED', 'OPEN', 'QUOTA_FULL', 'FULFILLED', 'CLOSED', 'EXPIRED'],
    description: 'Status ringkas untuk tampilan publik / keluarga. OPEN = masih butuh pendonor, QUOTA_FULL = sudah cukup pendonor yang menuju faskes.',
  }),

  // ---------- envelope ----------
  Error: obj({
    success: bool({ example: false }),
    error: obj({
      code: str({ example: 'VALIDATION_FAILED' }),
      message: str({ example: 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)' }),
      details: arr(obj({ path: str({ example: 'phone' }), message: str() })),
    }, ['code', 'message']),
  }),

  // ---------- shared ----------
  Progress: obj({
    needed: int({ description: 'Total kantong yang diminta' }),
    fulfilled: int({ description: 'Kantong yang sudah aman (stok + darah diambil)' }),
    fromStock: int(), collected: int(),
    reserved: int({ description: 'Pendonor yang sedang memegang slot / menuju faskes' }),
    invited: int(), declined: int(),
    remaining: int({ description: 'needed - fulfilled' }),
    uncovered: int({ description: 'Sisa kebutuhan yang belum tertutup pendonor manapun' }),
  }),
  Dispatch: nullable(obj({
    startedAt: date(), wave: int(), radiusKm: num(), waveStartedAt: nullable(date()), nextEscalationAt: nullable(date()),
    escalateMinutes: nullable(int()), deadline: nullable(date()), allowCompatible: bool(), maxedOut: bool(),
    funnel: nullable(obj({ inRadius: int(), typeMatch: int(), eligible: int(), capped: int(), invited: int() })),
    waves: arr(obj({ wave: int(), radiusKm: num(), invited: int() })),
  })),
  Event: obj({ at: date(), text: str() }),
  FaskesPublic: obj({ id: str(), name: str(), type: ref('FaskesType'), area: str(), lat: num(), lng: num() }),
  Faskes: obj({
    id: str(), name: str(), type: ref('FaskesType'), area: str(), address: nullable(str()), lat: num(), lng: num(),
    isActive: bool(), createdAt: date(), updatedAt: date(),
  }),
  FaskesWithCount: { allOf: [ref('Faskes'), obj({ _count: obj({ users: int(), requests: int() }) })] },
  FaskesInfo: obj({
    id: str(), name: str(), area: str(), lat: num(), lng: num(),
    mapsUrl: str({ format: 'uri', description: 'Link navigasi Google Maps' }),
  }),
  Meta: obj({
    bloodTypes: arr(ref('BloodType')),
    components: obj({}, [], { additionalProperties: str(), example: { PRC: 'PRC', TC: 'Trombosit', WB: 'Whole Blood' } }),
    urgencies: obj({}, [], { additionalProperties: str(), example: { KRITIS: 'Kritis', MENDESAK: 'Mendesak', TERJADWAL: 'Terjadwal' } }),
    areas: arr(str()),
    dispatch: obj({
      eligibilityDays: int(), overProvision: int(), radiusStepKm: int(), maxRadiusKm: int(), maxAlertsPerWeek: int(),
      travelSpeedKmh: int(), reservationBufferMin: int(), lowStockThreshold: int(),
    }),
    screening: obj({ hbMin: num(), hbMax: num(), sysMin: int(), sysMax: int(), diaMin: int(), diaMax: int(), weightMin: int() }),
    devInbox: bool({ description: 'true hanya di lokal tanpa gateway WhatsApp: OTP dikirim lewat socket event dev:whatsapp' }),
  }),

  // ---------- auth ----------
  StaffLoginResult: obj({
    token: str({ description: 'JWT petugas/admin, berlaku STAFF_TOKEN_TTL (default 12 jam)' }),
    user: obj({ id: str(), name: str(), email: str({ format: 'email' }), role: ref('UserRole') }),
    faskes: nullable(obj({ id: str(), name: str(), type: ref('FaskesType'), area: str() })),
  }),
  OtpVerifyResult: obj({
    token: str({ description: 'JWT. Untuk DONOR yang sudah terdaftar ini token pendonor; selain itu token nomor terverifikasi (berlaku PHONE_TOKEN_TTL, default 7 hari)' }),
    registered: bool({ description: 'Khusus purpose DONOR: true = langsung pakai token sebagai donorAuth, false = lanjut POST /donors/register' }),
  }),
  Session: {
    oneOf: [
      obj({ kind: str({ enum: ['phone'] }), purpose: str({ enum: ['FAMILY', 'DONOR'] }), phone: str({ example: '0812****7890' }) }),
      obj({ kind: str({ enum: ['donor'] }), phone: str(), donor: obj({ id: str(), name: str(), bloodType: ref('BloodType'), area: str(), isActive: bool() }) }),
      obj({
        kind: str({ enum: ['staff'] }),
        user: obj({ id: str(), name: str(), email: str(), role: ref('UserRole') }),
        faskes: nullable(obj({ id: str(), name: str(), type: ref('FaskesType'), area: str() })),
      }),
    ],
    discriminator: { propertyName: 'kind' },
  },

  // ---------- family ----------
  RequestCreated: obj({ id: str(), code: str({ example: 'REQ-7K2M9P' }), status: ref('RequestStatus') }),
  FamilyRequestItem: obj({
    id: str(), code: str(), status: ref('RequestStatus'), bloodType: ref('BloodType'), component: ref('Component'),
    faskes: str({ description: 'Nama faskes' }), progress: ref('Progress'), createdAt: date(),
  }),
  FamilyRequestDetail: obj({
    id: str(), code: str(), status: ref('RequestStatus'), bloodType: ref('BloodType'), component: ref('Component'), componentLabel: str(),
    bagsNeeded: int(), urgency: ref('Urgency'), progress: ref('Progress'), publicState: ref('PublicState'), createdAt: date(), updatedAt: date(),
    patientName: str(), ward: str(), rejectReason: nullable(str()),
    faskes: obj({ id: str(), name: str(), area: str() }),
    dispatch: ref('Dispatch'),
    publicToken: nullable(str({ description: 'Token kartu publik untuk dibagikan (GET /public/cards/{token}). null sebelum diverifikasi atau setelah ditutup.' })),
    enRoute: arr(obj({ name: str({ description: 'Nama disamarkan', example: 'B*** S***' }), bloodType: ref('BloodType'), status: ref('TicketStatus'), etaMin: nullable(int()) })),
    events: arr(ref('Event')),
  }),
  PublicCard: obj({
    code: str(), state: ref('PublicState'), bloodType: ref('BloodType'), component: ref('Component'), componentLabel: str(), urgency: ref('Urgency'),
    patient: str({ description: 'Nama pasien disamarkan' }),
    faskes: obj({ name: str(), area: str(), lat: num(), lng: num(), type: ref('FaskesType') }),
    needed: int(), fulfilled: int(), donorsOnTheWay: int(), deadline: nullable(date()), updatedAt: date(),
  }),

  // ---------- donor ----------
  DonorRegistered: obj({ token: str({ description: 'Token pendonor (donorAuth)' }), donorId: str() }),
  DonorDashboard: obj({
    profile: obj({ id: str(), name: str(), phone: str({ description: 'Disamarkan' }), bloodType: ref('BloodType'), area: str(), isActive: bool(), lastDonationAt: nullable(date()) }),
    eligibility: obj({ eligible: bool(), nextDate: nullable(date()), daysLeft: int(), cycleDays: int() }),
    reminder: nullable(obj({
      message: str(),
      lowStock: nullable(obj({ faskes: str(), distanceKm: num(), bloodType: ref('BloodType'), text: str() })),
    })),
    invite: {
      nullable: true,
      description: 'Panggilan darurat yang bisa dijawab. null/false bila tidak ada, pendonor tidak aktif, belum pulih, atau sedang memegang tiket lain.',
      oneOf: [
        obj({
          ticketId: str(), distanceKm: num(), etaMin: int(), wave: int(),
          request: obj({
            id: str(), code: str(), bloodType: ref('BloodType'), component: ref('Component'), componentLabel: str(), bagsNeeded: int(),
            urgency: ref('Urgency'), deadline: nullable(date()), compatibleOnly: bool({ description: 'true = golongan pendonor berbeda tetapi kompatibel' }),
          }),
          faskes: ref('FaskesInfo'),
        }),
        bool({ enum: [false] }),
      ],
    },
    activeTicket: nullable(obj({
      id: str(), code: str({ example: 'TKT-AB12CD' }), qrPayload: str({ example: 'BLOODSYNC:TKT-AB12CD', description: 'Isi QR yang di-scan petugas' }),
      status: ref('TicketStatus'), distanceKm: num(), etaMin: nullable(int()), reservedUntil: nullable(date()),
      request: obj({ code: str(), bloodType: ref('BloodType'), component: ref('Component'), componentLabel: str() }),
      faskes: ref('FaskesInfo'),
    })),
    outcome: nullable(obj({
      ticketId: str(), status: str({ enum: ['COLLECTED', 'SCREENING_FAILED', 'NO_SHOW', 'CANCELLED'] }), note: nullable(str()),
      reasons: nullable(arr(str())), newBadges: nullable(arr(str())), requestCode: str(), faskes: str(),
    }, undefined, { description: 'Hasil tiket terakhir yang belum dikonfirmasi. Tampilkan sekali lalu panggil POST /donors/me/tickets/{id}/ack.' })),
    badges: arr(obj({ id: str(), label: str(), icon: str({ description: 'Nama ikon Font Awesome' }), earned: bool() })),
    donations: arr(obj({ at: date(), faskes: nullable(str()), component: ref('Component'), requestCode: nullable(str()) })),
  }),
  RespondResult: {
    oneOf: [
      obj({ status: str({ enum: ['RESERVED'] }), code: str(), etaMin: int(), reservedUntil: date() }),
      obj({ status: str({ enum: ['DECLINED'] }) }),
      obj({ status: str({ enum: ['QUOTA_FULL', 'NOT_ELIGIBLE'] }), message: str() }),
    ],
  },

  // ---------- faskes staff ----------
  StockRow: obj({
    component: ref('Component'), label: str(),
    byType: obj({}, [], { additionalProperties: int(), example: { 'A+': 4, 'A-': 0, 'B+': 3, 'B-': 1, 'AB+': 2, 'AB-': 0, 'O+': 6, 'O-': 1 } }),
    total: int(), low: arr(ref('BloodType')),
  }),
  Movement: obj({ id: str(), component: ref('Component'), bloodType: ref('BloodType'), quantity: int(), kind: ref('MovementKind'), note: str(), createdAt: date() }),
  DonorPool: obj({ radiusKm: num(), total: int(), eligible: int(), byType: arr(obj({ bloodType: ref('BloodType'), total: int(), eligible: int() })) }),
  Arrival: obj({
    id: str(), code: str(), status: ref('TicketStatus'), etaMin: nullable(int()), reservedUntil: nullable(date()),
    donor: obj({ name: str(), bloodType: ref('BloodType') }), requestCode: str(),
  }),
  StaffRequest: obj({
    id: str(), code: str(), status: ref('RequestStatus'), bloodType: ref('BloodType'), component: ref('Component'), componentLabel: str(),
    bagsNeeded: int(), urgency: ref('Urgency'), progress: ref('Progress'), publicState: ref('PublicState'), createdAt: date(), updatedAt: date(),
    patientName: str(), medicalRecordNo: str(), ward: str(), phone: str({ description: 'Disamarkan' }),
    letter: nullable(obj({ name: nullable(str()), mime: nullable(str()) })), rejectReason: nullable(str()),
    dispatch: ref('Dispatch'),
    tickets: arr(obj({
      id: str(), code: str(), status: ref('TicketStatus'), wave: int(), distanceKm: num(), etaMin: nullable(int()),
      invitedAt: date(), respondedAt: nullable(date()), reservedUntil: nullable(date()), arrivedAt: nullable(date()), collectedAt: nullable(date()),
      donor: obj({ id: str(), name: str(), bloodType: ref('BloodType') }),
    })),
    events: arr(ref('Event')),
  }),
  StockOptions: obj({
    pendingTransfers: arr(obj({ fromFaskesId: str(), quantity: int() })),
    compatibleTypes: arr(ref('BloodType')),
    home: arr(obj({ bloodType: ref('BloodType'), quantity: int() })),
    homeTotal: int(),
    elsewhere: arr(obj({ faskes: obj({ id: str(), name: str(), area: str() }), distanceKm: num(), quantity: int() })),
  }),
  Transfer: obj({
    id: str(), status: ref('TransferStatus'), quantity: int(), moved: int(), note: nullable(str()), createdAt: date(), decidedAt: nullable(date()),
    request: obj({ code: str(), bloodType: ref('BloodType'), component: ref('Component'), urgency: ref('Urgency'), componentLabel: str() }),
    from: str({ description: 'Nama faskes sumber' }), to: str({ description: 'Nama faskes tujuan' }),
  }),
  TicketDetail: obj({
    id: str(), code: str(), status: ref('TicketStatus'), distanceKm: num(), etaMin: nullable(int()), reservedUntil: nullable(date()),
    donor: obj({ id: str(), name: str(), bloodType: ref('BloodType') }),
    request: obj({ id: str(), code: str(), bloodType: ref('BloodType'), component: ref('Component') }),
    screening: nullable(obj({ sys: int(), dia: int(), hb: num(), weight: num(), pass: bool(), reasons: arr(str()) })),
  }),
  StatusResult: obj({ id: str(), status: ref('RequestStatus') }),
  ImportPreview: obj({
    dataset: str(), total: int(), valid: int(),
    issues: arr(obj({ row: int({ description: 'Nomor baris di Excel' }), message: str() })),
    summary: str(),
    preview: arr(obj({}, [], { additionalProperties: { oneOf: [str(), num()] } })),
  }),

  // ---------- admin ----------
  User: obj({
    id: str(), name: str(), email: str({ format: 'email' }), role: ref('UserRole'), isActive: bool(), lastLoginAt: nullable(date()),
    faskes: nullable(obj({ id: str(), name: str() })),
  }),
  UserSaved: obj({ id: str(), name: str(), email: str(), role: ref('UserRole'), faskesId: nullable(str()) }),
  AuditLog: obj({
    id: str(), actor: str({ example: 'staff:3f1c...' }), action: str({ example: 'request.approve' }), ref: nullable(str()),
    meta: nullable(obj({}, [], { additionalProperties: true })), ip: nullable(str()), createdAt: date(),
  }),
  Overview: obj({
    requests: obj({}, [], { additionalProperties: int(), description: 'Jumlah permintaan per RequestStatus' }),
    donors: obj({ total: int(), eligible: int() }),
    tickets: obj({}, [], { additionalProperties: int(), description: 'Jumlah tiket per TicketStatus' }),
    acceptanceRate: nullable(int({ description: 'Persen' })),
    medianMinutesToFulfil: nullable(int()),
  }),
};

const description = `
REST API BloodSync untuk web dan aplikasi mobile.

## Format respons
- Sukses: \`{ "success": true, "message": "...", "data": ... }\`
- Gagal: \`{ "success": false, "error": { "code": "...", "message": "...", "details"?: [...] } }\`. \`message\` sudah dalam Bahasa Indonesia dan aman ditampilkan ke pengguna.
- Waktu dalam ISO 8601 UTC. Endpoint unduhan (export, template, surat) mengembalikan berkas, bukan JSON.

## Autentikasi
Semua token dikirim lewat header \`Authorization: Bearer <token>\`. Ada empat jenis sesi:

| Peran | Cara dapat token | Skema |
|---|---|---|
| Keluarga pasien | \`POST /auth/otp/request\` lalu \`/auth/otp/verify\` dengan \`purpose=FAMILY\` | familyPhoneAuth |
| Calon pendonor | OTP dengan \`purpose=DONOR\`, \`registered=false\` → \`POST /donors/register\` | donorPhoneAuth |
| Pendonor terdaftar | OTP dengan \`purpose=DONOR\`, \`registered=true\`, atau hasil register | donorAuth |
| Petugas faskes / super admin | \`POST /auth/staff/login\` | staffAuth / adminAuth |

Saat app dibuka, panggil \`GET /auth/me\` untuk memastikan token tersimpan masih berlaku. Respons 401 berarti token harus dibuang dan pengguna masuk ulang.

## Realtime (Socket.IO)
Hubungkan ke origin yang sama (path default \`/socket.io\`) dengan \`auth: { token }\`. Server hanya mengirim sinyal "ada perubahan"; ambil data terbaru lewat REST.

| Event (server → client) | Diterima oleh | Payload | Lalu panggil |
|---|---|---|---|
| \`request:updated\` | keluarga, petugas faskes, pemegang kartu | \`{ id, status }\` | \`GET /requests/{id}\` atau \`GET /faskes/me/requests/{id}\` |
| \`faskes:updated\` | petugas faskes | \`{ id }\` | stok / permintaan / kedatangan |
| \`donor:updated\` | pendonor | \`{ id }\` | \`GET /donors/me\` |
| \`invite:new\` | pendonor | \`{ ticketId, requestId }\` | \`GET /donors/me\` |

Client → server: \`card:subscribe\` (\`token\` kartu publik, ack \`boolean\`) untuk memantau satu kartu tanpa login.

## Batas laju
Batas per IP berlaku di endpoint login, OTP, pembuatan pengajuan, lokasi pendonor, export, dan import. Lewat batas → 429 \`RATE_LIMITED\`. Di luar production batasnya 10x lebih longgar.
`.trim();

export const openApiSpec = {
  openapi: '3.0.3',
  info: { title: 'BloodSync API', version: '1.0.0', description },
  servers: [{ url: '/api', description: 'Server ini' }],
  tags: [
    { name: 'Auth', description: 'Login petugas, OTP WhatsApp, cek sesi' },
    { name: 'Public', description: 'Tanpa login' },
    { name: 'Keluarga Pasien', description: 'Pengajuan kebutuhan darah (token familyPhoneAuth)' },
    { name: 'Pendonor', description: 'Profil, panggilan darurat, tiket QR (token donorAuth)' },
    { name: 'Faskes - Stok', description: 'Inventaris darah faskes petugas' },
    { name: 'Faskes - Permintaan', description: 'Verifikasi, alokasi, mutasi, panggilan donor' },
    { name: 'Faskes - Tiket Donor', description: 'Scan QR, skrining, pengambilan darah' },
    { name: 'Faskes - Export/Import', description: 'Excel (.xlsx)' },
    { name: 'Admin', description: 'Super admin: faskes, akun, audit' },
    { name: 'Admin - Export/Import', description: 'Excel (.xlsx)' },
    { name: 'Webhook', description: 'Dipanggil gateway WhatsApp, bukan oleh app' },
  ],
  components: {
    securitySchemes: {
      staffAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token petugas faskes (role FASKES_STAFF) dari POST /auth/staff/login' },
      adminAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token super admin (role SUPER_ADMIN) dari POST /auth/staff/login' },
      donorAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token pendonor terdaftar. Batal di semua perangkat setelah POST /donors/me/logout.' },
      familyPhoneAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token nomor terverifikasi dengan purpose FAMILY' },
      donorPhoneAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token nomor terverifikasi dengan purpose DONOR (belum terdaftar)' },
      webhookSecret: { type: 'apiKey', in: 'query', name: 'secret' },
    },
    responses: {
      BadRequest: { description: 'Validasi gagal atau aksi tidak valid', content: { 'application/json': { schema: ref('Error') } } },
      Unauthorized: { description: 'Token tidak ada, kedaluwarsa, atau dicabut', content: { 'application/json': { schema: ref('Error') } } },
      Forbidden: { description: 'Token valid tetapi peran tidak sesuai', content: { 'application/json': { schema: ref('Error') } } },
      NotFound: { description: 'Data tidak ditemukan', content: { 'application/json': { schema: ref('Error') } } },
      Conflict: { description: 'Status data tidak mengizinkan aksi ini (code: INVALID_STATE, DUPLICATE, NO_STOCK, ...)', content: { 'application/json': { schema: ref('Error') } } },
      TooMany: { description: 'Terlalu banyak percobaan', content: { 'application/json': { schema: ref('Error') } } },
    },
    schemas,
  },
  paths: {
    // ================= auth =================
    '/auth/staff/login': {
      post: {
        tags: ['Auth'], summary: 'Login petugas faskes / super admin',
        description: 'Akun terkunci 15 menit setelah 5 kali gagal.',
        requestBody: json(obj({ email: str({ format: 'email', maxLength: 120, example: 'petugas@rsudtebet.id' }), password: str({ maxLength: 128 }) })),
        responses: { 200: ok(ref('StaffLoginResult'), 'Berhasil masuk', 'Berhasil masuk'), 400: errRef('BadRequest'), 401: errRef('Unauthorized'), 429: errRef('TooMany') },
      },
    },
    '/auth/otp/request': {
      post: {
        tags: ['Auth'], summary: 'Kirim OTP 6 digit via WhatsApp',
        description: 'Maksimal 3 pengiriman per nomor per 10 menit. Kode berlaku 5 menit.',
        requestBody: json(obj({ phone: str({ example: '081234567890', description: 'Format 08xx, 628xx, atau +628xx' }), purpose: str({ enum: ['FAMILY', 'DONOR'] }) })),
        responses: { 200: ok(obj({ sent: bool(), expiresInSec: int({ example: 300 }) }), 'OTP terkirim', 'Kode OTP dikirim via WhatsApp'), 400: errRef('BadRequest'), 429: errRef('TooMany') },
      },
    },
    '/auth/otp/verify': {
      post: {
        tags: ['Auth'], summary: 'Verifikasi OTP dan dapatkan token',
        description: 'Kode salah 5 kali → kode hangus. Error code: OTP_EXPIRED, OTP_INVALID.',
        requestBody: json(obj({ phone: str({ example: '081234567890' }), purpose: str({ enum: ['FAMILY', 'DONOR'] }), code: str({ pattern: '^\\d{6}$', example: '123456' }) })),
        responses: { 200: ok(ref('OtpVerifyResult'), 'Nomor terverifikasi', 'Nomor terverifikasi'), 400: errRef('BadRequest'), 403: errRef('Forbidden'), 429: errRef('TooMany') },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'], summary: 'Cek sesi token yang tersimpan',
        description: 'Berlaku untuk semua jenis token. Pakai `kind` (dan `purpose` / `user.role`) untuk menentukan layar yang dibuka.',
        security: [{ staffAuth: [] }, { adminAuth: [] }, { donorAuth: [] }, { familyPhoneAuth: [] }, { donorPhoneAuth: [] }],
        responses: { 200: ok(ref('Session')), 401: errRef('Unauthorized') },
      },
    },

    // ================= public =================
    '/public/meta': {
      get: { tags: ['Public'], summary: 'Data referensi (golongan darah, komponen, kecamatan, ambang skrining)', security: [], responses: { 200: ok(ref('Meta')) } },
    },
    '/public/faskes': {
      get: { tags: ['Public'], summary: 'Daftar faskes aktif', description: 'Untuk form pengajuan pilih faskes bertipe RS.', security: [], responses: { 200: ok(arr(ref('FaskesPublic'))) } },
    },
    '/public/cards/{token}': {
      get: {
        tags: ['Public'], summary: 'Kartu panggilan donor publik',
        description: 'Tidak memuat identitas atau kontak. Pengajuan yang belum diverifikasi → 404.',
        security: [],
        parameters: [{ name: 'token', in: 'path', required: true, schema: str({ pattern: '^[A-Z2-9]{16}$' }) }],
        responses: { 200: ok(ref('PublicCard')), 400: errRef('BadRequest'), 404: errRef('NotFound') },
      },
    },

    // ================= family =================
    '/requests': {
      post: {
        tags: ['Keluarga Pasien'], summary: 'Buat pengajuan kebutuhan darah',
        description: 'multipart/form-data. Surat pengantar dokter wajib (JPG/PNG/WEBP/HEIC/PDF, maks 5 MB; tipe dicek dari isi berkas). Maksimal 3 pengajuan aktif per nomor (409 TOO_MANY_ACTIVE).',
        security: familyPhone,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: obj({
                patientName: str({ minLength: 2, maxLength: 120 }),
                medicalRecordNo: str({ minLength: 1, maxLength: 40 }),
                ward: str({ minLength: 1, maxLength: 80, example: 'ICU Lt. 3' }),
                faskesId: str({ description: 'ID faskes bertipe RS dari GET /public/faskes' }),
                bloodType: ref('BloodType'),
                component: ref('Component'),
                bagsNeeded: int({ minimum: 1, maximum: 10 }),
                urgency: ref('Urgency'),
                letter: str({ format: 'binary', description: 'Foto / PDF surat pengantar dokter' }),
              }),
            },
          },
        },
        responses: { 201: ok(ref('RequestCreated'), 'Pengajuan dibuat', 'Pengajuan terkirim, menunggu verifikasi faskes'), ...common, 409: errRef('Conflict'), 429: errRef('TooMany') },
      },
      get: {
        tags: ['Keluarga Pasien'], summary: 'Daftar pengajuan milik nomor ini (20 terbaru)', security: familyPhone,
        responses: { 200: ok(arr(ref('FamilyRequestItem'))), 401: errRef('Unauthorized'), 403: errRef('Forbidden') },
      },
    },
    '/requests/{id}': {
      get: {
        tags: ['Keluarga Pasien'], summary: 'Detail pengajuan + progres + pendonor yang menuju', security: familyPhone, parameters: [idParam],
        responses: { 200: ok(ref('FamilyRequestDetail')), ...common, 404: errRef('NotFound') },
      },
    },
    '/requests/{id}/cancel': {
      post: {
        tags: ['Keluarga Pasien'], summary: 'Batalkan pengajuan aktif', security: familyPhone, parameters: [idParam],
        responses: { 200: ok(ref('StatusResult'), 'Dibatalkan', 'Pengajuan dibatalkan'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },

    // ================= donor =================
    '/donors/register': {
      post: {
        tags: ['Pendonor'], summary: 'Daftar sebagai pendonor',
        description: 'Kirim lat/lng dari GPS bila ada; jika tidak, lokasi diambil dari titik tengah kecamatan. 409 DONOR_EXISTS bila nomor sudah terdaftar.',
        security: donorPhone,
        requestBody: json(obj({
          name: str({ minLength: 2, maxLength: 80 }),
          bloodType: ref('BloodType'),
          area: ref('Area'),
          lat: num({ minimum: -11, maximum: 6 }),
          lng: num({ minimum: 94, maximum: 142 }),
          lastDonationAt: nullable(str({ format: 'date', example: '2026-07-14', description: 'Tanggal donor terakhir (tidak boleh di masa depan)' })),
          consentNotification: bool({ enum: [true] }),
          consentLocation: bool({ enum: [true] }),
        }, ['name', 'bloodType', 'area', 'consentNotification', 'consentLocation'])),
        responses: { 201: ok(ref('DonorRegistered'), 'Terdaftar', 'Profil pendonor aktif'), ...common, 409: errRef('Conflict') },
      },
    },
    '/donors/me': {
      get: {
        tags: ['Pendonor'], summary: 'Dashboard pendonor (satu panggilan untuk seluruh layar)',
        description: 'Berisi profil, kelayakan donor, panggilan darurat aktif (`invite`), tiket QR (`activeTicket`), hasil terakhir (`outcome`), lencana, dan riwayat.',
        security: donor,
        responses: { 200: ok(ref('DonorDashboard')), 401: errRef('Unauthorized'), 403: errRef('Forbidden'), 404: errRef('NotFound') },
      },
      delete: {
        tags: ['Pendonor'], summary: 'Nonaktifkan profil (berhenti menerima panggilan)',
        description: 'Undangan dan slot yang sedang dipegang dilepas ke pendonor cadangan.',
        security: donor,
        responses: { 200: ok(obj({ active: bool({ example: false }) }), 'Nonaktif', 'Anda tidak akan menerima panggilan lagi'), 401: errRef('Unauthorized'), 403: errRef('Forbidden') },
      },
    },
    '/donors/me/reactivate': {
      post: {
        tags: ['Pendonor'], summary: 'Aktifkan kembali profil', security: donor,
        responses: { 200: ok(obj({ active: bool({ example: true }) }), 'Aktif', 'Profil aktif kembali'), 401: errRef('Unauthorized'), 403: errRef('Forbidden') },
      },
    },
    '/donors/me/area': {
      patch: {
        tags: ['Pendonor'], summary: 'Ganti kecamatan (lokasi perkiraan)', security: donor,
        requestBody: json(obj({ area: ref('Area') })),
        responses: { 200: ok(obj({ area: str() }), 'Diperbarui', 'Lokasi diperbarui'), ...common },
      },
    },
    '/donors/me/location': {
      patch: {
        tags: ['Pendonor'], summary: 'Perbarui lokasi GPS',
        description: 'Kecamatan diisi otomatis dari titik terdekat. Maks 20 kali per jam per IP.',
        security: donor,
        requestBody: json(obj({ lat: num({ minimum: -11, maximum: 6, example: -6.2261 }), lng: num({ minimum: 94, maximum: 142, example: 106.8532 }) })),
        responses: { 200: ok(obj({ area: str() }), 'Diperbarui', 'Lokasi GPS diperbarui'), ...common, 429: errRef('TooMany') },
      },
    },
    '/donors/me/logout': {
      post: {
        tags: ['Pendonor'], summary: 'Keluar dari semua perangkat', description: 'Semua token pendonor yang pernah terbit langsung tidak berlaku.', security: donor,
        responses: { 200: ok(obj({ loggedOut: bool({ example: true }) }), 'Keluar', 'Berhasil keluar dari semua perangkat'), 401: errRef('Unauthorized'), 403: errRef('Forbidden') },
      },
    },
    '/donors/me/tickets/{id}/respond': {
      post: {
        tags: ['Pendonor'], summary: 'Jawab panggilan darurat',
        description: '`accept=true` mengunci slot (status RESERVED + kode tiket QR). Jika kuota sudah penuh atau pendonor belum pulih, status QUOTA_FULL / NOT_ELIGIBLE dengan `message`. 409 INVITE_EXPIRED / ALREADY_COMMITTED.',
        security: donor, parameters: [{ ...idParam, description: 'ticketId dari dashboard.invite' }],
        requestBody: json(obj({ accept: bool() })),
        responses: { 200: ok(ref('RespondResult'), 'Diproses', 'Slot dikunci untuk Anda'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/donors/me/tickets/{id}/cancel': {
      post: {
        tags: ['Pendonor'], summary: 'Batalkan kedatangan (tiket RESERVED)', security: donor, parameters: [idParam],
        responses: { 200: ok(obj({ status: str({ enum: ['CANCELLED'] }) }), 'Dibatalkan', 'Kedatangan dibatalkan'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/donors/me/tickets/{id}/ack': {
      post: {
        tags: ['Pendonor'], summary: 'Tandai hasil tiket sudah dilihat', description: 'Setelah ini `outcome` tidak muncul lagi di dashboard.', security: donor, parameters: [idParam],
        responses: { 200: ok(obj({ acknowledged: bool({ example: true }) })), ...common, 404: errRef('NotFound') },
      },
    },
    '/donors/me/demo/finish-recovery': {
      post: {
        tags: ['Pendonor'], summary: '[Demo] Anggap masa pemulihan selesai', description: 'Hanya aktif di luar production (ENABLE_DEMO_ROUTES).', security: donor,
        responses: { 200: ok(obj({ eligible: bool({ example: true }) })), ...common, 404: errRef('NotFound') },
      },
    },

    // ================= faskes staff =================
    '/faskes/me': {
      get: { tags: ['Faskes - Stok'], summary: 'Profil faskes petugas', security: staff, responses: { 200: ok(ref('Faskes')), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
    },
    '/faskes/me/stock': {
      get: { tags: ['Faskes - Stok'], summary: 'Matriks stok komponen × golongan darah', security: staff, responses: { 200: ok(arr(ref('StockRow'))), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
    },
    '/faskes/me/stock/adjust': {
      post: {
        tags: ['Faskes - Stok'], summary: 'Koreksi stok manual (masuk / keluar)', security: staff,
        requestBody: json(obj({
          component: ref('Component'), bloodType: ref('BloodType'),
          delta: int({ minimum: -500, maximum: 500, description: 'Positif = masuk, negatif = keluar, tidak boleh 0', example: 5 }),
          note: str({ minLength: 3, maxLength: 160, example: 'Kiriman PMI' }),
        })),
        responses: { 200: ok(obj({ quantity: int({ description: 'Stok setelah koreksi' }) }), 'Diperbarui', 'Stok diperbarui'), ...common },
      },
    },
    '/faskes/me/movements': {
      get: {
        tags: ['Faskes - Stok'], summary: 'Riwayat mutasi stok', security: staff,
        parameters: [{ name: 'limit', in: 'query', schema: int({ minimum: 1, maximum: 100, default: 10 }) }],
        responses: { 200: ok(arr(ref('Movement'))), ...common },
      },
    },
    '/faskes/me/donor-pool': {
      get: { tags: ['Faskes - Stok'], summary: 'Pendonor terdaftar di sekitar faskes (radius maks)', security: staff, responses: { 200: ok(ref('DonorPool')), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
    },
    '/faskes/me/arrivals': {
      get: { tags: ['Faskes - Tiket Donor'], summary: 'Pendonor yang sedang menuju / sudah tiba', security: staff, responses: { 200: ok(arr(ref('Arrival'))), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
    },
    '/faskes/me/requests': {
      get: {
        tags: ['Faskes - Permintaan'], summary: 'Daftar permintaan darah ke faskes ini', security: staff,
        parameters: [{ name: 'scope', in: 'query', schema: str({ enum: ['active', 'history'], default: 'active' }), description: 'active = maks 100, history = 50 terbaru' }],
        responses: { 200: ok(arr(ref('StaffRequest'))), ...common },
      },
    },
    '/faskes/me/requests/{id}': {
      get: { tags: ['Faskes - Permintaan'], summary: 'Detail permintaan', security: staff, parameters: [idParam], responses: { 200: ok(ref('StaffRequest')), ...common, 404: errRef('NotFound') } },
    },
    '/faskes/me/requests/{id}/letter': {
      get: {
        tags: ['Faskes - Permintaan'], summary: 'Unduh surat pengantar dokter', description: 'Setiap akses dicatat di audit log.', security: staff, parameters: [idParam],
        responses: {
          200: { description: 'Berkas surat', content: { 'image/jpeg': { schema: str({ format: 'binary' }) }, 'image/png': { schema: str({ format: 'binary' }) }, 'image/webp': { schema: str({ format: 'binary' }) }, 'image/heic': { schema: str({ format: 'binary' }) }, 'application/pdf': { schema: str({ format: 'binary' }) } } },
          ...common, 404: errRef('NotFound'),
        },
      },
    },
    '/faskes/me/requests/{id}/stock-options': {
      get: {
        tags: ['Faskes - Permintaan'], summary: 'Opsi stok kompatibel: stok sendiri dan faskes lain terdekat', security: staff, parameters: [idParam],
        responses: { 200: ok(ref('StockOptions')), ...common, 404: errRef('NotFound') },
      },
    },
    '/faskes/me/requests/{id}/approve': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Setujui pengajuan (PENDING_VERIFICATION → APPROVED)', security: staff, parameters: [idParam],
        responses: { 200: ok(ref('StatusResult'), 'Disetujui', 'Pengajuan disetujui'), ...common, 409: errRef('Conflict') },
      },
    },
    '/faskes/me/requests/{id}/reject': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Tolak pengajuan', security: staff, parameters: [idParam],
        requestBody: json(obj({ reason: str({ minLength: 3, maxLength: 200, example: 'Surat pengantar tidak terbaca' }) })),
        responses: { 200: ok(ref('StatusResult'), 'Ditolak', 'Pengajuan ditolak'), ...common, 409: errRef('Conflict') },
      },
    },
    '/faskes/me/requests/{id}/allocate': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Alokasikan stok internal yang kompatibel', security: staff, parameters: [idParam],
        responses: { 200: ok(obj({ allocated: int() }), 'Dialokasikan', 'Stok dialokasikan'), ...common, 409: errRef('Conflict') },
      },
    },
    '/faskes/me/requests/{id}/transfer': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Minta mutasi stok dari faskes lain', description: 'Stok baru berpindah setelah faskes sumber menyetujui.', security: staff, parameters: [idParam],
        requestBody: json(obj({ fromFaskesId: str() })),
        responses: { 201: ok(obj({ transferId: str(), quantity: int(), source: str() }), 'Dikirim', 'Permintaan mutasi dikirim, menunggu persetujuan faskes sumber'), ...common, 409: errRef('Conflict') },
      },
    },
    '/faskes/me/requests/{id}/dispatch': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Mulai panggilan darurat ke pendonor (APPROVED → BROADCASTING)',
        description: 'Radius bertambah otomatis setiap `escalateMinutes` hingga radius maksimum. `allowCompatible` hanya berlaku untuk komponen PRC.',
        security: staff, parameters: [idParam],
        requestBody: json(obj({
          radiusKm: num({ minimum: 1, maximum: 15, example: 5 }),
          deadlineHours: num({ minimum: 0.5, maximum: 48, example: 6 }),
          escalateMinutes: int({ minimum: 1, maximum: 120, example: 10 }),
          allowCompatible: bool({ default: false }),
        }, ['radiusKm', 'deadlineHours', 'escalateMinutes'])),
        responses: {
          200: ok(obj({ id: str(), status: str({ enum: ['BROADCASTING'] }), funnel: nullable(obj({ wave: int(), radiusKm: num(), inRadius: int(), typeMatch: int(), eligible: int(), capped: int(), invited: int() }, [], { additionalProperties: true })) }), 'Aktif', 'Panggilan darurat aktif'),
          ...common, 409: errRef('Conflict'),
        },
      },
    },
    '/faskes/me/requests/{id}/close': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Tutup permintaan aktif', description: 'Pendonor yang sedang menuju diberi tahu agar tidak datang.', security: staff, parameters: [idParam],
        responses: { 200: ok(ref('StatusResult'), 'Ditutup', 'Permintaan ditutup'), ...common, 409: errRef('Conflict') },
      },
    },
    '/faskes/me/transfers': {
      get: {
        tags: ['Faskes - Permintaan'], summary: 'Mutasi antarfaskes', description: '`incoming` = permintaan ke faskes ini yang menunggu keputusan; `outgoing` = 10 permintaan terakhir dari faskes ini.', security: staff,
        responses: { 200: ok(obj({ incoming: arr(ref('Transfer')), outgoing: arr(ref('Transfer')) })), 401: errRef('Unauthorized'), 403: errRef('Forbidden') },
      },
    },
    '/faskes/me/transfers/{id}/approve': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Setujui mutasi (sebagai faskes sumber)', description: 'Jika stok habis atau kebutuhan sudah tertutup, status menjadi CANCELLED.', security: staff, parameters: [idParam],
        responses: { 200: ok(obj({ status: str({ enum: ['APPROVED', 'CANCELLED'] }), moved: int() }), 'Diproses', 'Mutasi disetujui'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/faskes/me/transfers/{id}/reject': {
      post: {
        tags: ['Faskes - Permintaan'], summary: 'Tolak mutasi', security: staff, parameters: [idParam],
        responses: { 200: ok(obj({ status: str({ enum: ['REJECTED'] }), moved: int({ example: 0 }) }), 'Ditolak', 'Mutasi ditolak'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/faskes/me/tickets/scan': {
      post: {
        tags: ['Faskes - Tiket Donor'], summary: 'Scan QR tiket pendonor (check-in)',
        description: 'Menerima `BLOODSYNC:TKT-XXXXXX`, `TKT-XXXXXX`, atau `XXXXXX`. Tiket RESERVED berubah menjadi ARRIVED; ARRIVED/SCREENED hanya ditampilkan.',
        security: staff,
        requestBody: json(obj({ code: str({ minLength: 4, maxLength: 24, example: 'BLOODSYNC:TKT-AB12CD' }) })),
        responses: { 200: ok(ref('TicketDetail'), 'Tiket valid', 'Tiket valid'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/faskes/me/tickets/{id}/screening': {
      post: {
        tags: ['Faskes - Tiket Donor'], summary: 'Catat hasil skrining (tiket ARRIVED)', description: 'Ambang lolos ada di `GET /public/meta` → `screening`.', security: staff, parameters: [idParam],
        requestBody: json(obj({
          sys: int({ minimum: 50, maximum: 250, example: 120 }), dia: int({ minimum: 30, maximum: 150, example: 80 }),
          hb: num({ minimum: 3, maximum: 25, example: 13.5 }), weight: num({ minimum: 25, maximum: 250, example: 62 }),
        })),
        responses: { 200: ok(obj({ pass: bool(), reasons: arr(str()) }), 'Tercatat', 'Lolos skrining'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/faskes/me/tickets/{id}/collect': {
      post: {
        tags: ['Faskes - Tiket Donor'], summary: 'Catat pengambilan darah (tiket SCREENED)', description: 'Jika permintaan sudah tidak butuh, kantong masuk stok (`toStock=true`).', security: staff, parameters: [idParam],
        responses: { 200: ok(obj({ collected: bool(), toStock: bool(), remaining: int(), newBadges: arr(str()) }), 'Tercatat', 'Pengambilan darah tercatat'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/faskes/me/tickets/{id}/no-show': {
      post: {
        tags: ['Faskes - Tiket Donor'], summary: 'Lepas slot pendonor yang tidak datang (tiket RESERVED)', security: staff, parameters: [idParam],
        responses: { 200: ok(obj({ status: str({ enum: ['NO_SHOW'] }) }), 'Dilepas', 'Slot dilepas'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/faskes/me/export/{dataset}': {
      get: {
        tags: ['Faskes - Export/Import'], summary: 'Export data faskes ke Excel', security: staff,
        parameters: [{ name: 'dataset', in: 'path', required: true, schema: str({ enum: [...STAFF_DATASETS] }) }, ...exportQuery],
        responses: { 200: xlsxFile('File .xlsx', { 'X-Export-Rows': { schema: int(), description: 'Jumlah baris' }, 'X-Export-Truncated': { schema: str({ enum: ['1'] }), description: 'Ada bila hasil dipotong pada 10.000 baris terbaru (file juga memuat baris catatan di bawah)' } }), ...common, 429: errRef('TooMany') },
      },
    },
    '/faskes/me/import/{dataset}/template': {
      get: {
        tags: ['Faskes - Export/Import'], summary: 'Unduh template import', security: staff,
        parameters: [{ name: 'dataset', in: 'path', required: true, schema: str({ enum: [...STAFF_IMPORTS] }) }],
        responses: { 200: xlsxFile('Template .xlsx'), ...common },
      },
    },
    '/faskes/me/import/{dataset}': {
      post: {
        tags: ['Faskes - Export/Import'], summary: 'Import Excel (preview lalu commit)', security: staff,
        description: 'Stock opname: template berisi kolom "Stok sistem (jangan diubah)" (stok saat unduh) dan Jumlah (hitungan fisik). Yang diterapkan adalah selisih Jumlah - Stok sistem ke stok terkini; baris yang membuat stok minus ditolak (422 IMPORT_INVALID saat commit). File template lama tanpa kolom Stok sistem ditolak 400 TEMPLATE_OUTDATED. Kolom preview: Komponen, Golongan, Stok sistem saat unduh, Hitungan fisik, Selisih, Stok sekarang, Sesudah.',
        parameters: [{ name: 'dataset', in: 'path', required: true, schema: str({ enum: [...STAFF_IMPORTS] }) }, commitQuery],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: obj({ file: str({ format: 'binary', description: '.xlsx maks 2 MB' }) }) } } },
        responses: {
          200: ok({ oneOf: [ref('ImportPreview'), obj({ imported: int(), changed: int() })] }, 'Preview (tanpa commit) atau hasil import (commit=1)'),
          ...common, 429: errRef('TooMany'),
        },
      },
    },

    // ================= admin =================
    '/admin/overview': {
      get: { tags: ['Admin'], summary: 'Ringkasan dampak', security: admin, responses: { 200: ok(ref('Overview')), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
    },
    '/admin/faskes': {
      get: { tags: ['Admin'], summary: 'Daftar semua faskes', security: admin, responses: { 200: ok(arr(ref('FaskesWithCount'))), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
      post: {
        tags: ['Admin'], summary: 'Tambah faskes', description: 'Baris stok 0 dibuat otomatis untuk semua komponen × golongan.', security: admin,
        requestBody: json(faskesBody),
        responses: { 201: ok(ref('Faskes'), 'Ditambahkan', 'Faskes ditambahkan'), ...common, 409: errRef('Conflict') },
      },
    },
    '/admin/faskes/{id}': {
      patch: {
        tags: ['Admin'], summary: 'Ubah faskes', security: admin, parameters: [idParam], requestBody: json(faskesBody),
        responses: { 200: ok(ref('Faskes'), 'Diperbarui', 'Faskes diperbarui'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
      delete: {
        tags: ['Admin'], summary: 'Hapus faskes', description: 'Ditolak (409 HAS_USERS / HAS_HISTORY / IN_USE) bila masih punya akun, riwayat, atau data lain yang merujuk; nonaktifkan saja.', security: admin, parameters: [idParam],
        responses: { 200: ok(obj({ deleted: bool({ example: true }) }), 'Dihapus', 'Faskes dihapus'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/admin/faskes/{id}/active': {
      patch: {
        tags: ['Admin'], summary: 'Aktif / nonaktifkan faskes', description: 'Menonaktifkan juga menutup permintaan aktif dan membatalkan mutasi yang menunggu.', security: admin, parameters: [idParam],
        requestBody: json(obj({ isActive: bool() })),
        responses: { 200: ok(ref('Faskes'), 'Diperbarui', 'Status faskes diperbarui'), ...common, 404: errRef('NotFound') },
      },
    },
    '/admin/users': {
      get: { tags: ['Admin'], summary: 'Daftar akun petugas & admin', security: admin, responses: { 200: ok(arr(ref('User'))), 401: errRef('Unauthorized'), 403: errRef('Forbidden') } },
      post: {
        tags: ['Admin'], summary: 'Buat akun', description: `FASKES_STAFF wajib menyertakan faskesId. Kata sandi: ${passwordRule}`, security: admin,
        requestBody: json(obj({
          name: str({ minLength: 2, maxLength: 80 }), email: str({ format: 'email', maxLength: 120 }), role: ref('UserRole'),
          faskesId: str(), password: str({ minLength: 12, maxLength: 72, format: 'password' }),
        }, ['name', 'email', 'role', 'password'])),
        responses: { 201: ok(ref('UserSaved'), 'Dibuat', 'Akun dibuat'), ...common, 409: errRef('Conflict') },
      },
    },
    '/admin/users/{id}': {
      patch: {
        tags: ['Admin'], summary: 'Ubah akun',
        description: `Kosongkan password untuk mempertahankan yang lama. Mengubah peran, faskes, atau kata sandi mencabut semua sesi pemilik akun. Kata sandi: ${passwordRule}`,
        security: admin, parameters: [idParam],
        requestBody: json(obj({
          name: str({ minLength: 2, maxLength: 80 }), email: str({ format: 'email', maxLength: 120 }), role: ref('UserRole'),
          faskesId: str(), password: str({ format: 'password', description: 'String kosong = tidak diubah' }),
        }, ['name', 'email', 'role'])),
        responses: {
          200: ok({ allOf: [ref('UserSaved'), obj({ sessionsRevoked: bool(), self: bool({ description: 'true bila admin mengubah akunnya sendiri' }) })] }, 'Diperbarui', 'Akun diperbarui'),
          ...common, 404: errRef('NotFound'), 409: errRef('Conflict'),
        },
      },
      delete: {
        tags: ['Admin'], summary: 'Hapus akun', description: 'Tidak bisa menghapus akun sendiri atau super admin aktif terakhir (409 LAST_SUPER_ADMIN).', security: admin, parameters: [idParam],
        responses: { 200: ok(obj({ deleted: bool({ example: true }) }), 'Dihapus', 'Akun dihapus'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/admin/users/{id}/active': {
      patch: {
        tags: ['Admin'], summary: 'Aktif / nonaktifkan akun', security: admin, parameters: [idParam],
        requestBody: json(obj({ isActive: bool() })),
        responses: { 200: ok(obj({ id: str(), isActive: bool() }), 'Diperbarui', 'Status akun diperbarui'), ...common, 404: errRef('NotFound'), 409: errRef('Conflict') },
      },
    },
    '/admin/audit': {
      get: {
        tags: ['Admin'], summary: 'Audit log (terbaru dulu)', security: admin,
        parameters: [
          { name: 'page', in: 'query', schema: int({ minimum: 1, default: 1 }) },
          { name: 'pageSize', in: 'query', schema: int({ minimum: 1, maximum: 100, default: 25 }) },
          { name: 'actor', in: 'query', schema: str({ maxLength: 80 }), description: 'Cari sebagian teks aktor' },
        ],
        responses: { 200: ok(obj({ items: arr(ref('AuditLog')), total: int(), page: int(), pageSize: int() })), ...common },
      },
    },
    '/admin/export/{dataset}': {
      get: {
        tags: ['Admin - Export/Import'], summary: 'Export data ke Excel', security: admin,
        parameters: [{ name: 'dataset', in: 'path', required: true, schema: str({ enum: [...ADMIN_DATASETS] }) }, ...exportQuery],
        responses: { 200: xlsxFile('File .xlsx', { 'X-Export-Rows': { schema: int(), description: 'Jumlah baris' }, 'X-Export-Truncated': { schema: str({ enum: ['1'] }), description: 'Ada bila hasil dipotong pada 10.000 baris terbaru (file juga memuat baris catatan di bawah)' } }), ...common, 429: errRef('TooMany') },
      },
    },
    '/admin/import/{dataset}/template': {
      get: {
        tags: ['Admin - Export/Import'], summary: 'Unduh template import', security: admin,
        parameters: [{ name: 'dataset', in: 'path', required: true, schema: str({ enum: [...ADMIN_IMPORTS] }) }],
        responses: { 200: xlsxFile('Template .xlsx'), ...common },
      },
    },
    '/admin/import/{dataset}': {
      post: {
        tags: ['Admin - Export/Import'], summary: 'Import Excel (preview lalu commit)',
        description: 'Commit dataset `akun` mengembalikan file .xlsx berisi kata sandi awal (hanya sekali). Commit `faskes` dan semua preview mengembalikan JSON.',
        security: admin,
        parameters: [{ name: 'dataset', in: 'path', required: true, schema: str({ enum: [...ADMIN_IMPORTS] }) }, commitQuery],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: obj({ file: str({ format: 'binary', description: '.xlsx maks 2 MB' }) }) } } },
        responses: {
          200: {
            description: 'Preview / hasil import (JSON), atau file kredensial akun baru (xlsx)',
            headers: { 'X-Import-Rows': { schema: int(), description: 'Hanya pada respons file kredensial' } },
            content: {
              'application/json': { schema: obj({ success: bool(), message: str(), data: { oneOf: [ref('ImportPreview'), obj({ imported: int() })] } }) },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: str({ format: 'binary' }) },
            },
          },
          ...common, 429: errRef('TooMany'),
        },
      },
    },

    // ================= webhook =================
    '/webhooks/whatsapp': {
      post: {
        tags: ['Webhook'], summary: 'Balasan WhatsApp masuk dari Fonnte',
        description: 'Pendonor membalas "1" (bersedia) atau "2" (tidak bisa). Selalu 200 agar gateway tidak mengulang.',
        security: [{ webhookSecret: [] }],
        requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: obj({ sender: str({ example: '6281234567890' }), message: str({ example: '1' }) }) } } },
        responses: {
          200: { description: 'Diterima', content: { 'application/json': { schema: obj({ ok: bool({ example: true }) }) } } },
          403: { description: 'Secret salah', content: { 'application/json': { schema: obj({ ok: bool({ example: false }) }) } } },
        },
      },
    },
  },
};

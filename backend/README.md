# BloodSync API

Express + Prisma (MySQL) + Redis + Socket.io. Dispatch engine, stok, tiket donor, dan kartu publik yang tadinya disimulasikan di `store.js` sekarang berjalan di sini.

## Setup

```bash
cp .env.example .env        # isi DATABASE_URL, REDIS_URL, JWT_SECRET
npm install
npm run setup               # prisma generate + migrate deploy + seed
npm run dev                 # http://localhost:5000
```

`npm run db:reset` menghapus seluruh data dan menjalankan ulang migrasi + seed.

Redis bersifat opsional untuk development. Jika Redis mati, OTP, rate limit, dan lock engine memakai memori (hanya aman untuk satu instance).

Akun hasil seed:

| Peran | Email | Kata sandi |
|---|---|---|
| Super admin | admin@bloodsync.id | Admin#1234 |
| Petugas RSUD Tarakan | tarakan@bloodsync.id | Petugas#1234 |
| Petugas RS Hermina | hermina@bloodsync.id | Petugas#1234 |
| Petugas RSUP Fatmawati | fatmawati@bloodsync.id | Petugas#1234 |
| Petugas UDD PMI DKI | udd@bloodsync.id | Petugas#1234 |

Di luar production, `POST /api/auth/otp/request` mengembalikan `devCode` supaya demo tidak butuh gateway WhatsApp.

## Struktur

```
prisma/
  schema.prisma           model data
  migrations/             migrasi SQL (init)
  seed.ts                 data demo
src/
  config/                 env, prisma, redis (+ fallback in-memory)
  constants/blood.ts      golongan darah, kompatibilitas, parameter dispatch & skrining, lencana
  middlewares/            auth (JWT per peran), validate (zod), rateLimit, upload (surat dokter), errorHandler
  validations/schemas.ts  semua skema input
  services/
    dispatch.service.ts   inti: transaksi + row lock, progress, settle, pencocokan gelombang, tick engine
    request.service.ts    alur keluarga & petugas atas permintaan darah, kartu publik
    ticket.service.ts     respons pendonor, scan QR, skrining, pengambilan, no-show
    donor.service.ts      registrasi, dasbor pendonor, pengingat siklus
    faskes.service.ts     stok, mutasi, kedatangan, sebaran pendonor
    auth.service.ts       login petugas, OTP WhatsApp
    admin.service.ts      faskes, akun, audit, ringkasan dampak
    notification.service.ts  outbox -> socket.io, adaptor push/WhatsApp
    presenters.ts         bentuk respons per peran (masking data pribadi)
  controllers/            satu per domain, tipis
  routes/index.ts         peta endpoint
  socket/index.ts         room per faskes / pendonor / keluarga / kartu
  jobs/engine.ts          interval tick dengan lock Redis
```

## Aturan yang dijaga server

- Setiap mutasi pada satu permintaan berjalan dalam transaksi dengan `SELECT ... FOR UPDATE`, sehingga dua pendonor yang menekan "Siap" bersamaan tidak bisa melebihi kuota.
- Kantong baru dihitung terpenuhi saat darah diambil (atau dialokasikan dari stok), bukan saat pendonor menyanggupi.
- Pencocokan: radius → golongan (identik dulu; kompatibel hanya untuk PRC) → masa jeda 60 hari → batas 3 notifikasi/minggu. Undangan = 3 × kebutuhan yang belum tertutup.
- Engine setiap `ENGINE_INTERVAL_MS`: slot kedaluwarsa jadi NO_SHOW, batas waktu jadi EXPIRED, radius diperluas 5 km per gelombang sampai 15 km.
- Event realtime hanya berisi "ada perubahan"; klien mengambil ulang data lewat REST sesuai haknya. Klien tidak bisa menyiarkan panggilan darurat.
- Satu pendonor hanya memegang satu komitmen: saat menyanggupi atau selesai donor, undangan lain miliknya ditarik. Batas 3 notifikasi/minggu dihitung per kiriman, termasuk undangan ulang.
- Mutasi antarfaskes selalu diminta dulu dan baru berpindah setelah disetujui faskes sumber.
- Menonaktifkan faskes menutup panggilan aktifnya dan langsung mengunci token petugasnya; menonaktifkan akun juga langsung berlaku.
- Surat dokter disimpan di luar folder publik dan hanya bisa diunduh petugas faskes tujuan (tercatat di audit log).
- Kartu publik tidak memuat nomor telepon, nomor rekam medis, atau nama lengkap pasien.

## Endpoint

Semua di bawah `/api`. Respons: `{ success, message, data }` atau `{ success: false, error: { code, message, details? } }`. Token dikirim sebagai `Authorization: Bearer <token>`.

**Auth**

| Method | Path | Keterangan |
|---|---|---|
| POST | /auth/staff/login | `{ email, password }` → token petugas/admin |
| POST | /auth/otp/request | `{ phone, purpose: FAMILY\|DONOR }` |
| POST | /auth/otp/verify | `{ phone, purpose, code }` → token; pendonor terdaftar langsung dapat token pendonor |

**Publik**

| Method | Path | Keterangan |
|---|---|---|
| GET | /public/meta | golongan, komponen, kecamatan, parameter |
| GET | /public/faskes | daftar faskes aktif |
| GET | /public/cards/:token | kartu darurat real-time |

**Keluarga pasien** (token OTP `FAMILY`)

| Method | Path | Keterangan |
|---|---|---|
| POST | /requests | multipart: field form + `letter` (JPG/PNG/WEBP/PDF, maks 5 MB) |
| GET | /requests | pengajuan milik nomor ini |
| GET | /requests/:id | live tracker (pendonor menuju disamarkan) |
| POST | /requests/:id/cancel | batalkan |

**Petugas faskes** (token petugas; semua otomatis dibatasi ke faskes sendiri)

| Method | Path | Keterangan |
|---|---|---|
| GET | /faskes/me | profil faskes |
| GET | /faskes/me/stock | matriks komponen × golongan |
| POST | /faskes/me/stock/adjust | `{ component, bloodType, delta, note }` |
| GET | /faskes/me/movements?limit= | log mutasi |
| GET | /faskes/me/donor-pool | sebaran pendonor 15 km |
| GET | /faskes/me/arrivals | pendonor menuju / tiba |
| GET | /faskes/me/requests?scope=active\|history | daftar permintaan |
| GET | /faskes/me/requests/:id | detail + tiket + funnel gelombang |
| GET | /faskes/me/requests/:id/letter | unduh surat dokter |
| GET | /faskes/me/requests/:id/stock-options | stok sendiri & faskes terdekat |
| POST | /faskes/me/requests/:id/approve | |
| POST | /faskes/me/requests/:id/reject | `{ reason }` |
| POST | /faskes/me/requests/:id/allocate | alokasi stok internal |
| POST | /faskes/me/requests/:id/transfer | `{ fromFaskesId }`: minta mutasi, menunggu persetujuan faskes sumber |
| GET | /faskes/me/transfers | mutasi masuk (untuk disetujui) & permintaan kita |
| POST | /faskes/me/transfers/:id/approve | faskes sumber menyetujui: unit berpindah & dialokasikan |
| POST | /faskes/me/transfers/:id/reject | faskes sumber menolak |
| POST | /faskes/me/requests/:id/dispatch | `{ radiusKm, deadlineHours, escalateMinutes, allowCompatible }` |
| POST | /faskes/me/requests/:id/close | |
| POST | /faskes/me/tickets/scan | `{ code }` (dengan/tanpa prefix `BLOODSYNC:` / `TKT-`) |
| POST | /faskes/me/tickets/:id/screening | `{ sys, dia, hb, weight }` |
| POST | /faskes/me/tickets/:id/collect | selesai pengambilan |
| POST | /faskes/me/tickets/:id/no-show | lepas slot |

**Pendonor**

| Method | Path | Keterangan |
|---|---|---|
| POST | /donors/register | token OTP `DONOR`; `{ name, bloodType, area, lastDonationAt?, consentNotification, consentLocation }` |
| GET | /donors/me | dasbor lengkap: profil, eligibilitas, undangan, tiket aktif, hasil, lencana, riwayat, pengingat |
| PATCH | /donors/me/area | `{ area }` |
| DELETE | /donors/me | berhenti menerima panggilan (undangan & slot dilepas) |
| POST | /donors/me/reactivate | aktif kembali |
| POST | /donors/me/tickets/:id/respond | `{ accept }` |
| POST | /donors/me/tickets/:id/cancel | batal datang |
| POST | /donors/me/tickets/:id/ack | tandai hasil sudah dibaca |
| POST | /donors/me/demo/finish-recovery | hanya non-production |

**Super admin**

| Method | Path | Keterangan |
|---|---|---|
| GET | /admin/overview | jumlah per status, acceptance rate, median menit sampai terpenuhi |
| GET/POST | /admin/faskes | daftar / tambah (stok 0 dibuat otomatis) |
| PATCH | /admin/faskes/:id/active | `{ isActive }` |
| GET/POST | /admin/users | daftar / tambah akun |
| PATCH | /admin/users/:id/active | `{ isActive }` |
| GET | /admin/audit?page=&pageSize=&actor= | audit log |

## Socket.io

Hubungkan dengan `io(URL, { auth: { token } })`. Room dipilih dari token:

| Token | Event yang diterima |
|---|---|
| Petugas | `request:updated`, `faskes:updated` |
| Pendonor | `invite:new`, `donor:updated` |
| Keluarga | `request:updated` |
| Siapa saja | `socket.emit('card:subscribe', publicToken)` → `request:updated` |

## Produksi

- Set `NODE_ENV=production`, `JWT_SECRET` wajib, `EXPOSE_OTP` dan rute demo otomatis mati.
- Ganti adaptor `channels.push` / `channels.whatsapp` di `notification.service.ts` dengan FCM dan WhatsApp Business API.
- Simpan `uploads/` di storage privat (mis. S3 dengan signed URL) bila berjalan lebih dari satu instance.

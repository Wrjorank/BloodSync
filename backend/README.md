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
| Super admin | admin@bloodsync.id | `password` |
| Petugas RSUD Tarakan | tarakan@bloodsync.id | `password` |
| Petugas RS Hermina | hermina@bloodsync.id | `password` |
| Petugas RSUP Fatmawati | fatmawati@bloodsync.id | `password` |
| Petugas UDD PMI DKI | udd@bloodsync.id | `password` |

Seed tidak pernah menimpa kata sandi akun yang sudah ada. Kata sandi `password` hanya untuk development dan demo: sebelum aplikasi bisa diakses publik, buat akun baru lewat halaman admin lalu nonaktifkan akun seed. Seed menampilkan peringatan bila dijalankan dengan `NODE_ENV=production`.

Kode OTP tidak pernah dikembalikan oleh API. Tanpa `FONNTE_TOKEN` (hanya development), setiap pesan WhatsApp, termasuk OTP, dikirim lewat socket ke room `dev-inbox` dan tampil sebagai notifikasi di browser lokal. Pesan juga dicatat di terminal (`[otp] 0812****xxx kode 123456`). Room ini hanya bisa diikuti dari loopback tanpa header proxy, dan selalu mati di production.

## Struktur

```
prisma/
  schema.prisma           model data
  migrations/             migrasi SQL (init)
  seed.ts                 data awal (faskes, akun, stok, pendonor simulasi)
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
| GET | /faskes/me/export/:dataset?from=&to= | Excel: `stok`, `mutasi-stok`, `permintaan`, `tiket-donor`, `mutasi-antarfaskes` (hanya faskes sendiri) |
| GET | /faskes/me/import/stok/template | template stock opname, sudah berisi stok saat ini |
| POST | /faskes/me/import/stok[?commit=1] | multipart `file`; tanpa `commit` hanya diperiksa, dengan `commit=1` disimpan (semua atau tidak sama sekali) |

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
| POST | /donors/me/logout | cabut semua token pendonor (semua perangkat) |
| POST | /donors/me/demo/finish-recovery | hanya non-production |

**Super admin**

| Method | Path | Keterangan |
|---|---|---|
| GET | /admin/overview | jumlah per status, acceptance rate, median menit sampai terpenuhi |
| GET/POST | /admin/faskes | daftar / tambah (stok 0 dibuat otomatis) |
| PATCH | /admin/faskes/:id | edit nama, jenis, wilayah, alamat, koordinat |
| DELETE | /admin/faskes/:id | hapus; ditolak bila masih ada akun petugas atau sudah punya riwayat (nonaktifkan saja) |
| PATCH | /admin/faskes/:id/active | `{ isActive }` |
| GET/POST | /admin/users | daftar / tambah akun |
| PATCH | /admin/users/:id | edit nama, email, peran, faskes, kata sandi (opsional); ganti peran/faskes/sandi mencabut semua sesi pemilik akun |
| DELETE | /admin/users/:id | hapus akun; tidak bisa menghapus akun sendiri |
| PATCH | /admin/users/:id/active | `{ isActive }` |
| GET | /admin/audit?page=&pageSize=&actor= | audit log |
| GET | /admin/export/:dataset?from=&to=&actor= | Excel: `audit`, `faskes`, `akun`, `permintaan` (tanpa identitas pasien), `pendonor` (nama & nomor disamarkan) |
| GET | /admin/import/:dataset/template | template `faskes` atau `akun` (dengan sheet Petunjuk & Daftar Faskes) |
| POST | /admin/import/:dataset[?commit=1] | sama seperti import stok; `akun` mengembalikan file Excel berisi kata sandi awal |

## Socket.io

Hubungkan dengan `io(URL, { auth: { token } })`. Room dipilih dari token:

| Token | Event yang diterima |
|---|---|
| Petugas | `request:updated`, `faskes:updated` |
| Pendonor | `invite:new`, `donor:updated` |
| Keluarga | `request:updated` |
| Siapa saja | `socket.emit('card:subscribe', publicToken)` → `request:updated` |

## WhatsApp (Fonnte)

1. Daftar di fonnte.com, tambahkan device dan scan QR dengan nomor WA pengirim.
2. Salin token device ke `FONNTE_TOKEN`, isi `WA_WEBHOOK_SECRET` dengan string acak.
3. Di pengaturan device Fonnte, set webhook ke `PUBLIC_APP_URL/api/webhooks/whatsapp?secret=<WA_WEBHOOK_SECRET>`. Untuk server lokal, buka dengan tunnel (mis. `ngrok http 5000`).

Undangan panggilan darurat dan OTP dikirim lewat WA. Pendonor bisa membalas `1` (siap) atau `2` (tidak bisa); balasan diproses untuk undangan terbaru dan dijawab dengan kode tiket serta rute ke faskes. Tanpa token, pesan hanya dicatat di log.

## Produksi

- Salin `.env.production.example` menjadi `.env` di server, lalu isi semua nilainya. Server menolak start bila `JWT_SECRET` (min. 32 karakter), `CORS_ORIGIN` (bukan `*`), `FONNTE_TOKEN`, atau `WA_WEBHOOK_SECRET` (min. 16 karakter) kosong. Rute demo dan notifikasi WhatsApp lokal otomatis mati.
- Wajib HTTPS: GPS pendonor dan kamera pemindai QR hanya diizinkan browser di HTTPS (atau localhost).
- Set `TRUST_PROXY` sesuai jumlah reverse proxy di depan aplikasi (mis. `1` untuk nginx). Biarkan `0` bila tidak ada, karena header `X-Forwarded-For` palsu bisa dipakai menghindari rate limit.

## Keamanan

- Login petugas: rate limit per IP dan kunci per akun (5 gagal → 15 menit), pesan error sama untuk email tak dikenal dan sandi salah, waktu respons dibuat seragam (bcrypt dummy).
- Kata sandi: bcrypt cost 12, minimal 12 karakter dengan huruf besar, huruf kecil, angka, dan simbol.
- JWT: HS256 dikunci. Token petugas/admin membawa `tokenVersion`, peran, dan faskes yang dicocokkan ke DB di setiap request, jadi akun yang dinonaktifkan, dihapus, dipindah faskes, diganti peran, atau diganti sandinya langsung tertolak. Admin tidak bisa menghapus atau menurunkan peran akunnya sendiri, sehingga selalu ada minimal satu super admin. Token pendonor membawa `tokenVersion` yang dicocokkan ke DB di setiap request dan koneksi socket; logout menaikkan versi sehingga semua token di semua perangkat langsung mati.
- OTP: 6 digit acak kriptografis, disimpan sebagai hash, kedaluwarsa 5 menit, 5 percobaan, 3 kirim per 10 menit.
- Surat dokter: jenis berkas diverifikasi dari isi (magic bytes), nama berkas acak, disimpan di luar folder publik, hanya bisa dibuka petugas faskes tujuan, setiap akses tercatat di audit log.
- Content-Security-Policy: `script-src 'self'`. Semua library (Font Awesome, QR) di-host sendiri di `frontend/vendor/` dan Tailwind sudah di-build jadi CSS, jadi script sisipan maupun CDN yang disusupi tidak bisa berjalan. Satu-satunya pihak ketiga adalah Google Fonts.
- Header lain: `X-Frame-Options`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS di production.
- Pendonor dummy dari seed (`isSimulated`) hanya untuk development: nomornya fiktif dan bisa saja milik orang lain, jadi mereka tidak pernah di-WhatsApp. Di production, seed tidak membuatnya. Kalau database production ternyata berisi dummy, mereka tidak dipanggil Dispatch Engine, tidak dihitung di statistik, dan nomornya tidak bisa dipakai login.
- Di production, isi pesan WhatsApp (berisi nama pasien) tidak ditulis ke log.
- Export Excel: petugas hanya bisa mengekspor data faskesnya sendiri, admin tidak mendapat identitas pasien, setiap export tercatat di audit log (siapa, data apa, rentang, jumlah baris), dibatasi 30 kali per 10 menit dan 10.000 baris. Semua teks ditulis sebagai sel teks, sehingga isian seperti `=HYPERLINK(...)` tidak pernah menjadi formula.
- Import Excel: hanya `.xlsx` maksimal 2 MB, diproses di memori (tidak pernah ditulis ke disk), dibaca oleh parser kecil sendiri (`src/utils/xlsx.ts`) yang hanya mengekstrak 4 bagian XML yang dibutuhkan, membatasi ukuran hasil ekstrak 20 MB (anti zip bomb), dan tidak memproses entity XML. Simpan berjalan dalam satu transaksi: satu baris salah berarti tidak ada data yang masuk. Kata sandi akun hasil import dibuat acak, di-hash bcrypt, dan hanya muncul sekali di file unduhan (tidak di log maupun audit log). Pendonor dan permintaan darah sengaja tidak bisa di-import: pendonor wajib memberi persetujuan sendiri lewat OTP (UU PDP) dan permintaan wajib disertai surat dokter yang diverifikasi.
- Semua input divalidasi zod, query lewat Prisma (parameterized), semua teks pengguna di-escape sebelum masuk HTML.
- Ganti adaptor `channels.push` di `notification.service.ts` dengan FCM. Untuk volume besar, pertimbangkan WhatsApp Business API resmi menggantikan Fonnte.
- Simpan `uploads/` di storage privat (mis. S3 dengan signed URL) bila berjalan lebih dari satu instance.

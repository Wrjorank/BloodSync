# BloodSync — Logistik Darah & Notifikasi Donor Presisi

Sistem yang menghubungkan bank darah rumah sakit, UDD PMI, keluarga pasien, dan calon pendonor. Tujuannya memangkas waktu tunggu pasien kritis dan mencegah pasien dipindah-pindah antarfaskes karena stok darah.

## Menjalankan

Butuh Node.js 20+, MySQL 8, dan (opsional) Redis.

```bash
cd backend
cp .env.example .env      # isi DATABASE_URL dan JWT_SECRET
npm install
npm run setup             # generate client + migrasi + data awal (seed)
npm run dev
```

Buka **http://localhost:5000**. Backend sekaligus menyajikan semua halaman.

## Peran & halaman

Semua halaman ada di folder `frontend/`.

| Halaman | Peran | Isi |
|---|---|---|
| `faskes.html` | Petugas RS / UDD PMI | Stok per komponen × golongan, verifikasi surat dokter, alokasi stok & mutasi antarfaskes, Dispatch Engine, pindai tiket QR, skrining, pengambilan |
| `pasien.html` | Keluarga pasien | Pengajuan tanpa akun (OTP WhatsApp), unggah surat pengantar, live tracker, kartu darurat untuk disebar |
| `pendonor.html` | Calon pendonor | Registrasi OTP, notifikasi tertarget, tiket digital + navigasi, riwayat, lencana, pengingat siklus 60 hari |
| `kartu.html` | Publik | Kartu darurat terverifikasi; otomatis CLOSED saat kebutuhan terpenuhi |
| `admin.html` | Super admin | Ringkasan dampak, perizinan faskes, akun petugas, audit log |

Akun awal dibuat oleh seed, semuanya dengan kata sandi `password`:

- Super admin: `admin@bloodsync.id`
- Petugas: `tarakan@bloodsync.id`, `hermina@bloodsync.id`, `fatmawati@bloodsync.id`, `udd@bloodsync.id`

> Kata sandi `password` hanya untuk development dan demo. Sebelum aplikasi bisa diakses publik, ganti akun-akun ini (buat akun baru lewat halaman admin, lalu nonaktifkan akun seed).
- Pendonor & keluarga: masuk dengan OTP WhatsApp.

## WhatsApp: lokal vs production

| | Lokal (`FONNTE_TOKEN` kosong) | Production |
|---|---|---|
| OTP, undangan donor, kabar ke keluarga | muncul sebagai **notifikasi WhatsApp di layar** (kartu hijau di pojok kanan bawah, ada tombol salin kode OTP) di semua tab browser di komputer ini | dikirim ke WhatsApp asli lewat Fonnte |
| Balasan "1"/"2" pendonor | tidak ada (pendonor menjawab lewat aplikasi) | lewat webhook Fonnte |
| Syarat | tidak ada | `FONNTE_TOKEN` dan `WA_WEBHOOK_SECRET` wajib, lihat `backend/.env.production.example` |

Notifikasi lokal hanya diterima browser di komputer yang sama. Koneksi lewat tunnel atau proxy ditolak, dan fitur ini selalu mati di production. Kode OTP tidak pernah dikembalikan oleh API.

## Alur penggunaan (3 tab berdampingan)

1. **Pendonor**: nomor HP baru → OTP → daftar A+ di Menteng.
2. **Keluarga**: OTP → ajukan 2 kantong PRC A+ di RSUD Tarakan + foto surat.
3. **Faskes**: masuk RSUD Tarakan → buka surat → centang dokumen → setujui → Aktifkan Panggilan Darurat.
4. **Pendonor**: notifikasi muncul → Siap Mendonor → tiket QR.
5. **Faskes**: pindai tiket → skrining → Selesai Pengambilan → alokasikan sisa dari stok.
6. **Keluarga**: buka Kartu Darurat → status berubah jadi CLOSED.

Reset data: `npm run db:reset` di folder `backend`.

## Import & export Excel

Tombol **Import** dan **Export** ada di kanan atas dasbor faskes dan admin.

- **Export:** pilih jenis data dan rentang tanggal (opsional), lalu file `.xlsx` terunduh. Waktu dalam WIB, dan setiap export tercatat di audit log.
- **Import:**
  1. Unduh template.
  2. Isi di Excel, lalu pilih filenya. File langsung diperiksa, dan baris yang salah ditunjukkan beserta nomor barisnya.
  3. Klik Simpan. Ini hanya bisa dilakukan jika semua baris valid.

| Peran | Bisa di-import |
|---|---|
| Petugas faskes | Stok (stock opname): template sudah berisi stok saat ini, cukup ubah kolom Jumlah. Selisihnya dicatat sebagai mutasi stok. |
| Super admin | Faskes (banyak sekaligus), akun petugas (kata sandi awal dibuat acak dan diunduh sekali setelah disimpan) |

## Struktur

```
backend/                    API (Express + Prisma + Redis + Socket.io), lihat backend/README.md
  prisma/                   schema, migrasi, seed
  src/                      config, routes, controllers, services, middlewares, validations
frontend/                   disajikan langsung oleh backend di http://localhost:5000
  *.html                    satu halaman per peran (lihat tabel di atas)
  css/src/                  sumber CSS per halaman (Tailwind + komponen .inp, .btn-*, dst.)
  css/*.css                 hasil build, ikut di-commit sehingga deploy tidak butuh build
  js/
    store.js                klien API: sesi per peran, REST, realtime
    ui.js                   helper tampilan (escape, format, countdown, QR, toast)
    pages/                  logika per halaman: admin, faskes, pasien, pendonor, kartu
  vendor/                   library pihak ketiga yang di-host sendiri (Font Awesome, QR)
  assets/                   favicon
  tailwind.config.js        tema bersama (warna brand, font)
  build-css.js              build CSS per halaman
```

### Mengubah tampilan

Setelah menambah atau mengubah class Tailwind di HTML/JS, build ulang CSS:

```bash
cd frontend
npm install               # sekali saja
npm run build
```

Tanpa build, class baru tidak punya style.

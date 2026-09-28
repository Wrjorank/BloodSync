# BloodSync — Logistik Darah & Notifikasi Donor Presisi

Sistem yang menghubungkan bank darah rumah sakit, UDD PMI, keluarga pasien, dan calon pendonor. Tujuannya memangkas waktu tunggu pasien kritis dan mencegah pasien dipindah-pindah antarfaskes karena stok darah.

## Menjalankan

Butuh Node.js 20+, MySQL 8, dan (opsional) Redis.

```bash
cd backend
cp .env.example .env      # sesuaikan DATABASE_URL
npm install
npm run setup             # generate client + migrasi + data awal
npm run dev
```

Buka **http://localhost:5000**. Backend sekaligus menyajikan semua halaman.

## Peran & halaman

| Halaman | Peran | Isi |
|---|---|---|
| `faskes.html` | Petugas RS / UDD PMI | Stok per komponen × golongan, verifikasi surat dokter, alokasi stok & mutasi antarfaskes, Dispatch Engine, pindai tiket QR, skrining, pengambilan |
| `pasien.html` | Keluarga pasien | Pengajuan tanpa akun (OTP WhatsApp), unggah surat pengantar, live tracker, kartu darurat untuk disebar |
| `pendonor.html` | Calon pendonor | Registrasi OTP, notifikasi tertarget, tiket digital + navigasi, riwayat, lencana, pengingat siklus 60 hari |
| `kartu.html` | Publik | Kartu darurat terverifikasi; otomatis CLOSED saat kebutuhan terpenuhi |
| `admin.html` | Super admin | Ringkasan dampak, perizinan faskes, akun petugas, audit log |

Akun awal (dari seed):

- Petugas: `tarakan@bloodsync.id`, `hermina@bloodsync.id`, `fatmawati@bloodsync.id`, `udd@bloodsync.id`, kata sandi `Petugas#1234`
- Super admin: `admin@bloodsync.id` / `Admin#1234`
- Pendonor terdaftar: pilih dari menu "masuk cepat sebagai pendonor terdaftar". Selama development, kode OTP tampil di layar.

## Alur penggunaan (3 tab berdampingan)

1. **Pendonor**: nomor HP baru → OTP → daftar A+ di Menteng.
2. **Keluarga**: OTP → ajukan 2 kantong PRC A+ di RSUD Tarakan + foto surat.
3. **Faskes**: masuk RSUD Tarakan → buka surat → centang dokumen → setujui → Aktifkan Panggilan Darurat.
4. **Pendonor**: notifikasi muncul → Siap Mendonor → tiket QR.
5. **Faskes**: pindai tiket → skrining → Selesai Pengambilan → alokasikan sisa dari stok.
6. **Keluarga**: buka Kartu Darurat → status berubah jadi CLOSED.

Reset data: `npm run db:reset` di folder `backend`.

## Struktur

```
backend/          API (Express + Prisma + Redis + Socket.io), lihat backend/README.md
store.js          klien API: sesi per peran, REST, realtime
ui.js             helper tampilan (escape, format, countdown, QR, toast)
*.html / *.js     halaman per peran
_arsip/           kerangka React awal (tidak dipakai)
```

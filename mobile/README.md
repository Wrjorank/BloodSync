# BloodSync Pendonor (Flutter)

Aplikasi mobile untuk calon pendonor. Fiturnya sama dengan `frontend/pendonor.html` dan memakai API backend yang sama, jadi backend tidak perlu diubah.

- Masuk dengan OTP WhatsApp. Nomor yang belum terdaftar diarahkan ke form pendaftaran.
- Pendaftaran: golongan darah, kecamatan, tanggal terakhir donor, dan lokasi GPS (opsional).
- Panggilan darurat realtime (Socket.io), dengan getar dan bunyi, plus tombol Siap Mendonor / Tidak Bisa.
- Tiket digital berisi QR, hitung mundur slot, navigasi Google Maps, dan tombol batal datang.
- Hasil donor (berhasil, gagal skrining, tidak datang), lencana, riwayat, dan masa pemulihan 60 hari.
- Pengingat saat masa pemulihan selesai, termasuk faskes terdekat yang stoknya menipis.
- Berhenti sementara atau aktifkan lagi panggilan darurat, dan perbarui lokasi GPS.

Token disimpan di secure storage (Keystore/Keychain). Jika server menjawab 401, sesi dihapus dan aplikasi kembali ke layar masuk.

## Menjalankan

Butuh Flutter 3.35 atau lebih baru, serta backend yang sudah berjalan (lihat README di root).

```bash
cd mobile
# sekali saja: membuat folder platform android/ios. File yang sudah ada (lib/, manifest) tidak ditimpa
flutter create . --org id.bloodsync --project-name bloodsync_donor --platforms android,ios
flutter pub get

# emulator android (10.0.2.2 = localhost laptop)
flutter run

# hp fisik di wifi yang sama
flutter run --dart-define=API_BASE=http://192.168.1.10:5000
```

## OTP saat development

Selama `FONNTE_TOKEN` di backend masih kosong, OTP tidak dikirim ke WhatsApp. Kodenya bisa dilihat di dua tempat:

- log terminal backend: `[otp] 0812****789 kode 123456`
- notifikasi hijau di browser `http://localhost:5000` pada laptop yang menjalankan backend

## Demo bersama web

1. Di HP, daftar sebagai pendonor A+ di Menteng.
2. Di web `pasien.html`, ajukan PRC A+ di RSUD Tarakan.
3. Di web `faskes.html`, setujui pengajuan lalu klik Aktifkan Panggilan Darurat. Panggilan langsung muncul di HP.
4. Di HP, tekan Siap Mendonor. Tiket QR muncul.
5. Di web faskes, pindai QR dari layar HP, lalu lakukan skrining dan Selesai Pengambilan. HP menampilkan ucapan terima kasih dan lencana.

## Catatan

- iOS: tambahkan ke `ios/Runner/Info.plist` setelah `flutter create`:
  - `NSLocationWhenInUseUsageDescription` berisi alasan memakai lokasi
  - `NSAppTransportSecurity` → `NSAllowsLocalNetworking` = true, agar bisa memanggil backend http lokal
- HTTP tanpa TLS hanya diizinkan di build debug (`android/app/src/debug/AndroidManifest.xml`). Build release harus memakai `API_BASE` https.
- Panggilan darurat saat aplikasi tertutup butuh push notification (FCM). Backend sudah menyiapkan titiknya di `channels.push` (`backend/src/services/notification.service.ts`), jadi ini langkah berikutnya. Untuk sekarang, saat aplikasi tertutup pendonor tetap dihubungi lewat WhatsApp.

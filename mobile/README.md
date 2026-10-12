# BloodSync Mobile (Android)

Aplikasi Flutter untuk dua peran, sama dengan halaman web:

| Tab | Sama dengan | Isi |
|---|---|---|
| **Donor** | `/donor` | Masuk OTP WhatsApp, pendaftaran, panggilan darurat, tiket QR + navigasi, riwayat, lencana, masa pemulihan |
| **Pengajuan** | `/patient` | Pengajuan darah tanpa akun (verifikasi OTP WhatsApp), foto surat dokter, tracker real-time, Kartu Darurat untuk dibagikan |

Panggilan darurat sampai lewat **push notification** (Firebase Cloud Messaging) dan **WhatsApp**. Keluarga pasien juga menerima kabar pengajuan diverifikasi / terpenuhi lewat keduanya.

## Menjalankan

```bash
cd mobile
flutter pub get
flutter run                                   # memakai API staging https://bloodsync.delcom.org
flutter run --dart-define=API_BASE=http://10.0.2.2:5000      # backend lokal dari emulator
flutter run --dart-define=API_BASE=http://<ip-laptop>:5000   # backend lokal dari hp fisik (satu wifi)
```

Build APK untuk dibagikan:

```bash
flutter build apk --release
# hasil: build/app/outputs/flutter-apk/app-release.apk
```

## Push notification (Firebase)

Push opsional: tanpa file di bawah, aplikasi tetap jalan, notifikasi hanya lewat WhatsApp.

1. [console.firebase.google.com](https://console.firebase.google.com) → project **bloodsync** → **Project settings → General → Add app → Android**.
2. Android package name: **`id.bloodsync.app`** (harus persis). Nickname bebas, SHA-1 boleh dikosongkan.
3. Unduh **`google-services.json`** dan simpan di `mobile/android/app/google-services.json`.
4. Build ulang. Saat pendonor masuk atau keluarga memverifikasi nomor, aplikasi meminta izin notifikasi lalu mendaftarkan HP ini.

Backend memakai project Firebase yang sama (`FIREBASE_*` di `.env` server).

## Struktur

```
lib/
  api/          klien REST + sesi terenkripsi (pendonor dan keluarga terpisah)
  screens/      shell (navbar bawah), tab Donor (login, daftar, beranda), tab Pengajuan
  services/     push (FCM + notifikasi lokal), realtime (Socket.IO), lokasi
  state/        AppState (tab Donor), RequestState (tab Pengajuan), DonorController
  widgets/      kartu & komponen bersama
```

import 'package:geolocator/geolocator.dart';

class LocationFailure implements Exception {
  const LocationFailure(this.message);
  final String message;

  @override
  String toString() => message;
}

class GpsFix {
  const GpsFix(this.lat, this.lng);
  final double lat, lng;

  // backend hanya menerima titik di dalam kotak wilayah indonesia
  bool get inIndonesia => lat >= -11 && lat <= 6 && lng >= 94 && lng <= 142;
}

double _round5(double v) => (v * 1e5).round() / 1e5;

class LocationService {
  static Future<bool> granted() async {
    final p = await Geolocator.checkPermission();
    return p == LocationPermission.whileInUse || p == LocationPermission.always;
  }

  static Future<GpsFix> read() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationFailure('GPS mati. Nyalakan layanan lokasi di pengaturan HP.');
    }
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) {
      throw const LocationFailure('Izin lokasi ditolak. Aktifkan akses lokasi untuk BloodSync di pengaturan.');
    }
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)),
      );
      return GpsFix(_round5(pos.latitude), _round5(pos.longitude));
    } catch (_) {
      throw const LocationFailure('Lokasi GPS belum bisa dibaca. Coba lagi di area terbuka.');
    }
  }
}

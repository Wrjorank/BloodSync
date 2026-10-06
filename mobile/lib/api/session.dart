import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// token disimpan terenkripsi (keystore android / keychain ios), bukan di shared preferences biasa
class Session {
  static const _store = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  String? token;
  bool registered = false;
  String? phone;

  Future<void> load() async {
    try {
      token = await _store.read(key: 'token');
      registered = await _store.read(key: 'registered') == '1';
      phone = await _store.read(key: 'phone');
    } catch (_) {
      // kunci keystore bisa hilang setelah restore/instal ulang; mulai dari sesi kosong
      await clear();
    }
  }

  Future<void> save({required String token, required bool registered, String? phone}) async {
    this.token = token;
    this.registered = registered;
    this.phone = phone ?? this.phone;
    await _store.write(key: 'token', value: token);
    await _store.write(key: 'registered', value: registered ? '1' : '0');
    if (this.phone != null) await _store.write(key: 'phone', value: this.phone);
  }

  Future<String?> read(String key) => _store.read(key: key).catchError((_) => null);

  Future<void> write(String key, String value) => _store.write(key: key, value: value);

  Future<void> clear() async {
    token = null;
    registered = false;
    phone = null;
    try {
      await _store.deleteAll();
    } catch (_) {}
  }
}

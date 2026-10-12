import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// token disimpan terenkripsi (keystore android), bukan di shared preferences biasa.
// pendonor dan keluarga pasien punya sesi terpisah: satu hp bisa jadi pendonor sekaligus mengajukan darah
class Session {
  Session(this.scope);

  // 'donor' atau 'family'; jadi awalan semua kunci penyimpanan
  final String scope;
  static const _store = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  String? token;
  bool registered = false;
  String? phone;

  String _k(String key) => '$scope.$key';

  Future<void> load() async {
    try {
      token = await _store.read(key: _k('token'));
      registered = await _store.read(key: _k('registered')) == '1';
      phone = await _store.read(key: _k('phone'));
    } catch (_) {
      // kunci keystore bisa hilang setelah restore/instal ulang; mulai dari sesi kosong
      await clear();
    }
  }

  Future<void> save({required String token, bool registered = false, String? phone}) async {
    this.token = token;
    this.registered = registered;
    this.phone = phone ?? this.phone;
    await _store.write(key: _k('token'), value: token);
    await _store.write(key: _k('registered'), value: registered ? '1' : '0');
    if (this.phone != null) await _store.write(key: _k('phone'), value: this.phone);
  }

  Future<String?> read(String key) => _store.read(key: _k(key)).catchError((_) => null);

  Future<void> write(String key, String value) => _store.write(key: _k(key), value: value);

  Future<void> remove(String key) => _store.delete(key: _k(key)).catchError((_) {});

  // hanya kunci milik sesi ini; sesi yang lain tetap utuh
  Future<void> clear() async {
    token = null;
    registered = false;
    phone = null;
    try {
      final all = await _store.readAll();
      for (final key in all.keys.where((k) => k.startsWith('$scope.'))) {
        await _store.delete(key: key);
      }
    } catch (_) {}
  }
}

import 'package:flutter/foundation.dart';

import '../api/api.dart';
import '../api/session.dart';
import '../models/dashboard.dart';

enum Stage { loading, login, register, home }

// memilih layar mana yang terbuka berdasarkan token yang tersimpan
class AppState extends ChangeNotifier {
  AppState(this.api, this.session);

  final Api api;
  final Session session;
  Stage stage = Stage.loading;
  Meta? meta;

  Future<void> bootstrap() async {
    await loadMeta();
    if (session.token == null) return _go(Stage.login);
    try {
      final me = await api.me();
      if (me['kind'] == 'donor') {
        session.registered = true;
        return _go(Stage.home);
      }
      // otp sudah diverifikasi tapi pendaftaran belum selesai
      if (me['kind'] == 'phone' && me['purpose'] == 'DONOR') return _go(Stage.register);
      await session.clear();
      _go(Stage.login);
    } on ApiException catch (e) {
      if (e.status == 401) {
        await session.clear();
        return _go(Stage.login);
      }
      // server belum bisa dihubungi: buka layar terakhir, dashboard akan mencoba lagi sendiri
      _go(session.registered ? Stage.home : Stage.register);
    }
  }

  Future<void> loadMeta() async {
    if (meta != null) return;
    try {
      meta = Meta.fromJson(await api.meta());
      notifyListeners();
    } catch (_) {}
  }

  Future<void> verified({required String token, required bool registered, required String phone}) async {
    await session.save(token: token, registered: registered, phone: phone);
    _go(registered ? Stage.home : Stage.register);
  }

  Future<void> registered(String token) async {
    await session.save(token: token, registered: true);
    _go(Stage.home);
  }

  // revoke: cabut token di server (keluar dari semua perangkat); false bila sesi memang sudah tidak berlaku
  Future<void> logout({bool revoke = true}) async {
    if (revoke && session.registered) {
      try {
        await api.logout();
      } catch (_) {}
    }
    await session.clear();
    _go(Stage.login);
  }

  void _go(Stage next) {
    stage = next;
    notifyListeners();
  }
}

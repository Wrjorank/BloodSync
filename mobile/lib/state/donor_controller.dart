import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../api/api.dart';
import '../api/session.dart';
import '../models/dashboard.dart';
import '../services/location.dart';
import '../services/realtime.dart';
import 'notice.dart';

const _reminderKey = 'reminderDismissed';

class DonorController extends ChangeNotifier {
  DonorController(this.api, this.session, {required this.onSessionExpired});

  final Api api;
  final Session session;
  final VoidCallback onSessionExpired;

  Dashboard? dash;
  String? error;
  bool gpsBusy = false;
  String? dismissedReminder;

  final _notices = StreamController<Notice>.broadcast();
  Stream<Notice> get notices => _notices.stream;

  final _realtime = Realtime();
  Timer? _poll, _debounce;
  String? _alertedInvite;
  bool _responding = false, _gpsSynced = false, _disposed = false;

  Future<void> start() async {
    dismissedReminder = await session.read(_reminderKey);
    final token = session.token;
    if (token != null) _realtime.connect(token, _trigger);
    // polling lambat menutup celah bila koneksi socket terputus
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => load());
    await load();
    syncGps(silent: true);
  }

  void _trigger() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 150), load);
  }

  Future<void> load() async {
    if (_disposed) return;
    try {
      final next = Dashboard.fromJson(await api.dashboard());
      // jawaban sedang dikirim; jangan munculkan lagi undangan yang sama
      if (_responding) next.invite = null;
      _onInviteChange(dash?.invite, next.invite);
      dash = next;
      error = null;
    } on ApiException catch (e) {
      if (e.status == 401) return onSessionExpired();
      error = e.message;
    }
    _changed();
  }

  void _onInviteChange(Invite? before, Invite? after) {
    if (after == null) {
      if (before != null) _notify('Panggilan ditarik: kebutuhan pendonor sudah tercukupi.');
      _alertedInvite = null;
      return;
    }
    if (after.ticketId != _alertedInvite) {
      _alertedInvite = after.ticketId;
      _alarm();
    }
  }

  Future<void> _alarm() async {
    for (var i = 0; i < 3; i++) {
      HapticFeedback.vibrate();
      SystemSound.play(SystemSoundType.alert);
      await Future<void>.delayed(const Duration(milliseconds: 600));
    }
  }

  Future<void> respond(bool accept) async {
    final invite = dash?.invite;
    if (invite == null) return;
    _responding = true;
    dash!.invite = null;
    _changed();
    try {
      final r = await api.respond(invite.ticketId, accept);
      final status = r['status'];
      if (status == 'QUOTA_FULL' || status == 'NOT_ELIGIBLE') {
        _notify('${r['message']}');
      } else if (accept) {
        _notify('Slot dikunci untuk Anda. Tunjukkan QR tiket saat tiba.', NoticeKind.success);
      } else {
        _notify('Terima kasih. Panggilan dialihkan ke pendonor cadangan.');
      }
    } on ApiException catch (e) {
      _notify(e.message, NoticeKind.error);
    }
    _responding = false;
    await load();
  }

  Future<void> cancelTicket(String id) => _run(() => api.cancel(id), 'Kedatangan dibatalkan. Terima kasih sudah memberi tahu.');

  Future<void> acknowledge(String id) => _run(() => api.acknowledge(id));

  Future<void> finishRecovery() => _run(api.finishRecovery);

  Future<void> setAvailable(bool on) => _run(
        on ? api.reactivate : api.deactivate,
        on ? 'Profil aktif kembali.' : 'Anda tidak akan menerima panggilan darurat.',
      );

  Future<void> _run(Future<void> Function() action, [String? success]) async {
    try {
      await action();
      if (success != null) _notify(success, NoticeKind.success);
      await load();
    } on ApiException catch (e) {
      _notify(e.message, NoticeKind.error);
    }
  }

  // silent: hanya sekali per sesi dan hanya bila izin sudah diberikan, tanpa memunculkan dialog izin
  Future<void> syncGps({bool silent = false}) async {
    if (gpsBusy) return;
    if (silent && (_gpsSynced || !await LocationService.granted())) return;
    gpsBusy = true;
    _changed();
    try {
      final fix = await LocationService.read();
      if (!fix.inIndonesia) throw const LocationFailure('Lokasi terbaca di luar Indonesia, jadi tidak disimpan.');
      final r = await api.updateLocation(fix.lat, fix.lng);
      _gpsSynced = true;
      if (!silent) _notify('Lokasi GPS diperbarui (sekitar ${r['area']}).', NoticeKind.success);
      await load();
    } on LocationFailure catch (e) {
      if (!silent) _notify(e.message, NoticeKind.error);
    } on ApiException catch (e) {
      if (!silent) _notify(e.message, NoticeKind.error);
    } finally {
      gpsBusy = false;
      _changed();
    }
  }

  Future<void> dismissReminder(String key) async {
    dismissedReminder = key;
    _changed();
    await session.write(_reminderKey, key);
  }

  void _notify(String text, [NoticeKind kind = NoticeKind.info]) {
    if (!_disposed) _notices.add(Notice(text, kind));
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _debounce?.cancel();
    _realtime.close();
    _notices.close();
    super.dispose();
  }
}

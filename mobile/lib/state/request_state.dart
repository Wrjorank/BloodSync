import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api.dart';
import '../services/push.dart';
import '../services/realtime.dart';
import 'notice.dart';

const activeStatuses = ['PENDING_VERIFICATION', 'APPROVED', 'BROADCASTING'];

// tab Pengajuan: sama dengan halaman /patient di web. tanpa akun; nomor whatsapp keluarga diverifikasi otp,
// lalu pengajuan aktif dipantau langsung (realtime + polling cadangan)
class RequestState extends ChangeNotifier {
  RequestState(this.api, this.push);

  final Api api;
  final PushService push;
  final _realtime = Realtime();
  Timer? _poll;
  Timer? _debounce;
  int _seq = 0;

  List<Map<String, dynamic>> hospitals = [];
  String? otpSentTo;
  Map<String, dynamic>? current;
  bool busy = false;
  // diisi controller; layar menampilkannya sebagai snackbar lalu mengosongkannya
  Notice? notice;
  String? _lastStatus;
  int? _lastFulfilled;

  bool get verified => api.family.token != null;
  String? get phone => api.family.phone;
  String? get requestId => current?['id'] as String?;

  Future<void> init() async {
    unawaited(loadHospitals());
    if (!verified) return notifyListeners();
    _watch();
    final saved = await api.family.read('requestId');
    if (saved != null) await open(saved);
  }

  Future<void> loadHospitals() async {
    try {
      hospitals = (await api.facilities()).where((f) => f['type'] == 'RS').toList();
      notifyListeners();
    } catch (_) {}
  }

  // ---------- verifikasi nomor ----------
  Future<void> sendOtp(String phone) => _run(() async {
        await api.requestOtp(phone, purpose: 'FAMILY');
        otpSentTo = phone;
        notice = const Notice('Kode OTP dikirim ke WhatsApp Anda.');
      });

  Future<void> verifyOtp(String code) => _run(() async {
        final r = await api.verifyOtp(otpSentTo!, code, purpose: 'FAMILY');
        await api.family.save(token: '${r['token']}', phone: _normalize(otpSentTo!));
        otpSentTo = null;
        _watch();
        unawaited(push.attachFamily());
        // melanjutkan pengajuan aktif yang dibuat sebelumnya dari nomor ini
        final mine = await api.myRequests();
        final active = mine.where((r) => activeStatuses.contains(r['status'])).firstOrNull;
        if (active != null) {
          notice = Notice('Melanjutkan pengajuan aktif ${active['code']}.');
          await open('${active['id']}');
        }
      });

  // nomor lain: sesi keluarga di hp ini dilepas, form kosong lagi
  Future<void> changeNumber() async {
    await push.detachFamily();
    _stop();
    await api.family.clear();
    current = null;
    otpSentTo = null;
    notifyListeners();
  }

  // ---------- pengajuan ----------
  Future<bool> submit(Map<String, String> fields, List<int> letter, String filename) async {
    var ok = false;
    await _run(() async {
      final created = await api.createRequest(fields, letter: letter, filename: filename);
      notice = const Notice('Pengajuan terkirim. Menunggu verifikasi faskes.', NoticeKind.success);
      await open('${created['id']}');
      ok = true;
    });
    return ok;
  }

  Future<void> open(String id) async {
    await api.family.write('requestId', id);
    await refresh(id: id);
  }

  Future<void> refresh({String? id}) async {
    final target = id ?? requestId;
    if (target == null) return;
    final seq = ++_seq;
    try {
      final req = await api.request(target);
      if (seq != _seq) return;
      _announce(req);
      current = req;
      notifyListeners();
    } on ApiException catch (e) {
      if (seq != _seq) return;
      if (e.status == 401) return _expired();
      if (e.status == 404) {
        await api.family.remove('requestId');
        current = null;
        return notifyListeners();
      }
    }
  }

  Future<void> cancel() => _run(() async {
        await api.cancelRequest(requestId!);
        await refresh();
      });

  // pengajuan selesai/ditolak: kembali ke form, nomor tetap terverifikasi
  Future<void> startNew() async {
    await api.family.remove('requestId');
    current = null;
    _lastStatus = null;
    _lastFulfilled = null;
    notifyListeners();
  }

  // ---------- internal ----------
  void _watch() {
    final token = api.family.token;
    if (token == null) return;
    _realtime.connect(token, _trigger, events: const ['request:updated']);
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => refresh());
  }

  void _trigger() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), refresh);
  }

  void _stop() {
    _realtime.close();
    _poll?.cancel();
    _debounce?.cancel();
    _seq++;
  }

  Future<void> _expired() async {
    _stop();
    await api.family.clear();
    current = null;
    notice = const Notice('Sesi berakhir, verifikasi nomor WhatsApp lagi.', NoticeKind.error);
    notifyListeners();
  }

  // toast saat status bergerak maju, sama dengan web
  void _announce(Map<String, dynamic> req) {
    final status = req['status'] as String;
    final fulfilled = (req['progress'] as Map)['fulfilled'] as int;
    if (_lastStatus != null && _lastStatus != status) {
      const messages = {
        'APPROVED': 'Pengajuan diverifikasi faskes.',
        'BROADCASTING': 'Panggilan darurat aktif. Sebarkan Kartu Darurat bila perlu.',
        'FULFILLED': 'Kebutuhan darah terpenuhi. Tautan publik sudah dikunci.',
        'REJECTED': 'Pengajuan ditolak faskes.',
        'EXPIRED': 'Batas waktu panggilan terlewati.',
      };
      final text = messages[status];
      if (text != null) notice = Notice(text, status == 'REJECTED' ? NoticeKind.error : NoticeKind.success);
    } else if (_lastFulfilled != null && fulfilled > _lastFulfilled!) {
      notice = Notice('$fulfilled dari ${(req['progress'] as Map)['needed']} kantong terpenuhi.', NoticeKind.success);
    }
    _lastStatus = status;
    _lastFulfilled = fulfilled;
  }

  Future<void> _run(Future<void> Function() action) async {
    busy = true;
    notifyListeners();
    try {
      await action();
    } on ApiException catch (e) {
      if (e.status == 401 && verified) {
        await _expired();
      } else {
        notice = Notice(e.message, NoticeKind.error);
      }
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  static String _normalize(String phone) {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    return digits.startsWith('62') ? '0${digits.substring(2)}' : digits;
  }

  @override
  void dispose() {
    _stop();
    super.dispose();
  }
}

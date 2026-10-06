import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import 'session.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);

  final int status;
  final String code;
  final String message;

  @override
  String toString() => message;
}

// klien rest BloodSync; semua aturan bisnis tetap di backend
class Api {
  Api(this.session);

  final Session session;
  final _http = http.Client();
  static const _timeout = Duration(seconds: 15);

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body}) async {
    final req = http.Request(method, Uri.parse('$apiBase/api$path'));
    req.headers['Accept'] = 'application/json';
    final token = session.token;
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }

    Future<http.Response> call() async => http.Response.fromStream(await _http.send(req));
    final http.Response res;
    try {
      res = await call().timeout(_timeout);
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Server tidak dapat dihubungi. Pastikan backend berjalan dan alamat API benar.');
    }

    dynamic json;
    try {
      json = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {}
    if (res.statusCode >= 400 || json is! Map || json['success'] != true) {
      final err = json is Map ? json['error'] : null;
      throw ApiException(
        res.statusCode,
        err is Map ? '${err['code']}' : 'ERROR',
        err is Map ? '${err['message']}' : 'Permintaan gagal (${res.statusCode})',
      );
    }
    return json['data'];
  }

  Future<Map<String, dynamic>> _map(String method, String path, {Map<String, dynamic>? body}) async =>
      Map<String, dynamic>.from(await _send(method, path, body: body) as Map);

  // ---------- publik & auth ----------
  Future<Map<String, dynamic>> meta() => _map('GET', '/public/meta');

  Future<void> requestOtp(String phone) => _send('POST', '/auth/otp/request', body: {'phone': phone, 'purpose': 'DONOR'});

  Future<Map<String, dynamic>> verifyOtp(String phone, String code) =>
      _map('POST', '/auth/otp/verify', body: {'phone': phone, 'purpose': 'DONOR', 'code': code});

  Future<Map<String, dynamic>> me() => _map('GET', '/auth/me');

  // ---------- pendonor ----------
  Future<Map<String, dynamic>> register(Map<String, dynamic> body) => _map('POST', '/donors/register', body: body);

  Future<Map<String, dynamic>> dashboard() => _map('GET', '/donors/me');

  Future<Map<String, dynamic>> updateLocation(double lat, double lng) =>
      _map('PATCH', '/donors/me/location', body: {'lat': lat, 'lng': lng});

  Future<Map<String, dynamic>> respond(String ticketId, bool accept) =>
      _map('POST', '/donors/me/tickets/$ticketId/respond', body: {'accept': accept});

  Future<void> cancel(String ticketId) => _send('POST', '/donors/me/tickets/$ticketId/cancel');

  Future<void> acknowledge(String ticketId) => _send('POST', '/donors/me/tickets/$ticketId/ack');

  Future<void> finishRecovery() => _send('POST', '/donors/me/demo/finish-recovery');

  Future<void> deactivate() => _send('DELETE', '/donors/me');

  Future<void> reactivate() => _send('POST', '/donors/me/reactivate');

  Future<void> logout() => _send('POST', '/donors/me/logout');
}

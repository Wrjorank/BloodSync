import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

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

// klien rest BloodSync; semua aturan bisnis tetap di backend.
// endpoint pendonor memakai sesi donor, endpoint pengajuan memakai sesi keluarga
class Api {
  Api({required this.donor, required this.family});

  final Session donor;
  final Session family;
  final _http = http.Client();
  static const _timeout = Duration(seconds: 20);

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body, String? token}) async {
    final req = http.Request(method, Uri.parse('$apiBase/api$path'));
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    return _dispatch(req, token);
  }

  Future<dynamic> _dispatch(http.BaseRequest req, String? token) async {
    req.headers['Accept'] = 'application/json';
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req)).timeout(_timeout);
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Server tidak dapat dihubungi. Periksa koneksi internet Anda.');
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

  Future<Map<String, dynamic>> _map(String method, String path, {Map<String, dynamic>? body, String? token}) async =>
      Map<String, dynamic>.from(await _send(method, path, body: body, token: token) as Map);

  // ---------- publik & auth ----------
  Future<Map<String, dynamic>> meta() => _map('GET', '/public/meta');

  Future<List<Map<String, dynamic>>> facilities() async {
    dynamic list;
    try {
      list = await _send('GET', '/public/facilities');
    } on ApiException catch (e) {
      // server yang belum diperbarui masih memakai nama lama endpoint ini
      if (e.status != 404) rethrow;
      list = await _send('GET', '/public/faskes');
    }
    return (list as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // purpose: DONOR untuk tab Donor, FAMILY untuk tab Pengajuan
  Future<void> requestOtp(String phone, {String purpose = 'DONOR'}) =>
      _send('POST', '/auth/otp/request', body: {'phone': phone, 'purpose': purpose});

  Future<Map<String, dynamic>> verifyOtp(String phone, String code, {String purpose = 'DONOR'}) =>
      _map('POST', '/auth/otp/verify', body: {'phone': phone, 'purpose': purpose, 'code': code});

  Future<Map<String, dynamic>> me() => _map('GET', '/auth/me', token: donor.token);

  // ---------- pendonor ----------
  Future<Map<String, dynamic>> register(Map<String, dynamic> body) => _map('POST', '/donors/register', body: body, token: donor.token);

  Future<Map<String, dynamic>> dashboard() => _map('GET', '/donors/me', token: donor.token);

  Future<Map<String, dynamic>> updateLocation(double lat, double lng) =>
      _map('PATCH', '/donors/me/location', body: {'lat': lat, 'lng': lng}, token: donor.token);

  Future<Map<String, dynamic>> respond(String ticketId, bool accept) =>
      _map('POST', '/donors/me/tickets/$ticketId/respond', body: {'accept': accept}, token: donor.token);

  Future<void> cancel(String ticketId) => _send('POST', '/donors/me/tickets/$ticketId/cancel', token: donor.token);

  Future<void> acknowledge(String ticketId) => _send('POST', '/donors/me/tickets/$ticketId/ack', token: donor.token);

  Future<void> finishRecovery() => _send('POST', '/donors/me/demo/finish-recovery', token: donor.token);

  Future<void> deactivate() => _send('DELETE', '/donors/me', token: donor.token);

  Future<void> reactivate() => _send('POST', '/donors/me/reactivate', token: donor.token);

  Future<void> logout() => _send('POST', '/donors/me/logout', token: donor.token);

  Future<void> addDonorPushToken(String token) => _send('POST', '/donors/me/push-tokens', body: {'token': token}, token: donor.token);

  Future<void> removeDonorPushToken(String token) =>
      _send('DELETE', '/donors/me/push-tokens', body: {'token': token}, token: donor.token);

  // ---------- pengajuan darah (keluarga pasien) ----------
  Future<List<Map<String, dynamic>>> myRequests() async =>
      (await _send('GET', '/requests', token: family.token) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  Future<Map<String, dynamic>> request(String id) => _map('GET', '/requests/$id', token: family.token);

  Future<void> cancelRequest(String id) => _send('POST', '/requests/$id/cancel', token: family.token);

  // multipart: data pasien + foto surat pengantar dokter
  Future<Map<String, dynamic>> createRequest(Map<String, String> fields, {required List<int> letter, required String filename}) async {
    final req = http.MultipartRequest('POST', Uri.parse('$apiBase/api/requests'))
      ..fields.addAll(fields)
      ..files.add(http.MultipartFile.fromBytes('letter', letter, filename: filename, contentType: _mime(filename)));
    return Map<String, dynamic>.from(await _dispatch(req, family.token) as Map);
  }

  Future<void> addFamilyPushToken(String token) => _send('POST', '/requests/push-tokens', body: {'token': token}, token: family.token);

  Future<void> removeFamilyPushToken(String token) =>
      _send('DELETE', '/requests/push-tokens', body: {'token': token}, token: family.token);

  static MediaType _mime(String name) {
    final ext = name.split('.').last.toLowerCase();
    return switch (ext) {
      'png' => MediaType('image', 'png'),
      'webp' => MediaType('image', 'webp'),
      'pdf' => MediaType('application', 'pdf'),
      _ => MediaType('image', 'jpeg'),
    };
  }
}

import 'dart:async';
import 'dart:convert';
import 'dart:ui' show Color;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/api.dart';
import '../api/session.dart';

// tab yang dibuka saat notifikasi diketuk: pendonor (panggilan darurat) atau pengajuan (kabar ke keluarga)
enum PushRoute { donor, request }

// push notification lewat firebase cloud messaging. saat aplikasi tertutup, android sendiri yang menampilkan
// notifikasinya; saat terbuka, notifikasi ditampilkan di sini. tanpa google-services.json semuanya diam (push mati)
class PushService {
  PushService(this.api);

  final Api api;
  final _local = FlutterLocalNotificationsPlugin();
  final _opened = StreamController<PushRoute>.broadcast();
  bool _ready = false;

  // id kanal sama dengan yang dikirim backend (android.notification.channelId)
  static const _emergency = AndroidNotificationChannel(
    'emergency', 'Panggilan darurat',
    description: 'Panggilan donor darah di dekat Anda',
    importance: Importance.max,
  );
  static const _updates = AndroidNotificationChannel(
    'updates', 'Kabar pengajuan',
    description: 'Status pengajuan darah dan tiket donor',
    importance: Importance.high,
  );

  bool get enabled => _ready;

  // diketuk dari notifikasi: shell pindah ke tab yang sesuai
  Stream<PushRoute> get opened => _opened.stream;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[push] firebase belum diatur, push dimatikan: $e');
      return;
    }
    final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(_emergency);
    await android?.createNotificationChannel(_updates);
    await _local.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('ic_notification')),
      onDidReceiveNotificationResponse: (r) => _open(r.payload == null ? null : jsonDecode(r.payload!) as Map<String, dynamic>),
    );

    // aplikasi terbuka: android tidak menampilkan push sendiri, jadi ditampilkan di sini
    FirebaseMessaging.onMessage.listen(_showForeground);
    // aplikasi di latar belakang lalu notifikasinya diketuk
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data));
    // aplikasi mati lalu dibuka dari notifikasi
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _open(initial.data);
    // token baru (instal ulang data, rotasi google): ikut ke akun yang sedang masuk
    FirebaseMessaging.instance.onTokenRefresh.listen((_) => syncAll());
    _ready = true;
  }

  // aplikasi dibuka dari notifikasi saat masih mati: shell belum mendengarkan, jadi rutenya disimpan dulu
  PushRoute? pending;

  PushRoute? takePending() {
    final route = pending;
    pending = null;
    return route;
  }

  void _open(Map<String, dynamic>? data) {
    final route = switch (data?['route']) {
      'donor' => PushRoute.donor,
      'request' => PushRoute.request,
      _ => null,
    };
    if (route == null) return;
    if (_opened.hasListener) {
      _opened.add(route);
    } else {
      pending = route;
    }
  }

  Future<void> _showForeground(RemoteMessage m) async {
    final n = m.notification;
    if (n == null) return;
    final urgent = m.data['route'] == 'donor';
    final channel = urgent ? _emergency : _updates;
    await _local.show(
      id: m.messageId.hashCode,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id, channel.name,
          channelDescription: channel.description,
          importance: channel.importance,
          priority: urgent ? Priority.max : Priority.high,
          icon: 'ic_notification',
          color: const Color(0xFFE11D48),
          styleInformation: BigTextStyleInformation(n.body ?? ''),
        ),
      ),
      payload: jsonEncode(m.data),
    );
  }

  // android 13+ menampilkan dialog izin; dipanggil saat orang masuk, bukan saat aplikasi dibuka
  Future<String?> _token() async {
    if (!_ready) return null;
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
    return FirebaseMessaging.instance.getToken();
  }

  // pendonor masuk: panggilan darurat masuk ke hp ini
  Future<void> attachDonor() => _attach(api.donor, api.addDonorPushToken);

  // keluarga memverifikasi nomornya: kabar pengajuan masuk ke hp ini
  Future<void> attachFamily() => _attach(api.family, api.addFamilyPushToken);

  Future<void> _attach(Session session, Future<void> Function(String) save) async {
    if (session.token == null) return;
    try {
      final token = await _token();
      if (token == null) return;
      await save(token);
      await session.write('push', token);
    } catch (e) {
      debugPrint('[push] gagal mendaftarkan token: $e');
    }
  }

  // keluar: hp ini berhenti menerima untuk akun itu. dipanggil sebelum sesinya dihapus
  Future<void> detachDonor() => _detach(api.donor, api.removeDonorPushToken);

  Future<void> detachFamily() => _detach(api.family, api.removeFamilyPushToken);

  Future<void> _detach(Session session, Future<void> Function(String) remove) async {
    final token = await session.read('push');
    if (token == null || session.token == null) return;
    try {
      await remove(token);
    } catch (_) {}
    await session.remove('push');
  }

  // dipanggil saat aplikasi dibuka dan saat token berganti
  Future<void> syncAll() async {
    if (api.donor.token != null && api.donor.registered) await attachDonor();
    if (api.family.token != null) await attachFamily();
  }
}

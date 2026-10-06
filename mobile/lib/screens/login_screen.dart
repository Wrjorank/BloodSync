import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api.dart';
import '../state/app_state.dart';
import '../state/notice.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/emergency_request.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.app});
  final AppState app;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  String? _sentTo;
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _guard(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) showNotice(context, Notice(e.message, NoticeKind.error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() => _guard(() async {
        final phone = _phone.text.trim();
        await widget.app.api.requestOtp(phone);
        if (!mounted) return;
        setState(() => _sentTo = phone);
        showNotice(context, const Notice('Kode OTP dikirim ke WhatsApp Anda.'));
      });

  // nomor terdaftar langsung masuk; nomor baru lanjut ke pendaftaran
  Future<void> _verify() => _guard(() async {
        final phone = _sentTo!;
        final r = await widget.app.api.verifyOtp(phone, _otp.text.trim());
        await widget.app.verified(token: '${r['token']}', registered: r['registered'] == true, phone: phone);
      });

  @override
  Widget build(BuildContext context) {
    final sent = _sentTo != null;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          children: [
            const Row(children: [
              BrandMark(),
              SizedBox(width: 12),
              Text('BloodSync', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Slate.c900)),
            ]),
            const SizedBox(height: 36),
            const Text('Jadi pendonor siaga',
                style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Slate.c900, height: 1.2)),
            const SizedBox(height: 8),
            Text(
              'Masuk dengan nomor WhatsApp. Anda hanya dihubungi bila pasien di sekitar membutuhkan golongan darah Anda'
              '${widget.app.meta != null ? ', maksimal ${widget.app.meta!.maxAlertsPerWeek} kali seminggu' : ''}.',
              style: const TextStyle(color: Slate.c500, height: 1.5),
            ),
            const SizedBox(height: 28),
            TextField(
              controller: _phone,
              enabled: !sent,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+]'))],
              decoration: const InputDecoration(
                labelText: 'Nomor WhatsApp',
                hintText: '0812xxxxxxxx',
                prefixIcon: Icon(Icons.phone_iphone),
              ),
            ),
            const SizedBox(height: 16),
            if (!sent)
              FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Mengirim…' : 'Kirim kode OTP'))
            else ...[
              TextField(
                controller: _otp,
                autofocus: true,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
                decoration: const InputDecoration(labelText: 'Kode OTP', counterText: ''),
                onSubmitted: (_) => _verify(),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : _verify, child: Text(_busy ? 'Memeriksa…' : 'Verifikasi')),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _sentTo = null;
                          _otp.clear();
                        }),
                child: const Text('Ganti nomor atau kirim ulang kode'),
              ),
            ],
            const SizedBox(height: 28),
            const EmergencyRequestCard(),
            if (widget.app.meta?.devInbox == true) ...[
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  border: Border.all(color: const Color(0xFFBBF7D0)),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'Mode lokal: WhatsApp belum tersambung. Kode OTP muncul sebagai notifikasi di browser '
                  'http://localhost:5000 pada laptop yang menjalankan backend, dan di log terminal backend.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF166534), height: 1.5),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

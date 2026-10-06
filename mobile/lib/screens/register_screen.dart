import 'package:flutter/material.dart';

import '../api/api.dart';
import '../services/location.dart';
import '../state/app_state.dart';
import '../state/notice.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/emergency_request.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.app});
  final AppState app;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  String? _abo, _area;
  String _rh = '+';
  DateTime? _lastDonation;
  bool _consentNotif = false, _consentGps = false, _busy = false;

  @override
  void initState() {
    super.initState();
    widget.app.loadMeta();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _lastDonation ?? now,
      firstDate: DateTime(now.year - 20),
      lastDate: now,
      helpText: 'Tanggal terakhir donor',
    );
    if (picked != null) setState(() => _lastDonation = picked);
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (!_consentNotif || !_consentGps) {
      showNotice(context, const Notice('Kedua persetujuan wajib dicentang untuk menerima panggilan darurat.', NoticeKind.error));
      return;
    }
    setState(() => _busy = true);
    // gps sifatnya opsional: bila ditolak atau lambat, backend memakai titik tengah kecamatan
    GpsFix? fix;
    try {
      fix = await LocationService.read();
      if (!fix.inIndonesia) fix = null;
    } catch (_) {}
    try {
      final r = await widget.app.api.register({
        'name': _name.text.trim(),
        'bloodType': '$_abo$_rh',
        'area': _area,
        if (fix != null) 'lat': fix.lat,
        if (fix != null) 'lng': fix.lng,
        'lastDonationAt': _lastDonation == null ? null : isoDay(_lastDonation!),
        'consentNotification': true,
        'consentLocation': true,
      });
      if (!mounted) return;
      showNotice(
        context,
        Notice(
          fix != null
              ? 'Profil aktif. Lokasi GPS Anda tersimpan untuk menghitung jarak ke faskes.'
              : 'Profil aktif. GPS tidak tersedia, memakai lokasi kecamatan $_area.',
          NoticeKind.success,
        ),
      );
      await widget.app.registered('${r['token']}');
    } on ApiException catch (e) {
      if (mounted) showNotice(context, Notice(e.message, NoticeKind.error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final areas = widget.app.meta?.areas ?? const <String>[];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Daftar pendonor'),
        backgroundColor: Slate.c50,
        actions: [TextButton(onPressed: () => widget.app.logout(revoke: false), child: const Text('Ganti nomor'))],
      ),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              Text('Nomor ${widget.app.session.phone ?? ''} sudah terverifikasi.',
                  style: const TextStyle(color: Slate.c500)),
              const SizedBox(height: 20),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Nama lengkap'),
                validator: (v) => (v ?? '').trim().length < 2 ? 'Nama minimal 2 karakter' : null,
              ),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                  flex: 3,
                  child: DropdownButtonFormField<String>(
                    initialValue: _abo,
                    decoration: const InputDecoration(labelText: 'Golongan darah'),
                    items: const ['A', 'B', 'AB', 'O'].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                    onChanged: (v) => setState(() => _abo = v),
                    validator: (v) => v == null ? 'Pilih golongan' : null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    initialValue: _rh,
                    decoration: const InputDecoration(labelText: 'Rhesus'),
                    items: const [
                      DropdownMenuItem(value: '+', child: Text('+ (positif)')),
                      DropdownMenuItem(value: '-', child: Text('− (negatif)')),
                    ],
                    onChanged: (v) => setState(() => _rh = v ?? '+'),
                  ),
                ),
              ]),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _area,
                decoration: const InputDecoration(labelText: 'Kecamatan domisili'),
                items: areas.map((a) => DropdownMenuItem(value: a, child: Text(a))).toList(),
                onChanged: (v) => setState(() => _area = v),
                validator: (v) => v == null ? 'Pilih kecamatan' : null,
              ),
              const SizedBox(height: 14),
              InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(14),
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Terakhir donor (opsional)',
                    suffixIcon: _lastDonation == null
                        ? const Icon(Icons.calendar_today_outlined)
                        : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _lastDonation = null)),
                  ),
                  child: Text(_lastDonation == null ? 'Belum pernah / tidak ingat' : fmtDate(_lastDonation)),
                ),
              ),
              const SizedBox(height: 18),
              CheckboxListTile(
                value: _consentNotif,
                onChanged: (v) => setState(() => _consentNotif = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text('Saya bersedia menerima panggilan darurat lewat aplikasi dan WhatsApp.',
                    style: TextStyle(fontSize: 13)),
              ),
              CheckboxListTile(
                value: _consentGps,
                onChanged: (v) => setState(() => _consentGps = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text('Lokasi saya dipakai untuk menghitung jarak ke faskes terdekat.',
                    style: TextStyle(fontSize: 13)),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Menyimpan…' : 'Aktifkan profil pendonor')),
              const SizedBox(height: 24),
              const EmergencyRequestCard(),
            ],
          ),
        ),
      ),
    );
  }
}

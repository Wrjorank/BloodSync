import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../state/request_state.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../state/notice.dart';
import '../widgets/common.dart';
import 'about_screen.dart';

// tab Pengajuan: sama dengan halaman /patient di web. tanpa akun, cukup verifikasi nomor whatsapp
class RequestScreen extends StatefulWidget {
  const RequestScreen({super.key, required this.state});
  final RequestState state;

  @override
  State<RequestScreen> createState() => _RequestScreenState();
}

class _RequestScreenState extends State<RequestScreen> {
  RequestState get s => widget.state;

  @override
  void initState() {
    super.initState();
    s.addListener(_onChange);
  }

  @override
  void dispose() {
    s.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    final n = s.notice;
    if (n != null && mounted) {
      s.notice = null;
      showNotice(context, n);
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          backgroundColor: Slate.c900,
          foregroundColor: Colors.white,
          title: const Text('Pengajuan Darah', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
          actions: const [AboutButton(color: Colors.white)],
        ),
        body: SafeArea(
          child: RefreshIndicator(
            onRefresh: () => s.current == null ? s.loadHospitals() : s.refresh(),
            child: s.current == null ? _RequestForm(state: s) : _Tracker(state: s, req: s.current!),
          ),
        ),
      );
}

// ---------------------------------------------------------------- form

class _RequestForm extends StatefulWidget {
  const _RequestForm({required this.state});
  final RequestState state;

  @override
  State<_RequestForm> createState() => _RequestFormState();
}

class _RequestFormState extends State<_RequestForm> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _patient = TextEditingController();
  final _rm = TextEditingController();
  final _ward = TextEditingController();
  final _bags = TextEditingController(text: '2');
  String? _faskesId;
  String? _abo;
  String _rh = '+';
  String _component = 'PRC';
  String _urgency = 'KRITIS';
  Uint8List? _letter;
  String? _letterName;

  RequestState get s => widget.state;

  @override
  void dispose() {
    for (final c in [_phone, _otp, _patient, _rm, _ward, _bags]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickLetter(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source, imageQuality: 80, maxWidth: 2000);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 5 * 1024 * 1024) {
      if (mounted) showNotice(context, const Notice('Ukuran berkas maksimal 5 MB.', NoticeKind.error));
      return;
    }
    setState(() {
      _letter = bytes;
      _letterName = file.name;
    });
  }

  void _chooseSource() => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Foto dengan kamera'),
              onTap: () {
                Navigator.pop(context);
                _pickLetter(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pilih dari galeri'),
              onTap: () {
                Navigator.pop(context);
                _pickLetter(ImageSource.gallery);
              },
            ),
            const SizedBox(height: 8),
          ]),
        ),
      );

  Future<void> _submit() async {
    if (!s.verified) return showNotice(context, const Notice('Verifikasi nomor WhatsApp terlebih dahulu.', NoticeKind.error));
    if (!_form.currentState!.validate()) return;
    if (_letter == null) return showNotice(context, const Notice('Lampirkan foto surat pengantar dokter.', NoticeKind.error));
    final ok = await s.submit({
      'patientName': _patient.text.trim(),
      'medicalRecordNo': _rm.text.trim(),
      'ward': _ward.text.trim(),
      'faskesId': _faskesId!,
      'bloodType': '$_abo$_rh',
      'component': _component,
      'bagsNeeded': _bags.text.trim(),
      'urgency': _urgency,
    }, _letter!, _letterName ?? 'surat.jpg');
    if (ok && mounted) {
      setState(() {
        _letter = null;
        _letterName = null;
      });
      for (final c in [_patient, _rm, _ward]) {
        c.clear();
      }
    }
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? 'Wajib diisi' : null;

  @override
  Widget build(BuildContext context) {
    final busy = s.busy;
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFDBEAFE))),
            child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.info_outline, color: Color(0xFF2563EB), size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Tanpa registrasi akun. Cukup verifikasi nomor WhatsApp, isi data sesuai surat pengantar dokter, lalu faskes akan memvalidasi.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF1E40AF), height: 1.4),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 20),

          // ---- nomor whatsapp + otp
          const _Label('Nomor WhatsApp keluarga'),
          if (s.verified)
            Row(children: [
              Expanded(child: _ReadOnlyField(s.phone ?? '')),
              TextButton(onPressed: busy ? null : s.changeNumber, child: const Text('Ganti')),
            ])
          else ...[
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  enabled: s.otpSentTo == null,
                  decoration: const InputDecoration(hintText: '08xxxxxxxxxx'),
                ),
              ),
              const SizedBox(width: 8),
              _SmallButton(
                label: s.otpSentTo == null ? 'Kirim OTP' : 'Kirim ulang',
                color: Slate.c900,
                onPressed: busy ? null : () => s.sendOtp(_phone.text.trim()),
              ),
            ]),
            if (s.otpSentTo != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _otp,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    style: const TextStyle(letterSpacing: 8, fontWeight: FontWeight.w700),
                    decoration: const InputDecoration(hintText: '••••••', counterText: ''),
                  ),
                ),
                const SizedBox(width: 8),
                _SmallButton(label: 'Verifikasi', color: Brand.c600, onPressed: busy ? null : () => s.verifyOtp(_otp.text.trim())),
              ]),
            ],
          ],
          if (s.verified)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Row(children: [
                Icon(Icons.check_circle, size: 16, color: Color(0xFF16A34A)),
                SizedBox(width: 6),
                Text('Nomor terverifikasi', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF16A34A))),
              ]),
            ),

          // ---- data pasien
          const _Legend('Data pasien'),
          const _Label('Nama pasien'),
          TextFormField(controller: _patient, validator: _required, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(hintText: 'Nama lengkap pasien')),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const _Label('No. rekam medis'),
                TextFormField(controller: _rm, validator: _required, decoration: const InputDecoration(hintText: 'RM-000123')),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const _Label('Ruang perawatan'),
                TextFormField(controller: _ward, validator: _required, decoration: const InputDecoration(hintText: 'ICU / Melati 2')),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          const _Label('Rumah sakit tempat dirawat'),
          DropdownButtonFormField<String>(
            initialValue: _faskesId,
            isExpanded: true,
            validator: (v) => v == null ? 'Pilih rumah sakit' : null,
            hint: Text(s.hospitals.isEmpty ? 'Memuat daftar rumah sakit…' : 'Pilih rumah sakit'),
            items: [for (final f in s.hospitals) DropdownMenuItem(value: '${f['id']}', child: Text('${f['name']}', overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() => _faskesId = v),
          ),

          // ---- detail kebutuhan
          const _Legend('Detail kebutuhan'),
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const _Label('Golongan'),
                DropdownButtonFormField<String>(
                  initialValue: _abo,
                  isExpanded: true,
                  hint: const Text('Pilih'),
                  validator: (v) => v == null ? 'Wajib' : null,
                  items: [for (final g in ['A', 'B', 'AB', 'O']) DropdownMenuItem(value: g, child: Text(g))],
                  onChanged: (v) => setState(() => _abo = v),
                ),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const _Label('Rhesus'),
                DropdownButtonFormField<String>(
                  initialValue: _rh,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(value: '+', child: Text('Positif (+)', overflow: TextOverflow.ellipsis)),
                    DropdownMenuItem(value: '-', child: Text('Negatif (−)', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _rh = v!),
                ),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const _Label('Komponen'),
                DropdownButtonFormField<String>(
                  initialValue: _component,
                  isExpanded: true,
                  items: [for (final e in componentLabel.entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis))],
                  onChanged: (v) => setState(() => _component = v!),
                ),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const _Label('Jumlah kantong'),
                TextFormField(
                  controller: _bags,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  validator: (v) {
                    final n = int.tryParse(v ?? '');
                    return n == null || n < 1 || n > 10 ? '1–10' : null;
                  },
                ),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          const _Label('Tingkat urgensi'),
          Row(children: [
            for (final e in urgencyLabel.entries) ...[
              Expanded(
                child: _UrgencyChip(
                  label: e.value,
                  selected: _urgency == e.key,
                  critical: e.key == 'KRITIS',
                  onTap: () => setState(() => _urgency = e.key),
                ),
              ),
              if (e.key != urgencyLabel.keys.last) const SizedBox(width: 8),
            ],
          ]),

          // ---- surat pengantar
          const SizedBox(height: 20),
          const _Label('Foto surat pengantar dokter'),
          InkWell(
            onTap: _chooseSource,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 22),
              decoration: BoxDecoration(
                color: Slate.c50,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFCBD5E1), width: 2, strokeAlign: BorderSide.strokeAlignInside),
              ),
              child: const Column(children: [
                Icon(Icons.photo_camera, size: 28, color: Slate.c600),
                SizedBox(height: 6),
                Text('Ketuk untuk foto / unggah', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Slate.c600)),
              ]),
            ),
          ),
          if (_letter != null)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFBBF7D0))),
              child: Row(children: [
                ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.memory(_letter!, width: 48, height: 48, fit: BoxFit.cover)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_letterName ?? 'surat.jpg', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF166534))),
                    const Text('Terlampir • dikirim ke petugas faskes untuk verifikasi', style: TextStyle(fontSize: 11, color: Color(0xFF15803D))),
                  ]),
                ),
                IconButton(onPressed: () => setState(() => _letter = null), icon: const Icon(Icons.close, size: 18)),
              ]),
            ),

          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: busy ? null : _submit,
            icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.send),
            label: const Text('Ajukan Permintaan Darurat'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- tracker

const _header = {
  'PENDING_VERIFICATION': (Icons.hourglass_top, Color(0xFFFFEDD5), Color(0xFFF97316), 'Menunggu Verifikasi', 'Petugas faskes sedang memeriksa surat pengantar dokter.'),
  'APPROVED': (Icons.fact_check, Color(0xFFFEF3C7), Color(0xFFD97706), 'Terverifikasi', 'Faskes sedang mengecek stok internal dan faskes terdekat.'),
  'BROADCASTING': (Icons.satellite_alt, Color(0xFFDBEAFE), Color(0xFF3B82F6), 'Pencarian Donor Aktif', 'Notifikasi dikirim hanya ke pendonor yang cocok di sekitar faskes.'),
  'FULFILLED': (Icons.check_circle, Color(0xFFDCFCE7), Color(0xFF16A34A), 'Kebutuhan Terpenuhi', 'Semua kantong sudah tersedia. Kartu publik otomatis dikunci (CLOSED).'),
  'REJECTED': (Icons.cancel, Color(0xFFFEE2E2), Color(0xFFDC2626), 'Pengajuan Ditolak', ''),
  'EXPIRED': (Icons.schedule, Slate.c100, Slate.c500, 'Batas Waktu Terlewati', 'Hubungi petugas faskes untuk memperpanjang panggilan.'),
  'CLOSED': (Icons.lock, Slate.c100, Slate.c500, 'Pengajuan Ditutup', 'Permintaan ini sudah tidak aktif.'),
};
const _steps = ['Diajukan', 'Diverifikasi', 'Cari donor', 'Terpenuhi'];
const _stepIndex = {'PENDING_VERIFICATION': 0, 'APPROVED': 1, 'BROADCASTING': 2, 'FULFILLED': 3, 'REJECTED': 0, 'EXPIRED': 2, 'CLOSED': 0};

class _Tracker extends StatelessWidget {
  const _Tracker({required this.state, required this.req});
  final RequestState state;
  final Map<String, dynamic> req;

  @override
  Widget build(BuildContext context) {
    final status = req['status'] as String;
    final p = Map<String, dynamic>.from(req['progress'] as Map);
    final faskes = Map<String, dynamic>.from(req['faskes'] as Map);
    final dispatch = req['dispatch'] == null ? null : Map<String, dynamic>.from(req['dispatch'] as Map);
    final enRoute = (req['enRoute'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final events = (req['events'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList().reversed.toList();
    var (icon, bg, fg, title, desc) = _header[status]!;
    if (status == 'REJECTED') desc = 'Alasan: ${req['rejectReason']}. Silakan perbaiki dan ajukan ulang.';
    if (req['publicState'] == 'QUOTA_FULL') desc = 'Pendonor yang dibutuhkan sudah dalam perjalanan. Notifikasi ke pendonor lain ditarik.';
    final active = activeStatuses.contains(status);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Center(
          child: Container(width: 64, height: 64, decoration: BoxDecoration(color: bg, shape: BoxShape.circle), child: Icon(icon, color: fg, size: 30)),
        ),
        const SizedBox(height: 12),
        Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Slate.c900)),
        const SizedBox(height: 4),
        Text(desc, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: Slate.c500, height: 1.4)),
        const SizedBox(height: 20),
        _Timeline(status: status),
        const SizedBox(height: 20),

        // ---- kartu progres
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text('${req['code']}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, color: Slate.c800)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Brand.c50, borderRadius: BorderRadius.circular(8)),
                  child: Text('${req['bloodType']} • ${req['componentLabel']}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Brand.c700)),
                ),
              ]),
              const SizedBox(height: 14),
              Row(children: [
                const Text('Progres pemenuhan', style: TextStyle(fontSize: 12, color: Slate.c500)),
                const Spacer(),
                Text('${p['fulfilled']} / ${p['needed']} kantong', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Slate.c800)),
              ]),
              const SizedBox(height: 6),
              _ProgressBar(needed: p['needed'] as int, fulfilled: p['fulfilled'] as int, reserved: p['reserved'] as int),
              const SizedBox(height: 6),
              const Row(children: [
                _Dot(Color(0xFF22C55E)), SizedBox(width: 4), Text('Terpenuhi', style: TextStyle(fontSize: 11, color: Slate.c500)),
                SizedBox(width: 12),
                _Dot(Color(0xFF60A5FA)), SizedBox(width: 4), Text('Pendonor menuju RS', style: TextStyle(fontSize: 11, color: Slate.c500)),
              ]),
              for (final d in enRoute) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFDBEAFE))),
                  child: Row(children: [
                    Icon(d['status'] == 'RESERVED' ? Icons.directions_walk : Icons.how_to_reg, size: 18, color: const Color(0xFF2563EB)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${d['name']} • ${d['bloodType']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Slate.c800)),
                        Text(
                          d['status'] == 'RESERVED' ? 'Sedang menuju RS • ETA ${d['etaMin']} mnt' : ticketStatusLabel[d['status']] ?? '${d['status']}',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF1D4ED8)),
                        ),
                      ]),
                    ),
                  ]),
                ),
              ],
              const Divider(height: 24),
              _Row('Pasien', '${req['patientName']}'),
              _Row('Rumah sakit', '${faskes['name']}'),
              _Row('Ruang', '${req['ward']}'),
              if ((p['fromStock'] as int) > 0) _Row('Dari stok faskes', '${p['fromStock']} kantong'),
              if ((p['collected'] as int) > 0) _Row('Dari pendonor', '${p['collected']} kantong'),
              if (status == 'BROADCASTING' && dispatch?['deadline'] != null) ...[
                _Row('Batas waktu panggilan', fmtDateTime(DateTime.parse('${dispatch!['deadline']}').toLocal()),
                    trailing: CountdownText(DateTime.parse('${dispatch['deadline']}').toLocal(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Brand.c600))),
                _Row('Radius pencarian', '${dispatch['radiusKm']} km • gelombang ${dispatch['wave']}'),
              ],
            ]),
          ),
        ),

        if ((status == 'APPROVED' || status == 'BROADCASTING') && req['publicToken'] != null) ...[
          const SizedBox(height: 16),
          _ShareCard(req: req, maxedOut: dispatch?['maxedOut'] == true),
        ],

        const SizedBox(height: 16),
        Card(
          clipBehavior: Clip.antiAlias,
          child: ExpansionTile(
            leading: const Icon(Icons.history, color: Slate.c400),
            title: const Text('Riwayat status', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Slate.c800)),
            shape: const Border(),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            children: [
              for (final e in events)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    SizedBox(
                      width: 72,
                      child: Text(fmtTime(DateTime.parse('${e['at']}').toLocal()), style: const TextStyle(fontSize: 12, color: Slate.c400, fontFeatures: [FontFeature.tabularFigures()])),
                    ),
                    Expanded(child: Text('${e['text']}', style: const TextStyle(fontSize: 12, color: Slate.c600))),
                  ]),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (active)
          TextButton(
            onPressed: state.busy
                ? null
                : () async {
                    if (await confirm(context, 'Batalkan pengajuan?', 'Pendonor yang sedang menuju akan diberi tahu.', ok: 'Batalkan')) {
                      await state.cancel();
                    }
                  },
            style: TextButton.styleFrom(foregroundColor: Slate.c500),
            child: const Text('Batalkan pengajuan'),
          )
        else
          FilledButton(onPressed: state.startNew, style: FilledButton.styleFrom(backgroundColor: Slate.c900), child: const Text('Buat pengajuan baru')),
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final step = _stepIndex[status]!;
    final failed = ['REJECTED', 'EXPIRED', 'CLOSED'].contains(status);
    return Row(children: [
      for (var i = 0; i < _steps.length; i++)
        Expanded(
          child: Builder(builder: (context) {
            final done = i < step || (i == step && status == 'FULFILLED');
            final current = i == step && !done;
            final bg = done ? const Color(0xFF22C55E) : current ? (failed ? const Color(0xFFEF4444) : Brand.c600) : Slate.c100;
            return Column(children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
                child: done
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: current ? Colors.white : Slate.c400)),
              ),
              const SizedBox(height: 6),
              Text(_steps[i], style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: done || current ? Slate.c800 : Slate.c400)),
            ]);
          }),
        ),
    ]);
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.needed, required this.fulfilled, required this.reserved});
  final int needed, fulfilled, reserved;

  @override
  Widget build(BuildContext context) {
    final total = needed <= 0 ? 1 : needed;
    final done = (fulfilled / total).clamp(0.0, 1.0);
    final coming = (reserved / total).clamp(0.0, 1.0 - done);
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: SizedBox(
        height: 10,
        child: Row(children: [
          Expanded(flex: (done * 1000).round(), child: Container(color: const Color(0xFF22C55E))),
          Expanded(flex: (coming * 1000).round(), child: Container(color: const Color(0xFF60A5FA))),
          Expanded(flex: ((1 - done - coming) * 1000).round(), child: Container(color: Slate.c100)),
        ]),
      ),
    );
  }
}

class _ShareCard extends StatelessWidget {
  const _ShareCard({required this.req, required this.maxedOut});
  final Map<String, dynamic> req;
  final bool maxedOut;

  String get _url => '$apiBase/card?t=${req['publicToken']}';

  String _text() {
    final p = req['progress'] as Map;
    final faskes = req['faskes'] as Map;
    final deadline = (req['dispatch'] as Map?)?['deadline'];
    return [
      'PANGGILAN DONOR DARAH (terverifikasi faskes)',
      '${faskes['name']} membutuhkan ${p['needed']} kantong ${req['componentLabel']} golongan ${req['bloodType']}.',
      'Terpenuhi: ${p['fulfilled']} kantong${deadline != null ? ' | Berlaku hingga ${fmtDateTime(DateTime.parse('$deadline').toLocal())}' : ''}',
      'Cek status real-time sebelum datang: $_url',
    ].join('\n');
  }

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: maxedOut ? const Color(0xFFFFFBEB) : const Color(0xFFEFF6FF),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: maxedOut ? const Color(0xFFFCD34D) : const Color(0xFFDBEAFE), width: maxedOut ? 2 : 1),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.verified, size: 18, color: Color(0xFF2563EB)),
            SizedBox(width: 8),
            Text('Kartu Darurat Terverifikasi', style: TextStyle(fontWeight: FontWeight.w700, color: Slate.c800)),
          ]),
          const SizedBox(height: 8),
          const Text(
            'Tautan resmi dengan data real-time. Begitu kebutuhan terpenuhi, kartu otomatis berstatus CLOSED sehingga broadcast lama di grup WA tidak menyesatkan.',
            style: TextStyle(fontSize: 12, color: Slate.c600, height: 1.4),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => launchUrl(Uri.parse(_url), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('Lihat kartu'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A), minimumSize: const Size.fromHeight(48)),
                onPressed: () => launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(_text())}'), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.chat, size: 16),
                label: const Text('WhatsApp'),
              ),
            ),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: _url));
                  if (context.mounted) showNotice(context, const Notice('Tautan kartu disalin.', NoticeKind.success));
                },
                icon: const Icon(Icons.link, size: 16),
                label: const Text('Salin tautan'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => SharePlus.instance.share(ShareParams(text: _text())),
                icon: const Icon(Icons.share, size: 16),
                label: const Text('Bagikan'),
              ),
            ),
          ]),
        ]),
      );
}

// ---------------------------------------------------------------- small pieces

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Slate.c600)),
      );
}

class _Legend extends StatelessWidget {
  const _Legend(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 24, bottom: 12),
        child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Slate.c400)),
      );
}

class _ReadOnlyField extends StatelessWidget {
  const _ReadOnlyField(this.value);
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        decoration: BoxDecoration(color: Slate.c100, borderRadius: BorderRadius.circular(14), border: Border.all(color: Slate.c200)),
        child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, color: Slate.c800)),
      );
}

class _SmallButton extends StatelessWidget {
  const _SmallButton({required this.label, required this.color, required this.onPressed});
  final String label;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(backgroundColor: color, minimumSize: const Size(0, 52), padding: const EdgeInsets.symmetric(horizontal: 16)),
        child: Text(label, style: const TextStyle(fontSize: 14)),
      );
}

class _UrgencyChip extends StatelessWidget {
  const _UrgencyChip({required this.label, required this.selected, required this.critical, required this.onTap});
  final String label;
  final bool selected, critical;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accent = critical ? const Color(0xFFDC2626) : Slate.c800;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? (critical ? const Color(0xFFFEF2F2) : Slate.c100) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? accent : Slate.c200, width: selected ? 2 : 1),
        ),
        child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: selected ? accent : Slate.c600)),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.trailing});
  final String label, value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Slate.c500)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(value, textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Slate.c800)),
              ?trailing,
            ]),
          ),
        ]),
      );
}

class _Dot extends StatelessWidget {
  const _Dot(this.color);
  final Color color;

  @override
  Widget build(BuildContext context) => Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

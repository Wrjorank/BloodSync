import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/dashboard.dart';
import '../state/donor_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import 'common.dart';

const badgeIcons = {
  'fa-heart': Icons.favorite,
  'fa-medal': Icons.military_tech,
  'fa-award': Icons.workspace_premium,
  'fa-crown': Icons.emoji_events,
  'fa-bolt': Icons.bolt,
  'fa-gem': Icons.diamond,
};

// area utama menampilkan tepat satu: tiket aktif, hasil yang belum dibaca, radar, atau masa pemulihan
class MainCard extends StatelessWidget {
  const MainCard({super.key, required this.c});
  final DonorController c;

  @override
  Widget build(BuildContext context) {
    final d = c.dash!;
    if (d.activeTicket != null) return TicketCard(ticket: d.activeTicket!, c: c);
    if (d.outcome != null) return OutcomeCard(outcome: d.outcome!, dash: d, onClose: () => c.acknowledge(d.outcome!.ticketId));
    if (d.eligibility.eligible) return RadarView(profile: d.profile);
    return LockedView(eligibility: d.eligibility, onSkip: c.finishRecovery);
  }
}

class TicketCard extends StatelessWidget {
  const TicketCard({super.key, required this.ticket, required this.c});
  final ActiveTicket ticket;
  final DonorController c;

  @override
  Widget build(BuildContext context) {
    final t = ticket;
    final (icon, bg, fg, title) = switch (t.status) {
      'ARRIVED' => (Icons.how_to_reg, const Color(0xFFFFFBEB), const Color(0xFF92400E), 'Check-in berhasil'),
      'SCREENED' => (Icons.water_drop, const Color(0xFFF0FDF4), const Color(0xFF166534), 'Lolos skrining'),
      _ => (Icons.lock_clock, const Color(0xFFEFF6FF), const Color(0xFF1E40AF), 'Slot dikunci untuk Anda'),
    };
    final detailStyle = TextStyle(fontSize: 12, color: fg);
    final Widget detail = switch (t.status) {
      'ARRIVED' => Text('Silakan menuju meja skrining (tensi & Hb).', style: detailStyle),
      'SCREENED' => Text('Pengambilan darah sedang berlangsung.', style: detailStyle),
      _ => Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text('Tiba sebelum ${fmtTime(t.reservedUntil)} • sisa ', style: detailStyle),
          if (t.reservedUntil != null) CountdownText(t.reservedUntil!, style: detailStyle.copyWith(fontWeight: FontWeight.w700)),
        ]),
    };

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('Tiket Donor Digital', icon: Icons.confirmation_number_outlined),
      Card(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.all(18),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('TUJUAN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Slate.c400, letterSpacing: 0.8)),
                  const SizedBox(height: 4),
                  Text(t.faskes.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Slate.c800, height: 1.2)),
                  const SizedBox(height: 2),
                  Text('${t.faskes.area} • ${fmtKm(t.distanceKm)}', style: const TextStyle(fontSize: 12, color: Slate.c500)),
                  const SizedBox(height: 12),
                  Text(t.code,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 2)),
                ]),
              ),
              const SizedBox(width: 12),
              QrImageView(data: t.qrPayload, size: 116, padding: const EdgeInsets.all(4)),
            ]),
          ),
          const Divider(height: 1, color: Slate.c200),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
            child: Row(children: [
              Expanded(child: InfoCell('Komponen', value: t.componentLabel)),
              Expanded(child: InfoCell('Untuk gol.', value: t.bloodType)),
              Expanded(child: InfoCell('Estimasi', value: '${t.etaMin} mnt')),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Icon(icon, size: 16, color: fg),
                    const SizedBox(width: 6),
                    Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: fg)),
                  ]),
                  const SizedBox(height: 2),
                  detail,
                ]),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: Slate.c900),
                onPressed: () => launchUrl(Uri.parse(t.faskes.mapsUrl), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.map_outlined),
                label: const Text('Buka navigasi Google Maps'),
              ),
              if (t.status == 'RESERVED')
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: Slate.c400),
                  onPressed: () async {
                    if (await confirm(context, 'Batal datang?', 'Slot Anda akan dialihkan ke pendonor lain.', ok: 'Batal datang')) {
                      c.cancelTicket(t.id);
                    }
                  },
                  child: const Text('Batal datang (slot dialihkan ke pendonor lain)', style: TextStyle(fontSize: 12)),
                ),
              const SizedBox(height: 4),
              const Text('Tunjukkan QR ini ke petugas UDD saat tiba.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Slate.c400)),
            ]),
          ),
        ]),
      ),
    ]);
  }
}

class OutcomeCard extends StatelessWidget {
  const OutcomeCard({super.key, required this.outcome, required this.dash, required this.onClose});
  final Outcome outcome;
  final Dashboard dash;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final o = outcome;
    final close = Padding(
      padding: const EdgeInsets.only(top: 20),
      child: FilledButton(style: FilledButton.styleFrom(backgroundColor: Slate.c900), onPressed: onClose, child: const Text('Tutup')),
    );

    if (o.status == 'COLLECTED') {
      final newBadges = o.newBadges.map((id) => dash.badges.where((b) => b.id == id).firstOrNull).nonNulls.toList();
      return Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Color(0xFFBBF7D0))),
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(children: [
            const CircleAvatar(radius: 32, backgroundColor: Color(0xFFDCFCE7), child: Icon(Icons.favorite, color: Color(0xFF16A34A), size: 30)),
            const SizedBox(height: 12),
            Text('Terima kasih, ${dash.profile.firstName}!',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Slate.c900)),
            const SizedBox(height: 6),
            Text('Donor Anda di ${o.faskes} sudah tercatat untuk ${o.requestCode}.',
                textAlign: TextAlign.center, style: const TextStyle(color: Slate.c500)),
            if (dash.eligibility.nextDate != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Slate.c50, borderRadius: BorderRadius.circular(12)),
                child: Text(
                  'Kalender donor dikunci hingga ${fmtDate(dash.eligibility.nextDate)}. '
                  'Anda tidak akan menerima panggilan darurat selama masa pemulihan.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: Slate.c500),
                ),
              ),
            ],
            if (newBadges.isNotEmpty) ...[
              const SizedBox(height: 16),
              const Text('LENCANA BARU', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Slate.c400, letterSpacing: 0.8)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: newBadges
                    .map((b) => Chip(
                          avatar: Icon(badgeIcons[b.icon] ?? Icons.star, size: 16, color: const Color(0xFFB45309)),
                          label: Text(b.label),
                          backgroundColor: const Color(0xFFFFFBEB),
                          side: const BorderSide(color: Color(0xFFFDE68A)),
                        ))
                    .toList(),
              ),
            ],
            close,
          ]),
        ),
      );
    }

    final failed = o.status == 'SCREENING_FAILED';
    final title = failed ? 'Belum bisa donor hari ini' : (o.status == 'NO_SHOW' ? 'Slot Anda dilepas' : 'Kedatangan dibatalkan');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: Slate.c100,
            child: Icon(failed ? Icons.medical_services_outlined : Icons.info_outline, color: Slate.c500),
          ),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Slate.c900)),
          const SizedBox(height: 8),
          if (failed) ...[
            ...o.reasons.map((r) => Text('• $r', style: const TextStyle(color: Slate.c500))),
            const SizedBox(height: 8),
            const Text('Terima kasih sudah datang. Slot Anda dialihkan ke pendonor cadangan.',
                textAlign: TextAlign.center, style: TextStyle(color: Slate.c500)),
          ] else
            Text(o.note ?? '', textAlign: TextAlign.center, style: const TextStyle(color: Slate.c500)),
          close,
        ]),
      ),
    );
  }
}

class RadarView extends StatefulWidget {
  const RadarView({super.key, required this.profile});
  final Profile profile;

  @override
  State<RadarView> createState() => _RadarViewState();
}

class _RadarViewState extends State<RadarView> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 3))..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Widget _ring(double t) => Container(
        width: 70 + 90 * t,
        height: 70 + 90 * t,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Brand.c500.withValues(alpha: (1 - t) * 0.6), width: 1.5),
        ),
      );

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(children: [
          SizedBox(
            width: 170,
            height: 170,
            child: AnimatedBuilder(
              animation: _ctrl,
              builder: (_, _) => Stack(alignment: Alignment.center, children: [
                _ring(_ctrl.value),
                _ring((_ctrl.value + 0.5) % 1),
                Container(
                  width: 70,
                  height: 70,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Brand.c50),
                  child: const Icon(Icons.location_on, color: Brand.c500, size: 34),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Memantau sekitar…', style: TextStyle(fontWeight: FontWeight.w700, color: Slate.c800, fontSize: 16)),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Anda akan dihubungi bila pasien membutuhkan golongan ${widget.profile.bloodType} (atau yang kompatibel) '
              'di faskes dalam radius panggilan dari ${widget.profile.area}.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Slate.c500, height: 1.5),
            ),
          ),
        ]),
      );
}

class LockedView extends StatelessWidget {
  const LockedView({super.key, required this.eligibility, required this.onSkip});
  final Eligibility eligibility;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final el = eligibility;
    final progress = el.cycleDays == 0 ? 0.0 : (1 - el.daysLeft / el.cycleDays).clamp(0.0, 1.0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(children: [
          const CircleAvatar(radius: 30, backgroundColor: Color(0xFFFFFBEB), child: Icon(Icons.bed_outlined, color: Color(0xFFF59E0B), size: 28)),
          const SizedBox(height: 12),
          const Text('Masa pemulihan', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Slate.c800)),
          const SizedBox(height: 4),
          Text('Panggilan darurat dijeda ${el.daysLeft} hari lagi, hingga ${fmtDate(el.nextDate)}.',
              textAlign: TextAlign.center, style: const TextStyle(color: Slate.c500)),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(value: progress, minHeight: 8, backgroundColor: Slate.c100, color: const Color(0xFFFBBF24)),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: onSkip,
            style: TextButton.styleFrom(foregroundColor: Slate.c400),
            child: const Text('Lewati masa pemulihan (demo)', style: TextStyle(fontSize: 12, decoration: TextDecoration.underline)),
          ),
        ]),
      ),
    );
  }
}

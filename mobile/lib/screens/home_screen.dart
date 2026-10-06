import 'dart:async';

import 'package:flutter/material.dart';

import '../models/dashboard.dart';
import '../state/app_state.dart';
import '../state/donor_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/emergency_request.dart';
import '../widgets/invite_overlay.dart';
import '../widgets/main_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.app});
  final AppState app;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final DonorController c;
  late final StreamSubscription<void> _sub;

  @override
  void initState() {
    super.initState();
    c = DonorController(widget.app.api, widget.app.session, onSessionExpired: () => widget.app.logout(revoke: false));
    _sub = c.notices.listen((n) {
      if (mounted) showNotice(context, n);
    });
    c.start();
  }

  @override
  void dispose() {
    _sub.cancel();
    c.dispose();
    super.dispose();
  }

  Future<void> _logout() async {
    if (await confirm(context, 'Keluar?', 'Anda akan keluar dari semua perangkat.', ok: 'Keluar')) {
      await widget.app.logout();
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: c,
        builder: (context, _) {
          final d = c.dash;
          return Scaffold(
            body: d == null
                ? _Placeholder(error: c.error, onRetry: c.load)
                : Stack(children: [
                    RefreshIndicator(
                      onRefresh: c.load,
                      child: ListView(
                        padding: EdgeInsets.zero,
                        children: [
                          _Header(dash: d, onLogout: _logout),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                              _ReminderBanner(c: c),
                              MainCard(c: c),
                              const SizedBox(height: 16),
                              _Availability(c: c),
                              const SizedBox(height: 8),
                              OutlinedButton.icon(
                                onPressed: c.gpsBusy ? null : () => c.syncGps(),
                                icon: const Icon(Icons.my_location, size: 18),
                                label: Text(c.gpsBusy ? 'Membaca lokasi…' : 'Perbarui lokasi GPS'),
                              ),
                              const SizedBox(height: 16),
                              const EmergencyRequestCard(),
                              const SizedBox(height: 24),
                              const SectionTitle('Lencana', icon: Icons.emoji_events_outlined),
                              _BadgeGrid(badges: d.badges),
                              const SizedBox(height: 24),
                              const SectionTitle('Riwayat donor', icon: Icons.history),
                              _History(donations: d.donations),
                            ]),
                          ),
                        ],
                      ),
                    ),
                    if (d.invite != null)
                      InviteOverlay(invite: d.invite!, donorBloodType: d.profile.bloodType, onRespond: c.respond),
                  ]),
          );
        },
      );
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.error, required this.onRetry});
  final String? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: error == null
            ? const CircularProgressIndicator()
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.cloud_off, size: 40, color: Slate.c400),
                  const SizedBox(height: 12),
                  Text(error!, textAlign: TextAlign.center, style: const TextStyle(color: Slate.c600)),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: onRetry, child: const Text('Coba lagi')),
                ]),
              ),
      );
}

class _Header extends StatelessWidget {
  const _Header({required this.dash, required this.onLogout});
  final Dashboard dash;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final p = dash.profile;
    final el = dash.eligibility;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [Brand.c600, Brand.c700], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 8, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.water_drop, color: Colors.white, size: 20),
              const SizedBox(width: 6),
              const Text('BloodSync', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              const Spacer(),
              IconButton(onPressed: onLogout, icon: const Icon(Icons.logout, color: Colors.white70), tooltip: 'Keluar'),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: Colors.white24,
                child: Text(p.name.isEmpty ? '?' : p.name[0].toUpperCase(),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                  Text('${p.area} • ${p.phone}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                  const SizedBox(height: 6),
                  Row(children: [
                    Icon(el.eligible ? Icons.circle : Icons.lock,
                        size: el.eligible ? 9 : 12, color: el.eligible ? const Color(0xFF4ADE80) : const Color(0xFFFDE047)),
                    const SizedBox(width: 6),
                    Text(el.eligible ? 'Siap mendonor' : 'Pemulihan • ${el.daysLeft} hari lagi',
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                  ]),
                ]),
              ),
              Container(
                margin: const EdgeInsets.only(right: 12),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: Text(p.bloodType, style: const TextStyle(color: Brand.c600, fontWeight: FontWeight.w900, fontSize: 22)),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

// setelah masa pemulihan selesai, arahkan ke faskes terdekat yang stoknya menipis
class _ReminderBanner extends StatelessWidget {
  const _ReminderBanner({required this.c});
  final DonorController c;

  @override
  Widget build(BuildContext context) {
    final d = c.dash!;
    final reminder = d.reminder;
    final key = '${d.profile.id}:${d.profile.lastDonationAt?.toIso8601String()}';
    if (reminder == null || c.dismissedReminder == key) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFF0FDF4),
          border: Border.all(color: const Color(0xFFBBF7D0)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const CircleAvatar(radius: 20, backgroundColor: Color(0xFFDCFCE7), child: Icon(Icons.event_available, color: Color(0xFF16A34A))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(reminder.message, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF14532D))),
              if (reminder.lowStockText != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('${reminder.lowStockText} (${fmtKm(reminder.lowStockKm ?? 0)} dari Anda)',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF166534))),
                ),
            ]),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: () => c.dismissReminder(key),
            icon: const Icon(Icons.close, size: 18, color: Color(0xFF15803D)),
            tooltip: 'Tutup',
          ),
        ]),
      ),
    );
  }
}

class _Availability extends StatelessWidget {
  const _Availability({required this.c});
  final DonorController c;

  @override
  Widget build(BuildContext context) {
    if (c.dash!.profile.isActive) {
      return TextButton(
        style: TextButton.styleFrom(foregroundColor: Slate.c400),
        onPressed: () async {
          final ok = await confirm(
            context,
            'Berhenti menerima panggilan?',
            'Undangan & slot yang sedang Anda pegang akan dilepas ke pendonor lain.',
            ok: 'Berhenti',
          );
          if (ok) c.setAvailable(false);
        },
        child: const Text('Berhenti sementara menerima panggilan darurat', style: TextStyle(fontSize: 12)),
      );
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
      decoration: BoxDecoration(color: Slate.c100, borderRadius: BorderRadius.circular(14), border: Border.all(color: Slate.c200)),
      child: Row(children: [
        const Icon(Icons.notifications_off_outlined, size: 18, color: Slate.c600),
        const SizedBox(width: 8),
        const Expanded(child: Text('Anda tidak menerima panggilan darurat.', style: TextStyle(fontSize: 13, color: Slate.c600))),
        TextButton(onPressed: () => c.setAvailable(true), child: const Text('Aktifkan lagi')),
      ]),
    );
  }
}

class _BadgeGrid extends StatelessWidget {
  const _BadgeGrid({required this.badges});
  final List<DonorBadge> badges;

  @override
  Widget build(BuildContext context) => GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.15,
        children: badges
            .map((b) => Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: b.earned ? const Color(0xFFFFFBEB) : Colors.white,
                    border: Border.all(color: b.earned ? const Color(0xFFFDE68A) : Slate.c200),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(badgeIcons[b.icon] ?? Icons.star, color: b.earned ? const Color(0xFFB45309) : Slate.c200, size: 24),
                    const SizedBox(height: 4),
                    Text(b.label,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: b.earned ? const Color(0xFF92400E) : Slate.c400)),
                  ]),
                ))
            .toList(),
      );
}

class _History extends StatelessWidget {
  const _History({required this.donations});
  final List<Donation> donations;

  @override
  Widget build(BuildContext context) => Card(
        child: donations.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(16),
                child: Text('Belum ada riwayat donor.', style: TextStyle(color: Slate.c400)),
              )
            : Column(
                children: [
                  for (final (i, d) in donations.indexed) ...[
                    if (i > 0) const Divider(height: 1, color: Slate.c100),
                    ListTile(
                      title: Text(d.faskes ?? 'Donor sebelumnya',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Slate.c800)),
                      subtitle: Text(
                        '${componentLabel[d.component] ?? d.component}${d.requestCode != null ? ' • ${d.requestCode}' : ''}',
                        style: const TextStyle(fontSize: 12),
                      ),
                      trailing: Text(fmtDate(d.at), style: const TextStyle(fontSize: 12, color: Slate.c400)),
                    ),
                  ],
                ],
              ),
      );
}

import 'package:flutter/material.dart';

import '../models/dashboard.dart';
import '../theme.dart';
import '../utils/format.dart';
import 'common.dart';

// panggilan darurat tertarget dari dispatch engine; hilang sendiri bila undangan ditarik server
class InviteOverlay extends StatelessWidget {
  const InviteOverlay({super.key, required this.invite, required this.donorBloodType, required this.onRespond});
  final Invite invite;
  final String donorBloodType;
  final void Function(bool accept) onRespond;

  @override
  Widget build(BuildContext context) {
    final r = invite.request;
    final critical = r.urgency == 'KRITIS';
    return Positioned.fill(
      child: Material(
        color: Colors.black54,
        child: SafeArea(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              margin: const EdgeInsets.all(12),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const CircleAvatar(radius: 24, backgroundColor: Brand.c100, child: Icon(Icons.notifications_active, color: Brand.c600)),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: critical ? Brand.c500 : const Color(0xFFF97316),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text((urgencyLabel[r.urgency] ?? r.urgency).toUpperCase(),
                              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1)),
                        ),
                        Text('Jarak ${fmtKm(invite.distanceKm)}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Slate.c500)),
                      ]),
                      const SizedBox(height: 4),
                      Text('Panggilan Darurat: ${invite.faskes.name}',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Slate.c800, height: 1.25)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Slate.c50, borderRadius: BorderRadius.circular(12), border: Border.all(color: Slate.c100)),
                  child: Text(
                    'Pasien di ${invite.faskes.name} butuh ${r.bagsNeeded} kantong ${r.componentLabel} ${r.bloodType}. '
                    'Jarak Anda ${fmtKm(invite.distanceKm)}. Bersedia membantu?',
                    style: const TextStyle(color: Slate.c600, height: 1.5),
                  ),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: InfoCell('Komponen', value: r.componentLabel)),
                  Expanded(child: InfoCell('Batas waktu', child: r.deadline == null ? const Text('—') : CountdownText(r.deadline!))),
                  Expanded(child: InfoCell('Estimasi', value: '${invite.etaMin} mnt')),
                ]),
                if (r.compatibleOnly) ...[
                  const SizedBox(height: 10),
                  Text('Golongan Anda ($donorBloodType) kompatibel untuk kebutuhan PRC ${r.bloodType}.',
                      style: const TextStyle(fontSize: 11, color: Slate.c500)),
                ],
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () => onRespond(true),
                  icon: const Icon(Icons.favorite),
                  label: const Text('Siap Mendonor'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(onPressed: () => onRespond(false), child: const Text('Tidak Bisa')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

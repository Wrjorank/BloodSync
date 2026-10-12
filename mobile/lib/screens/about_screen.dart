import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/common.dart';

// samakan dengan version di pubspec.yaml
const appVersionLabel = 'Versi 1.0 Beta';

const _teamName = 'ONGOING MAGANG';
const _members = [
  ('Wahyu Rizky F Simanjorang', '11S23040'),
  ('Raynal Haposan Napitupulu', '11S23039'),
  ('Sri Intan Ivana Pasaribu', '11S23006'),
];

// tombol (i) di pojok kanan atas tiap layar utama
class AboutButton extends StatelessWidget {
  const AboutButton({super.key, this.color = Slate.c600});
  final Color color;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: 'Tentang aplikasi',
        icon: Icon(Icons.info_outline, color: color),
        onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AboutScreen())),
      );
}

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          backgroundColor: Slate.c900,
          foregroundColor: Colors.white,
          title: const Text('Tentang', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
          children: [
            const Center(child: BrandMark(size: 72)),
            const SizedBox(height: 14),
            const Text('BloodSync', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Slate.c900)),
            const SizedBox(height: 6),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(color: Brand.c50, borderRadius: BorderRadius.circular(99), border: Border.all(color: Brand.c200)),
                child: const Text(appVersionLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Brand.c700)),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Sistem logistik darah dan panggilan donor presisi: menghubungkan keluarga pasien, rumah sakit, UDD PMI, '
              'dan pendonor terdekat dalam satu sistem.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: Slate.c500, height: 1.5),
            ),
            const SizedBox(height: 28),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('TIM PENGEMBANG', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Slate.c400)),
                  const SizedBox(height: 4),
                  const Text(_teamName, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Slate.c900)),
                  const SizedBox(height: 12),
                  for (final (name, nim) in _members) ...[
                    const Divider(height: 1),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: Brand.c50,
                          child: Text(name.substring(0, 1), style: const TextStyle(fontWeight: FontWeight.w700, color: Brand.c600)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Slate.c800))),
                        Text(nim, style: const TextStyle(fontSize: 13, color: Slate.c500, fontFeatures: [FontFeature.tabularFigures()])),
                      ]),
                    ),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 24),
            const Text('© 2026 Tim ONGOING MAGANG', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Slate.c400)),
          ],
        ),
      );
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';
import '../state/notice.dart';
import '../theme.dart';
import 'common.dart';

// pengajuan darah untuk keluarga pasien belum ada di aplikasi; arahkan ke halaman web pasien.html
Future<void> openEmergencyRequest(BuildContext context) async {
  final ok = await launchUrl(
    Uri.parse('$apiBase/pasien.html'),
    mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppBrowserView,
  ).catchError((_) => false);
  if (!ok && context.mounted) {
    showNotice(context, const Notice('Halaman pengajuan darah tidak bisa dibuka.', NoticeKind.error));
  }
}

class EmergencyRequestCard extends StatelessWidget {
  const EmergencyRequestCard({super.key});

  @override
  Widget build(BuildContext context) => Material(
        color: Brand.c50,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Brand.c200)),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => openEmergencyRequest(context),
          child: const Padding(
            padding: EdgeInsets.all(14),
            child: Row(children: [
              CircleAvatar(radius: 22, backgroundColor: Brand.c600, child: Icon(Icons.emergency, color: Colors.white)),
              SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Butuh darah darurat?', style: TextStyle(fontWeight: FontWeight.w800, color: Brand.c700)),
                  SizedBox(height: 2),
                  Text('Ajukan permintaan darah untuk keluarga pasien, tanpa akun pendonor.',
                      style: TextStyle(fontSize: 12, color: Slate.c600, height: 1.4)),
                ]),
              ),
              Icon(Icons.open_in_new, size: 18, color: Brand.c600),
            ]),
          ),
        ),
      );
}

import 'package:flutter/material.dart';

import '../screens/shell.dart';
import '../theme.dart';

// pintasan dari tab Donor ke tab Pengajuan, untuk keluarga pasien yang membuka aplikasi lewat tab pertama
class EmergencyRequestCard extends StatelessWidget {
  const EmergencyRequestCard({super.key});

  @override
  Widget build(BuildContext context) => Material(
        color: Brand.c50,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Brand.c200)),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => shellTab.value = ShellTab.request,
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
              Icon(Icons.chevron_right, color: Brand.c600),
            ]),
          ),
        ),
      );
}

import 'dart:async';

import 'package:flutter/material.dart';

import '../state/notice.dart';
import '../theme.dart';
import '../utils/format.dart';

void showNotice(BuildContext context, Notice notice) {
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(SnackBar(
    content: Text(notice.text),
    backgroundColor: switch (notice.kind) {
      NoticeKind.success => const Color(0xFF15803D),
      NoticeKind.error => Brand.c700,
      NoticeKind.info => Slate.c800,
    },
  ));
}

Future<bool> confirm(BuildContext context, String title, String body, {String ok = 'Ya'}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () => Navigator.pop(context, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return result ?? false;
}

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: Brand.c600, borderRadius: BorderRadius.circular(size * 0.3)),
        child: Icon(Icons.water_drop, color: Colors.white, size: size * 0.55),
      );
}

// label kecil di atas nilai, dipakai di tiket dan undangan
class InfoCell extends StatelessWidget {
  const InfoCell(this.label, {super.key, this.value, this.child});
  final String label;
  final String? value;
  final Widget? child;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Slate.c400)),
          const SizedBox(height: 2),
          child ?? Text(value ?? '—', style: _valueStyle, textAlign: TextAlign.center),
        ],
      );
}

const _valueStyle = TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Slate.c800);

class CountdownText extends StatefulWidget {
  const CountdownText(this.until, {super.key, this.style = _valueStyle});
  final DateTime until;
  final TextStyle style;

  @override
  State<CountdownText> createState() => _CountdownTextState();
}

class _CountdownTextState extends State<CountdownText> {
  late final Timer _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Text(
        fmtDuration(widget.until.difference(DateTime.now())),
        style: widget.style.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.icon});
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(children: [
          if (icon != null) ...[Icon(icon, size: 18, color: Brand.c500), const SizedBox(width: 8)],
          Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Slate.c800)),
        ]),
      );
}

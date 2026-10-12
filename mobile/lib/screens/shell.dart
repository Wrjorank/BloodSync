import 'dart:async';

import 'package:flutter/material.dart';

import '../services/push.dart';
import '../state/app_state.dart';
import '../state/request_state.dart';
import '../theme.dart';
import 'home_screen.dart';
import 'login_screen.dart';
import 'register_screen.dart';
import 'request_screen.dart';

enum ShellTab { donor, request }

// tab yang terbuka; bisa diganti dari mana saja (kartu "butuh darah", notifikasi yang diketuk)
final shellTab = ValueNotifier(ShellTab.donor);

// dua tab di navbar bawah: Donor (halaman /donor di web) dan Pengajuan (halaman /patient).
// keduanya tetap hidup saat berpindah tab, jadi realtime dan isian form tidak hilang
class Shell extends StatefulWidget {
  const Shell({super.key, required this.donor, required this.request, required this.push});
  final AppState donor;
  final RequestState request;
  final PushService push;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  StreamSubscription<PushRoute>? _opened;

  int get _tab => shellTab.value.index;

  @override
  void initState() {
    super.initState();
    // keluarga yang sedang memantau pengajuan langsung melihat tracker-nya
    if (widget.request.requestId != null && widget.donor.session.token == null) shellTab.value = ShellTab.request;
    final pending = widget.push.takePending();
    if (pending != null) shellTab.value = pending == PushRoute.donor ? ShellTab.donor : ShellTab.request;
    shellTab.addListener(_rebuild);
    _opened = widget.push.opened.listen((route) {
      shellTab.value = route == PushRoute.donor ? ShellTab.donor : ShellTab.request;
      if (route == PushRoute.request) widget.request.refresh();
    });
  }

  void _rebuild() => setState(() {});

  @override
  void dispose() {
    shellTab.removeListener(_rebuild);
    _opened?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(
          index: _tab,
          children: [
            ListenableBuilder(
              listenable: widget.donor,
              builder: (context, _) => switch (widget.donor.stage) {
                Stage.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
                Stage.login => LoginScreen(app: widget.donor),
                Stage.register => RegisterScreen(app: widget.donor),
                Stage.home => HomeScreen(app: widget.donor),
              },
            ),
            RequestScreen(state: widget.request),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => shellTab.value = ShellTab.values[i],
          backgroundColor: Colors.white,
          indicatorColor: Brand.c100,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.volunteer_activism_outlined),
              selectedIcon: Icon(Icons.volunteer_activism, color: Brand.c600),
              label: 'Donor',
            ),
            NavigationDestination(
              icon: Icon(Icons.assignment_outlined),
              selectedIcon: Icon(Icons.assignment, color: Brand.c600),
              label: 'Pengajuan',
            ),
          ],
        ),
      );
}

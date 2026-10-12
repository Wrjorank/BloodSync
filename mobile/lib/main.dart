import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api.dart';
import 'api/session.dart';
import 'screens/shell.dart';
import 'services/push.dart';
import 'state/app_state.dart';
import 'state/request_state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final donor = Session('donor');
  final family = Session('family');
  await Future.wait([donor.load(), family.load()]);
  final api = Api(donor: donor, family: family);

  final push = PushService(api);
  await push.init();

  final donorState = AppState(api, push)..bootstrap();
  final requestState = RequestState(api, push);
  await requestState.init();
  // token push bisa berganti selama aplikasi tertutup; samakan lagi dengan akun yang masuk
  push.syncAll();

  runApp(BloodSyncApp(donor: donorState, request: requestState, push: push));
}

class BloodSyncApp extends StatelessWidget {
  const BloodSyncApp({super.key, required this.donor, required this.request, required this.push});
  final AppState donor;
  final RequestState request;
  final PushService push;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'BloodSync',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('id'),
        supportedLocales: const [Locale('id'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Shell(donor: donor, request: request, push: push),
      );
}

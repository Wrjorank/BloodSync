import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api.dart';
import 'api/session.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'state/app_state.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session();
  await session.load();
  final app = AppState(Api(session), session)..bootstrap();
  runApp(BloodSyncApp(app: app));
}

class BloodSyncApp extends StatelessWidget {
  const BloodSyncApp({super.key, required this.app});
  final AppState app;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'BloodSync Pendonor',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('id'),
        supportedLocales: const [Locale('id'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: ListenableBuilder(
          listenable: app,
          builder: (context, _) => switch (app.stage) {
            Stage.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
            Stage.login => LoginScreen(app: app),
            Stage.register => RegisterScreen(app: app),
            Stage.home => HomeScreen(app: app),
          },
        ),
      );
}

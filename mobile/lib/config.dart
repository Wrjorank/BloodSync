import 'package:flutter/foundation.dart';

// browser (edge/chrome) di laptop yang sama memanggil localhost; emulator android menjangkau localhost lewat 10.0.2.2.
// hp fisik: flutter run --dart-define=API_BASE=http://<ip-laptop>:5000
const _override = String.fromEnvironment('API_BASE');
const apiBase = _override != '' ? _override : (kIsWeb ? 'http://localhost:5000' : 'http://10.0.2.2:5000');

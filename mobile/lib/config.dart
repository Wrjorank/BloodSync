// api yang sudah di-deploy. untuk backend lokal:
//   emulator android : flutter run --dart-define=API_BASE=http://10.0.2.2:5000
//   hp fisik         : flutter run --dart-define=API_BASE=http://<ip-laptop>:5000
const _override = String.fromEnvironment('API_BASE');
const apiBase = _override != '' ? _override : 'https://bloodsync.delcom.org';

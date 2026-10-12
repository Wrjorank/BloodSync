import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';

// server hanya mengirim sinyal "ada perubahan"; aplikasi lalu mengambil ulang data lewat rest.
// token menentukan ruang yang diikuti: pendonor (donor:updated, invite:new) atau keluarga (request:updated)
class Realtime {
  io.Socket? _socket;

  void connect(String token, void Function() onChange, {List<String> events = const ['donor:updated', 'invite:new']}) {
    close();
    final socket = io.io(
      apiBase,
      io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).enableForceNew().disableAutoConnect().build(),
    );
    socket.onConnect((_) => onChange());
    for (final event in events) {
      socket.on(event, (_) => onChange());
    }
    socket.connect();
    _socket = socket;
  }

  void close() {
    _socket?.dispose();
    _socket = null;
  }
}

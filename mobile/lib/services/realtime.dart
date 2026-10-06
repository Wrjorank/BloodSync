import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config.dart';

// server hanya mengirim sinyal "ada perubahan"; aplikasi lalu mengambil ulang dashboard lewat rest
class Realtime {
  io.Socket? _socket;

  void connect(String token, void Function() onChange) {
    close();
    final socket = io.io(
      apiBase,
      io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).enableForceNew().disableAutoConnect().build(),
    );
    socket.onConnect((_) => onChange());
    socket.on('donor:updated', (_) => onChange());
    socket.on('invite:new', (_) => onChange());
    socket.connect();
    _socket = socket;
  }

  void close() {
    _socket?.dispose();
    _socket = null;
  }
}

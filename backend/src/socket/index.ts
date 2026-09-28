import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';
import { verifyToken } from '../utils/jwt';
import { rooms, setIo } from '../services/notification.service';

// clients only receive "something changed" events and refetch over rest,
// so a socket never carries more data than the matching rest endpoint would return.
// nothing can be broadcast from a client: the old dispatch_emergency relay was a hoax vector.
export const setupSocket = (io: Server) => {
  setIo(io);

  io.on('connection', (socket: Socket) => {
    const auth = verifyToken(String(socket.handshake.auth?.token || ''));
    if (auth?.kind === 'staff' && auth.faskesId) socket.join(rooms.faskes(auth.faskesId));
    if (auth?.kind === 'donor') socket.join(rooms.donor(auth.sub));
    if (auth?.kind === 'phone' && auth.purpose === 'FAMILY') socket.join(rooms.family(auth.sub));

    // public emergency card: anyone holding the token may watch its status
    socket.on('card:subscribe', async (token: unknown, ack?: (ok: boolean) => void) => {
      if (typeof token !== 'string' || !/^[A-Z2-9]{16}$/.test(token)) return ack?.(false);
      const exists = await prisma.bloodRequest.findUnique({ where: { publicToken: token }, select: { id: true } });
      if (exists) socket.join(rooms.card(token));
      ack?.(!!exists);
    });
  });
};

import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { verifyToken } from '../utils/jwt';
import { isCurrentDonorToken } from '../middlewares/auth';
import { rooms, setIo } from '../services/notification.service';

// clients only receive "something changed" events and refetch over rest,
// so a socket never carries more data than the matching rest endpoint would return.
// nothing can be broadcast from a client: the old dispatch_emergency relay was a hoax vector.
export const setupSocket = (io: Server) => {
  setIo(io);

  io.on('connection', async (socket: Socket) => {
    // public emergency card: anyone holding the token may watch its status.
    // registered before any await so an emit right after connect is not lost
    socket.on('card:subscribe', async (token: unknown, ack?: (ok: boolean) => void) => {
      if (typeof token !== 'string' || !/^[A-Z2-9]{16}$/.test(token)) return ack?.(false);
      const exists = await prisma.bloodRequest.findUnique({ where: { publicToken: token }, select: { id: true } });
      if (exists) socket.join(rooms.card(token));
      ack?.(!!exists);
    });

    // local whatsapp stand-in (env.devInbox): otp codes land here, so only a browser on this machine may listen.
    // a tunnel (cloudflared, ngrok) also connects from loopback but adds forwarding headers, which are refused
    socket.on('dev:inbox', (ack?: (ok: boolean) => void) => {
      const h = socket.handshake;
      const loopback = env.devInboxTrustNetwork || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(h.address);
      const proxied = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded'].some(k => k in h.headers);
      const ok = env.devInbox && loopback && !proxied;
      if (ok) socket.join(rooms.devInbox);
      if (typeof ack === 'function') ack(ok);
    });

    const auth = verifyToken(String(socket.handshake.auth?.token || ''));
    if (auth?.kind === 'staff' && auth.faskesId) socket.join(rooms.faskes(auth.faskesId));
    if (auth?.kind === 'phone' && auth.purpose === 'FAMILY') socket.join(rooms.family(auth.sub));
    if (auth?.kind === 'donor' && (await isCurrentDonorToken(auth).catch(() => false))) socket.join(rooms.donor(auth.sub));
  });
};

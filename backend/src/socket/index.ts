import { Server, Socket } from 'socket.io';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { verifyToken } from '../utils/jwt';
import { assertActiveStaff, isCurrentDonorToken } from '../middlewares/auth';
import { rooms, setIo } from '../services/notification.service';

// loopback, 10/8, 172.16/12, 192.168/16 and fc00::/7, ipv4-mapped included
function isPrivateAddress(address: string) {
  const a = address.toLowerCase().replace(/^::ffff:/, '');
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(a);
  if (v4) {
    const [x, y] = [Number(v4[1]), Number(v4[2])];
    return x === 127 || x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
  }
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a);
}

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
      // trust-network (docker bridge) still needs a private source: a header-stripping proxy in front would otherwise leak otps
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(h.address) || (env.devInboxTrustNetwork && isPrivateAddress(h.address));
      const proxied = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded'].some(k => k in h.headers);
      const ok = env.devInbox && loopback && !proxied;
      if (ok) socket.join(rooms.devInbox);
      if (typeof ack === 'function') ack(ok);
    });

    const auth = verifyToken(String(socket.handshake.auth?.token || ''));
    // same db check as rest: a deactivated, edited or signed-out account must not keep listening
    if (auth?.kind === 'staff' && auth.faskesId && (await assertActiveStaff(auth).then(() => true, () => false))) socket.join(rooms.faskes(auth.faskesId));
    if (auth?.kind === 'phone' && auth.purpose === 'FAMILY') socket.join(rooms.family(auth.sub));
    if (auth?.kind === 'donor' && (await isCurrentDonorToken(auth).catch(() => false))) socket.join(rooms.donor(auth.sub));
  });
};

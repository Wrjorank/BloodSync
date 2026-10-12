import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import prisma from '../config/prisma';
import { env } from '../config/env';

// firebase cloud messaging; every call is a no-op until FIREBASE_* is configured
let app: App | null = null;
function messaging() {
  if (!env.firebase) return null;
  app ??= initializeApp({ credential: cert(env.firebase.server) }, 'bloodsync');
  return getMessaging(app);
}

export interface PushMessage {
  title: string;
  body: string;
  // path inside the app opened on click, e.g. /donor or /facility/requests
  path: string;
  // same tag replaces the previous notification instead of stacking (one per ticket / request)
  tag?: string;
}

// a token the browser dropped (permission revoked, site data cleared) can never deliver again
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

async function send(tokens: string[], m: PushMessage) {
  const fcm = messaging();
  if (!fcm || !tokens.length) return;
  const link = env.publicAppUrl + m.path;
  const dead: string[] = [];
  // fcm accepts at most 500 tokens per multicast
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await fcm.sendEachForMulticast({
      tokens: batch,
      data: { title: m.title, body: m.body, link, tag: m.tag || '' },
      webpush: {
        headers: { Urgency: 'high', TTL: '3600' },
        notification: { title: m.title, body: m.body, icon: '/assets/favicon.svg', badge: '/assets/favicon.svg', tag: m.tag, renotify: !!m.tag },
        // fcm only follows https links on click; the service worker handles the rest from data.link
        ...(link.startsWith('https://') ? { fcmOptions: { link } } : {}),
      },
    });
    res.responses.forEach((r, k) => { if (!r.success && r.error && DEAD.has(r.error.code)) dead.push(batch[k]); });
  }
  if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
}

// isolated like the whatsapp channel: a push failure never breaks the action that triggered it
async function safely(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[push] gagal mengirim ${what}`, (err as Error).message);
  }
}

export const pushService = {
  enabled: () => !!env.firebase,

  // one token per browser: re-registering moves it to whoever signed in last
  async register(token: string, owner: { donorId: string } | { userId: string; faskesId: string | null }, userAgent?: string) {
    const data = {
      donorId: 'donorId' in owner ? owner.donorId : null,
      userId: 'userId' in owner ? owner.userId : null,
      faskesId: 'userId' in owner ? owner.faskesId : null,
      userAgent: userAgent?.slice(0, 500),
      lastSeenAt: new Date(),
    };
    await prisma.pushToken.upsert({ where: { token }, create: { token, ...data }, update: data });
  },

  async unregister(token: string, owner: { donorId: string } | { userId: string }) {
    await prisma.pushToken.deleteMany({ where: { token, ...owner } });
  },

  toDonor(donorId: string, m: PushMessage) {
    return safely(`ke pendonor ${donorId}`, async () => {
      const rows = await prisma.pushToken.findMany({ where: { donorId }, select: { token: true } });
      await send(rows.map(r => r.token), m);
    });
  },

  // every signed-in staff browser of that faskes
  toFaskes(faskesId: string, m: PushMessage) {
    return safely(`ke faskes ${faskesId}`, async () => {
      const rows = await prisma.pushToken.findMany({ where: { faskesId, userId: { not: null } }, select: { token: true } });
      await send(rows.map(r => r.token), m);
    });
  },
};

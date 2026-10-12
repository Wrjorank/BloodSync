import crypto from 'crypto';
import prisma from '../config/prisma';
import { env } from '../config/env';
import { kv } from '../config/redis';
import { DAY_MS } from '../utils/helpers';

const instanceId = crypto.randomUUID();
const EVERY_MS = 6 * 3600000;
let timer: NodeJS.Timeout | null = null;

// old rows only grow the tables and slow the log pages; medical records (requests, tickets, donations) are never touched
export async function cleanup(now = Date.now()) {
  const before = (days: number) => new Date(now - days * DAY_MS);
  const [audit, notifications, tokens] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: before(env.retention.auditDays) } } }),
    prisma.notification.deleteMany({ where: { createdAt: { lt: before(env.retention.notificationDays) } } }),
    // a browser that has not signed in for months has most likely dropped the token already
    prisma.pushToken.deleteMany({ where: { lastSeenAt: { lt: before(env.retention.pushTokenDays) } } }),
  ]);
  return { audit: audit.count, notifications: notifications.count, pushTokens: tokens.count };
}

// runs a few times a day; the redis lock lets only one instance do it when the api is scaled out
export function startCleanup() {
  const run = async () => {
    if (!(await kv.acquire('cleanup:lock', instanceId, EVERY_MS - 60000))) return;
    try {
      const removed = await cleanup();
      if (removed.audit || removed.notifications || removed.pushTokens) console.log('[cleanup] dihapus', removed);
    } catch (err) {
      console.error('[cleanup] gagal', err);
    }
  };
  // first pass shortly after boot, not during it
  setTimeout(run, 60000).unref();
  timer = setInterval(run, EVERY_MS);
  timer.unref();
}

export function stopCleanup() {
  if (timer) clearInterval(timer);
}

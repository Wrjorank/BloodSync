import { Redis } from 'ioredis';
import { env } from './env';

// redis holds otp codes, rate-limit counters and the engine lock.
// when it is down the app keeps working on an in-memory fallback (single instance only).
const client = env.redisUrl
  ? new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 1000, 15000),
    })
  : null;

let warned = false;
client?.on('ready', () => {
  warned = false;
  console.log('[redis] connected');
});
client?.on('error', (err) => {
  if (!warned) console.warn(`[redis] tidak tersedia, memakai fallback in-memory: ${err.message}`);
  warned = true;
});

export async function connectRedis() {
  if (client) await client.connect().catch(() => undefined);
}

export async function disconnectRedis() {
  if (client && client.status === 'ready') await client.quit();
}

export const redisStatus = () => (client ? client.status : 'disabled');

const memory = new Map<string, { value: string; expiresAt: number }>();
const useRedis = () => client?.status === 'ready';

function memGet(key: string) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export const kv = {
  async get(key: string): Promise<string | null> {
    return useRedis() ? client!.get(key) : memGet(key);
  },

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    if (useRedis()) await client!.set(key, value, 'EX', ttlSec);
    else memory.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  },

  async del(key: string): Promise<void> {
    if (useRedis()) await client!.del(key);
    else memory.delete(key);
  },

  // SET NX PX: true only for the caller that acquired the key
  async acquire(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (useRedis()) return (await client!.set(key, value, 'PX', ttlMs, 'NX')) === 'OK';
    if (memGet(key) !== null) return false;
    memory.set(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  },

  async incr(key: string, ttlSec: number): Promise<number> {
    if (useRedis()) {
      const n = await client!.incr(key);
      if (n === 1) await client!.expire(key, ttlSec);
      return n;
    }
    const n = Number(memGet(key) || 0) + 1;
    const existing = memory.get(key);
    memory.set(key, { value: String(n), expiresAt: existing && n > 1 ? existing.expiresAt : Date.now() + ttlSec * 1000 });
    return n;
  },
};

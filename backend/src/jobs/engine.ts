import crypto from 'crypto';
import { env } from '../config/env';
import { kv } from '../config/redis';
import { tick } from '../services/dispatch.service';

const instanceId = crypto.randomUUID();
let timer: NodeJS.Timeout | null = null;
let running = false;

// the redis lock makes only one api instance run a tick per interval when scaled horizontally
export function startEngine() {
  timer = setInterval(async () => {
    if (running) return;
    if (!(await kv.acquire('engine:lock', instanceId, Math.max(1000, env.engineIntervalMs - 500)))) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error('[engine] tick gagal', err);
    } finally {
      running = false;
    }
  }, env.engineIntervalMs);
  console.log(`[engine] dispatch engine aktif (interval ${env.engineIntervalMs} ms)`);
}

export function stopEngine() {
  if (timer) clearInterval(timer);
}

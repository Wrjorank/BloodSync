import { isIPv6 } from 'net';
import { Request, Response, NextFunction } from 'express';
import { kv } from '../config/redis';
import { env } from '../config/env';
import { tooMany } from '../utils/AppError';

// one ipv6 subscriber usually owns a whole /64, so a single full address is a free new identity per request.
// ipv4 (also ipv4-mapped ipv6) stays per address
export function clientKey(ip = '') {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1];
  const addr = ip.split('%')[0];
  if (!isIPv6(addr)) return ip;
  const [head, tail] = addr.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const size = (g: string[]) => g.reduce((n, x) => n + (x.includes('.') ? 2 : 1), 0);
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - size(h) - size(t))).fill('0'), ...t];
  return `${groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

// fixed-window limiter keyed by ip + route name; 10x looser outside production because demos run every role from one ip
export const rateLimit = (name: string, max: number, windowSec: number) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const limit = env.isProduction ? max : max * 10;
    const hits = await kv.incr(`rl:${name}:${clientKey(req.ip)}`, windowSec);
    if (hits > limit) return next(tooMany('Terlalu banyak percobaan. Coba lagi beberapa saat.'));
    next();
  };

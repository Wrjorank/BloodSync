import { Request, Response, NextFunction } from 'express';
import { kv } from '../config/redis';
import { env } from '../config/env';
import { tooMany } from '../utils/AppError';

// fixed-window limiter keyed by ip + route name; 10x looser outside production because demos run every role from one ip
export const rateLimit = (name: string, max: number, windowSec: number) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const limit = env.isProduction ? max : max * 10;
    const hits = await kv.incr(`rl:${name}:${req.ip}`, windowSec);
    if (hits > limit) return next(tooMany('Terlalu banyak percobaan. Coba lagi beberapa saat.'));
    next();
  };

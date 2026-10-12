import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  method: string;
  url: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

// query values that must never land in a log (webhook secret, tokens)
const HIDDEN_QUERY = /^(secret|token|password|code)$/i;

function safeUrl(req: Request) {
  const url = new URL(req.originalUrl, 'http://local');
  for (const key of [...url.searchParams.keys()]) if (HIDDEN_QUERY.test(key)) url.searchParams.set(key, '[redacted]');
  return url.pathname + url.search;
}

// every audit row written while a request is handled picks up where it came from, without passing req around
export function requestContext(req: Request, _res: Response, next: NextFunction) {
  storage.run({
    // ipv4 clients reach a dual-stack socket as ::ffff:1.2.3.4
    ip: req.ip?.replace(/^::ffff:/, ''),
    userAgent: req.get('user-agent')?.slice(0, 500),
    method: req.method,
    url: safeUrl(req).slice(0, 500),
  }, next);
}

// undefined outside a request (dispatch engine ticks, seed)
export const currentRequest = () => storage.getStore();

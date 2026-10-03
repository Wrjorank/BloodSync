import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type OtpPurpose = 'FAMILY' | 'DONOR';

export type AuthPayload =
  | { kind: 'staff'; sub: string; role: 'FASKES_STAFF' | 'SUPER_ADMIN'; faskesId: string | null; ver: number }
  | { kind: 'donor'; sub: string; phone: string; ver: number }
  | { kind: 'phone'; sub: string; purpose: OtpPurpose };

export function signToken(payload: AuthPayload): string {
  const ttl = payload.kind === 'staff' ? env.staffTokenTtl : env.phoneTokenTtl;
  return jwt.sign(payload, env.jwtSecret, { algorithm: 'HS256', expiresIn: ttl as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const { iat, exp, ...payload } = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }) as AuthPayload & { iat: number; exp: number };
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

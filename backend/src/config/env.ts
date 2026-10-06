import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function secret(key: string, devFallback: string): string {
  const value = process.env[key];
  if (value) return value;
  if (isProduction) throw new Error(`${key} wajib diisi di production`);
  return devFallback;
}

const jwtSecret = secret('JWT_SECRET', 'dev-only-secret-change-me');
if (isProduction && jwtSecret.length < 32) throw new Error('JWT_SECRET minimal 32 karakter di production');
// an unset NODE_ENV silently means development; say so loudly, the fallback secret is public in this repo
if (!process.env.JWT_SECRET) {
  console.warn(
    `\n[env] !!! PERINGATAN: JWT_SECRET kosong, memakai secret bawaan development (NODE_ENV=${process.env.NODE_ENV || 'tidak diisi'}).` +
    '\n[env] !!! Siapa pun bisa memalsukan token login. Isi JWT_SECRET dan NODE_ENV=production sebelum aplikasi bisa diakses publik.\n',
  );
}

const corsOrigins = secret('CORS_ORIGIN', '*').split(',').map(s => s.trim());
if (isProduction && corsOrigins.includes('*')) throw new Error('CORS_ORIGIN harus berisi domain frontend di production, bukan *');

// number of reverse proxies in front of the app. leave 0 when exposed directly,
// otherwise anyone can fake X-Forwarded-For and dodge the per-ip rate limits
const trustProxy = Number(process.env.TRUST_PROXY || 0);

// production talks to real phones only; donors' "1"/"2" replies need the webhook secret too
const fonnteToken = secret('FONNTE_TOKEN', '');
const waWebhookSecret = secret('WA_WEBHOOK_SECRET', '');
if (isProduction && waWebhookSecret.length < 16) throw new Error('WA_WEBHOOK_SECRET minimal 16 karakter di production');

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 5000),
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret,
  staffTokenTtl: process.env.STAFF_TOKEN_TTL || '12h',
  phoneTokenTtl: process.env.PHONE_TOKEN_TTL || '7d',
  corsOrigins,
  trustProxy,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:5000').replace(/\/$/, ''),
  engineIntervalMs: Number(process.env.ENGINE_INTERVAL_MS || 5000),
  enableDemoRoutes: !isProduction && process.env.ENABLE_DEMO_ROUTES !== 'false',
  // swagger ui at /docs; on by default outside production, opt-in there
  enableApiDocs: process.env.ENABLE_API_DOCS ? process.env.ENABLE_API_DOCS === 'true' : !isProduction,
  // fonnte whatsapp gateway. production requires it
  fonnteToken,
  waWebhookSecret,
  // local development without a gateway: whatsapp messages (otp included) are shown as on-screen
  // notifications in browsers on this machine instead. never on in production
  devInbox: !isProduction && !fonnteToken,
  // inside docker the host browser arrives from the bridge gateway, not loopback. only safe while the
  // published port is bound to 127.0.0.1 (docker-compose.yml does that); ignored in production
  devInboxTrustNetwork: !isProduction && process.env.DEV_INBOX_TRUST_NETWORK === 'true',
};

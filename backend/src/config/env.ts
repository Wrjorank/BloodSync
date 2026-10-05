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
  // fonnte whatsapp gateway. production requires it
  fonnteToken,
  waWebhookSecret,
  // local development without a gateway: whatsapp messages (otp included) are shown as on-screen
  // notifications in browsers on this machine instead. never on in production
  devInbox: !isProduction && !fonnteToken,
};

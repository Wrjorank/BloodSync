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

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 5000),
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: secret('JWT_SECRET', 'dev-only-secret-change-me'),
  staffTokenTtl: process.env.STAFF_TOKEN_TTL || '12h',
  phoneTokenTtl: process.env.PHONE_TOKEN_TTL || '7d',
  corsOrigins: (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim()),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:5000').replace(/\/$/, ''),
  engineIntervalMs: Number(process.env.ENGINE_INTERVAL_MS || 5000),
  // otp codes are returned in the api response only outside production, so the demo works without a whatsapp gateway
  exposeOtp: !isProduction && process.env.EXPOSE_OTP !== 'false',
  enableDemoRoutes: !isProduction && process.env.ENABLE_DEMO_ROUTES !== 'false',
};

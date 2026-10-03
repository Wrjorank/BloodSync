import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { kv } from '../config/redis';
import { randomDigits } from '../utils/helpers';
import { OtpPurpose, signToken } from '../utils/jwt';
import { env } from '../config/env';
import { badRequest, forbidden, tooMany, unauthorized } from '../utils/AppError';
import { sendOtpMessage } from './notification.service';

const OTP_TTL_SEC = 300;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const MAX_LOGIN_FAILS = 5;
const LOGIN_LOCK_SEC = 900;
const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
// compared against when the email is unknown, so both paths cost one bcrypt round and timing reveals nothing
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

export const authService = {
  async staffLogin(rawEmail: string, password: string) {
    const email = rawEmail.toLowerCase();
    // per-account lock on top of the per-ip limit, so a password spray from many ips still stops
    const failKey = `login:fail:${email}`;
    if (Number(await kv.get(failKey)) >= MAX_LOGIN_FAILS) throw tooMany('Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.');
    const user = await prisma.user.findUnique({ where: { email }, include: { faskes: true } });
    // same message for unknown email and wrong password so accounts cannot be enumerated
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.isActive || !passwordOk) {
      await kv.incr(failKey, LOGIN_LOCK_SEC);
      throw unauthorized('Email atau kata sandi salah');
    }
    await kv.del(failKey);
    if (user.role === 'FASKES_STAFF' && (!user.faskes || !user.faskes.isActive)) throw unauthorized('Akun faskes belum aktif');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await prisma.auditLog.create({ data: { actor: `staff:${user.id}`, action: 'auth.login' } });
    return {
      token: signToken({ kind: 'staff', sub: user.id, role: user.role, faskesId: user.faskesId, ver: user.tokenVersion }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      faskes: user.faskes && { id: user.faskes.id, name: user.faskes.name, type: user.faskes.type, area: user.faskes.area },
    };
  },

  async requestOtp(phone: string, purpose: OtpPurpose) {
    const sends = await kv.incr(`otp:sends:${phone}`, 600);
    if (sends > MAX_SENDS_PER_WINDOW) throw tooMany('OTP sudah dikirim 3 kali. Coba lagi dalam 10 menit.');
    const code = randomDigits(6);
    await kv.set(`otp:${purpose}:${phone}`, JSON.stringify({ hash: hash(code), attempts: 0 }), OTP_TTL_SEC);
    await sendOtpMessage(phone, code);
    return { sent: true, expiresInSec: OTP_TTL_SEC };
  },

  // family gets a phone-scoped token; donors get a donor token if already registered
  async verifyOtp(phone: string, purpose: OtpPurpose, code: string) {
    const key = `otp:${purpose}:${phone}`;
    const raw = await kv.get(key);
    if (!raw) throw badRequest('Kode OTP kedaluwarsa. Minta kode baru.', 'OTP_EXPIRED');
    const entry = JSON.parse(raw) as { hash: string; attempts: number };
    if (entry.attempts >= MAX_ATTEMPTS) {
      await kv.del(key);
      throw tooMany('Terlalu banyak percobaan. Minta kode baru.');
    }
    const match = crypto.timingSafeEqual(Buffer.from(entry.hash), Buffer.from(hash(code)));
    if (!match) {
      await kv.set(key, JSON.stringify({ ...entry, attempts: entry.attempts + 1 }), OTP_TTL_SEC);
      throw badRequest('Kode OTP salah', 'OTP_INVALID');
    }
    await kv.del(key);

    if (purpose === 'DONOR') {
      const donor = await prisma.donor.findUnique({ where: { phone } });
      // a dummy carries a made-up number; whoever really owns it must not inherit the fake profile
      if (donor?.isSimulated && env.isProduction) throw forbidden('Nomor ini tidak dapat digunakan. Hubungi admin BloodSync.');
      if (donor) return { token: signToken({ kind: 'donor', sub: donor.id, phone, ver: donor.tokenVersion }), registered: true };
    }
    return { token: signToken({ kind: 'phone', sub: phone, purpose }), registered: false };
  },
};

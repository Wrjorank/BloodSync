import { Request, Response, NextFunction } from 'express';
import { AuthPayload, OtpPurpose, verifyToken } from '../utils/jwt';
import { forbidden, unauthorized } from '../utils/AppError';
import prisma from '../config/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload) req.auth = payload;
  }
  next();
}

// tokens outlive an admin's decision, so every staff call re-checks that the account and its faskes are still active
async function assertActiveStaff(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true, faskes: { select: { isActive: true } } } });
  if (!user || !user.isActive) throw unauthorized('Akun sudah dinonaktifkan');
  if (user.role === 'FASKES_STAFF' && !user.faskes?.isActive) throw unauthorized('Faskes sudah dinonaktifkan');
}

// staff are always scoped to their own faskes; super admin passes via requireAdmin instead
export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.kind !== 'staff' || a.role !== 'FASKES_STAFF' || !a.faskesId) throw forbidden('Khusus petugas faskes');
  await assertActiveStaff(a.sub);
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.kind !== 'staff' || a.role !== 'SUPER_ADMIN') throw forbidden('Khusus super admin');
  await assertActiveStaff(a.sub);
  next();
}

export function requireDonor(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  if (req.auth.kind !== 'donor') throw forbidden('Khusus pendonor terdaftar');
  next();
}

export const requirePhone = (purpose: OtpPurpose) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) throw unauthorized('Verifikasi nomor WhatsApp terlebih dahulu');
  if (req.auth.kind !== 'phone' || req.auth.purpose !== purpose) throw forbidden('Token verifikasi tidak sesuai');
  next();
};

export const staffFaskesId = (req: Request) => (req.auth as Extract<AuthPayload, { kind: 'staff' }>).faskesId as string;
export const donorId = (req: Request) => (req.auth as Extract<AuthPayload, { kind: 'donor' }>).sub;
export const verifiedPhone = (req: Request) => (req.auth as Extract<AuthPayload, { kind: 'phone' }>).sub;

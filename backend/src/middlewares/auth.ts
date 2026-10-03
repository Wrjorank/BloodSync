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

// tokens outlive an admin's decision, so every staff call re-checks the account against the database:
// still active, and still the same role / faskes / password generation the token was issued for
async function assertActiveStaff(a: Extract<AuthPayload, { kind: 'staff' }>) {
  const user = await prisma.user.findUnique({
    where: { id: a.sub },
    select: { isActive: true, role: true, faskesId: true, tokenVersion: true, faskes: { select: { isActive: true } } },
  });
  if (!user) throw unauthorized('Akun sudah dihapus');
  if (!user.isActive) throw unauthorized('Akun sudah dinonaktifkan');
  if (user.tokenVersion !== a.ver || user.role !== a.role || user.faskesId !== a.faskesId) {
    throw unauthorized('Data akun Anda diubah admin. Silakan masuk kembali.');
  }
  if (user.role === 'FASKES_STAFF' && !user.faskes?.isActive) throw unauthorized('Faskes sudah dinonaktifkan');
}

// staff are always scoped to their own faskes; super admin passes via requireAdmin instead
export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.kind !== 'staff' || a.role !== 'FASKES_STAFF' || !a.faskesId) throw forbidden('Khusus petugas faskes');
  await assertActiveStaff(a);
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (!a) throw unauthorized();
  if (a.kind !== 'staff' || a.role !== 'SUPER_ADMIN') throw forbidden('Khusus super admin');
  await assertActiveStaff(a);
  next();
}

// a token stays valid only while its version matches the donor row; logout bumps the row
export async function isCurrentDonorToken(a: AuthPayload) {
  if (a.kind !== 'donor' || typeof a.ver !== 'number') return false;
  const donor = await prisma.donor.findUnique({ where: { id: a.sub }, select: { tokenVersion: true } });
  return donor?.tokenVersion === a.ver;
}

export async function requireDonor(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthorized();
  if (req.auth.kind !== 'donor') throw forbidden('Khusus pendonor terdaftar');
  if (!(await isCurrentDonorToken(req.auth))) throw unauthorized('Sesi sudah berakhir. Silakan masuk kembali.');
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

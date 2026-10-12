import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';
import { currentRequest } from '../middlewares/requestContext';
import { parseUserAgent } from '../utils/userAgent';
import { maskPhone } from '../utils/helpers';

type Db = Prisma.TransactionClient | typeof prisma;

export type AuditEvent =
  | 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'CREATED' | 'UPDATED' | 'DELETED' | 'EXPORTED' | 'IMPORTED' | 'VIEWED' | 'ERROR';

// action prefix -> the record type shown in the "model" column
const SUBJECTS: Record<string, string> = {
  faskes: 'Facility',
  user: 'User',
  request: 'BloodRequest',
  transfer: 'StockTransfer',
  stock: 'Stock',
  dispatch: 'BloodRequest',
  donation: 'DonorTicket',
  ticket: 'DonorTicket',
  donor: 'Donor',
};

const CREATE = /\.(create|register|request)$/;
const DELETE = /\.delete$/;

function eventOf(action: string): AuditEvent {
  if (action === 'auth.login') return 'LOGIN';
  if (action === 'auth.login_failed') return 'LOGIN_FAILED';
  if (action === 'auth.logout') return 'LOGOUT';
  if (action.startsWith('export.')) return 'EXPORTED';
  if (action.startsWith('import.')) return 'IMPORTED';
  if (action.endsWith('.view_letter')) return 'VIEWED';
  if (action === 'system.error') return 'ERROR';
  if (DELETE.test(action)) return 'DELETED';
  if (CREATE.test(action)) return 'CREATED';
  return 'UPDATED';
}

// secrets never reach the log, whatever object a caller hands in
const SECRET_KEY = /password|hash|token|secret|^otp/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v)]));
  }
  return value;
}

const json = (v: unknown) => (v === undefined ? undefined : (redact(v) as Prisma.InputJsonValue));

// only the fields that actually differ, so the "changed" pane stays readable
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const same = (a: unknown, b: unknown) => JSON.stringify(redact(a)) === JSON.stringify(redact(b));
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => !same(before[k], v)));
}

export interface AuditChange {
  // the record as it was (updates, deletes)
  before?: Record<string, unknown> | null;
  // the record as it is now (creates) or the new values (updates); stored as a diff when before is given
  after?: Record<string, unknown> | null;
}

export async function audit(db: Db, actor: string, action: string, ref?: string, meta?: Prisma.InputJsonValue, change: AuditChange = {}) {
  const ctx = currentRequest();
  const client = ctx ? parseUserAgent(ctx.userAgent) : null;
  const after = change.before && change.after ? changedFields(change.before, change.after) : change.after;
  await db.auditLog.create({
    data: {
      actor,
      action,
      event: eventOf(action),
      subjectType: SUBJECTS[action.split('.')[0]] ?? null,
      ref,
      meta: json(meta),
      before: json(change.before ?? undefined),
      after: json(after ?? undefined),
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      browser: client?.browser,
      platform: client?.platform,
      device: client?.device,
      method: ctx?.method,
      url: ctx?.url,
    },
  });
}

// ---------- reading the log (super admin) ----------

export interface AuditQuery {
  page: number;
  pageSize: number;
  search?: string;
  event?: AuditEvent;
  actorType?: 'admin' | 'staff' | 'family' | 'donor' | 'guest';
  from?: string;
  to?: string;
  sort: 'createdAt' | 'event' | 'actor' | 'ip' | 'browser' | 'platform' | 'subjectType';
  dir: 'asc' | 'desc';
}

// rows written before the english rename still carry the old prefixes
const ACTOR_PREFIX: Record<string, string[]> = {
  admin: ['admin:'], staff: ['staff:'], family: ['family:', 'pemohon:'], donor: ['donor:', 'pendonor:'], guest: ['guest'],
};

export interface ActorInfo {
  type: string;
  label: string;
  email: string | null;
  role: string | null;
  faskes: string | null;
}

// "staff:<uuid>" -> who that was; phones are masked, deleted accounts fall back to the delete entry's snapshot
async function resolveActors(actors: string[]): Promise<Map<string, ActorInfo>> {
  const ids = [...new Set(actors.filter(a => /^(staff|admin):/.test(a)).map(a => a.split(':')[1]))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, role: true, faskes: { select: { name: true } } } })
    : [];
  const byId = new Map(users.map(u => [u.id, u]));
  const missing = ids.filter(id => !byId.has(id));
  const deleted = missing.length
    ? await prisma.auditLog.findMany({ where: { action: 'user.delete', ref: { in: missing } }, select: { ref: true, meta: true } })
    : [];
  const ghost = new Map(deleted.map(d => [d.ref!, d.meta as { email?: string; name?: string; role?: string } | null]));

  const out = new Map<string, ActorInfo>();
  for (const actor of new Set(actors)) {
    const [prefix, ...rest] = actor.split(':');
    const value = rest.join(':');
    const type = prefix === 'pemohon' ? 'family' : prefix === 'pendonor' ? 'donor' : prefix;
    if (type === 'staff' || type === 'admin') {
      const u = byId.get(value);
      const g = ghost.get(value);
      out.set(actor, {
        type,
        label: u?.name ?? g?.name ?? 'Akun terhapus',
        email: u?.email ?? g?.email ?? null,
        role: u?.role ?? g?.role ?? null,
        faskes: u?.faskes?.name ?? null,
      });
    } else if (type === 'family' || type === 'donor') {
      out.set(actor, { type, label: type === 'donor' ? 'Pendonor' : 'Keluarga pasien', email: maskPhone(value), role: null, faskes: null });
    } else {
      out.set(actor, { type: 'guest', label: value || 'Sistem / Tamu', email: value || null, role: null, faskes: null });
    }
  }
  return out;
}

const wib = (d: string, endOfDay = false) => new Date(`${d}T${endOfDay ? '23:59:59.999' : '00:00:00'}+07:00`);

async function whereOf(q: Pick<AuditQuery, 'search' | 'event' | 'actorType' | 'from' | 'to'>): Promise<Prisma.AuditLogWhereInput> {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (q.event) and.push({ event: q.event });
  if (q.actorType) and.push({ OR: ACTOR_PREFIX[q.actorType].map(p => ({ actor: { startsWith: p } })) });
  if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: wib(q.from) } : {}), ...(q.to ? { lte: wib(q.to, true) } : {}) } });
  if (q.search) {
    const contains = { contains: q.search, mode: 'insensitive' as const };
    // searching "budi@rs.id" or "Budi" also finds that person's rows, which are stored by account id
    const people = await prisma.user.findMany({ where: { OR: [{ email: contains }, { name: contains }] }, select: { id: true }, take: 50 });
    and.push({
      OR: [
        { actor: contains }, { action: contains }, { event: contains }, { ref: contains }, { ip: contains },
        { browser: contains }, { platform: contains }, { url: contains }, { subjectType: contains },
        ...people.flatMap(p => [{ actor: `staff:${p.id}` }, { actor: `admin:${p.id}` }]),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export const auditLogService = {
  async list(q: AuditQuery) {
    const where = await whereOf(q);
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, orderBy: [{ [q.sort]: q.dir }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        select: {
          id: true, actor: true, event: true, action: true, subjectType: true, ref: true, ip: true, browser: true,
          platform: true, device: true, method: true, url: true, createdAt: true, before: true, after: true, meta: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);
    const actors = await resolveActors(rows.map(r => r.actor));
    return {
      items: rows.map(({ before, after, meta, ...r }) => ({ ...r, user: actors.get(r.actor)!, hasData: before !== null || after !== null || meta !== null })),
      total, page: q.page, pageSize: q.pageSize,
    };
  },

  async detail(id: string) {
    const row = await prisma.auditLog.findUnique({ where: { id } });
    if (!row) return null;
    const actors = await resolveActors([row.actor]);
    return { ...row, user: actors.get(row.actor)! };
  },

  whereOf,
};

// outside a transaction (logins, exports, errors): a failed log write must never fail the request itself
export function auditNow(actor: string, action: string, ref?: string, meta?: Prisma.InputJsonValue, change?: AuditChange) {
  return audit(prisma, actor, action, ref, meta, change).catch(err => console.error('[audit] gagal mencatat', action, err.message));
}

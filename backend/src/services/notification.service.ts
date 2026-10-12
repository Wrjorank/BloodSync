import { Prisma } from '@prisma/client';
import { Server } from 'socket.io';
import prisma from '../config/prisma';
import { COMPONENT_LABEL } from '../constants/blood';
import { maskPhone } from '../utils/helpers';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { pushService } from './push.service';

// changes collected inside a transaction and broadcast only after it commits
export class Outbox {
  requests = new Set<string>();
  donors = new Set<string>();
  faskes = new Set<string>();
  invites = new Set<string>();
  // request id -> milestone the family should hear about on whatsapp
  familyNotices = new Map<string, 'APPROVED' | 'FULFILLED'>();
  // staff inbox items that also go out as a push to the faskes' browsers once the transaction commits
  staffPush: { faskesId: string; title: string; body: string; view: string }[] = [];
}

export type StaffNoticeKind =
  | 'REQUEST_NEW' | 'REQUEST_URGENT' | 'REQUEST_CANCELLED' | 'REQUEST_FULFILLED' | 'REQUEST_EXPIRED' | 'RADIUS_MAXED'
  | 'TRANSFER_IN' | 'TRANSFER_APPROVED' | 'TRANSFER_REJECTED'
  | 'DONOR_COMING' | 'DONOR_CANCELLED' | 'DONOR_NO_SHOW' | 'STOCK_LOW';

// written in the caller's transaction, so a rolled-back action leaves no notice behind
export async function notifyStaff(
  tx: Prisma.TransactionClient, outbox: Outbox, faskesId: string,
  n: { kind: StaffNoticeKind; title: string; body: string; view: 'stock' | 'requests' | 'scanner' | 'donors' },
) {
  await tx.notification.create({ data: { faskesId, ...n } });
  outbox.staffPush.push({ faskesId, title: n.title, body: n.body, view: n.view });
  outbox.faskes.add(faskesId);
}

export const staffNotifications = {
  async list(faskesId: string, userId: string, page: number, pageSize: number, unreadOnly: boolean) {
    const where: Prisma.NotificationWhereInput = { faskesId, ...(unreadOnly ? { NOT: { readBy: { has: userId } } } : {}) };
    const [rows, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { faskesId, NOT: { readBy: { has: userId } } } }),
    ]);
    return {
      items: rows.map(({ readBy, faskesId: _f, ...n }) => ({ ...n, read: readBy.includes(userId) })),
      total, unread, page, pageSize,
    };
  },

  async markRead(faskesId: string, userId: string, id: string) {
    await prisma.notification.updateMany({ where: { id, faskesId, NOT: { readBy: { has: userId } } }, data: { readBy: { push: userId } } });
  },

  async markAllRead(faskesId: string, userId: string) {
    const { count } = await prisma.notification.updateMany({ where: { faskesId, NOT: { readBy: { has: userId } } }, data: { readBy: { push: userId } } });
    return { updated: count };
  },
};

let io: Server | null = null;
export const setIo = (server: Server) => { io = server; };

// room names shared with socket/index.ts
export const rooms = {
  faskes: (id: string) => `faskes:${id}`,
  donor: (id: string) => `donor:${id}`,
  family: (phone: string) => `family:${phone}`,
  card: (token: string) => `card:${token}`,
  // local browsers only, see socket/index.ts; exists only while env.devInbox is on
  devInbox: 'dev-inbox',
};

// local stand-in for the gateway: the message pops up on screen in every local tab instead of a phone
function toDevInbox(phone: string, text: string, kind: 'otp' | 'pesan') {
  if (!env.devInbox) return;
  io?.to(rooms.devInbox).emit('dev:whatsapp', { to: phone, text, kind, at: new Date().toISOString() });
}

// outbound channel adapters
const channels = {
  async push(donorId: string, title: string, body: string, tag?: string) {
    if (!pushService.enabled()) return console.log(`[push] (firebase belum diatur) donor=${donorId} ${title}`);
    await pushService.toDonor(donorId, { title, body, path: '/donor', tag, route: 'donor', urgent: true });
  },
  async whatsapp(phone: string, text: string) {
    // message bodies carry patient names; production logs keep only the masked recipient
    console.log(`[whatsapp] ${maskPhone(phone)} ${env.isProduction ? `(${text.length} karakter)` : text.replace(/\n/g, ' | ')}`);
    toDevInbox(phone, text, 'pesan');
    await fonnte(phone, text);
  },
};

async function fonnte(phone: string, text: string) {
  if (!env.fonnteToken) return;
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: { Authorization: env.fonnteToken },
    body: new URLSearchParams({ target: phone, message: text, countryCode: '62' }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({})) as { status?: boolean; reason?: string };
  if (!res.ok || body.status === false) throw new Error(`fonnte: ${body.reason || res.status}`);
}

export const sendWhatsapp = (phone: string, text: string) => channels.whatsapp(phone, text);

// the code is never returned by the api. with a gateway it is never logged either;
// without one (development only, env.ts enforces the token in production) it goes to the local on-screen inbox
export async function sendOtpMessage(phone: string, code: string) {
  const text = `Kode OTP BloodSync Anda ${code}. Berlaku 5 menit. Jangan bagikan kode ini.`;
  if (!env.fonnteToken) {
    console.log(`[otp] ${maskPhone(phone)} kode ${code} (dev: tampil sebagai notifikasi di browser lokal)`);
    toDevInbox(phone, text, 'otp');
    return;
  }
  try {
    await fonnte(phone, text);
  } catch (err) {
    console.error('[whatsapp] gagal mengirim OTP', (err as Error).message);
    throw new AppError(503, 'Gagal mengirim OTP ke WhatsApp. Coba lagi sebentar.', 'OTP_SEND_FAILED');
  }
}

async function notifyFamilies(notices: Outbox['familyNotices']) {
  const requests = await prisma.bloodRequest.findMany({
    where: { id: { in: [...notices.keys()] } },
    include: { faskes: { select: { name: true } } },
  });
  const tracker = `${env.publicAppUrl}/patient`;
  for (const r of requests) {
    const need = `${r.bagsNeeded} kantong ${COMPONENT_LABEL[r.component]} ${r.bloodType}`;
    const text = notices.get(r.id) === 'APPROVED'
      ? [
        `✅ *Pengajuan darah ${r.code} sudah diverifikasi* oleh ${r.faskes.name}.`,
        ``,
        `Pasien: ${r.patientName}`,
        `Kebutuhan: ${need}`,
        ``,
        `Petugas sedang mengecek stok dan akan memanggil pendonor terdekat bila perlu. Pantau progresnya secara langsung di sini (masuk dengan nomor WA ini):`,
        tracker,
        ``,
        `Kartu resmi untuk dibagikan ke grup WA / media sosial (status selalu real-time):`,
        `${env.publicAppUrl}/card?t=${r.publicToken}`,
      ].join('\n')
      : [
        `🎉 *Kebutuhan darah ${r.code} sudah terpenuhi.*`,
        ``,
        `${need} untuk ${r.patientName} di ${r.faskes.name} sudah tersedia.`,
        `Kartu publik otomatis dikunci. Mohon hentikan penyebaran pesan panggilan donor agar tidak ada yang datang sia-sia.`,
        ``,
        `Terima kasih telah menggunakan BloodSync. Semoga lekas sembuh 🙏`,
      ].join('\n');
    await channels.whatsapp(r.phone, text)
      .catch(err => console.error(`[whatsapp] gagal kirim ke keluarga ${maskPhone(r.phone)}`, err));
    // the same milestone as a push to every device where the family verified this number (web or android app)
    const approved = notices.get(r.id) === 'APPROVED';
    await pushService.toFamily(r.phone, {
      title: approved ? `Pengajuan ${r.code} diverifikasi` : `Kebutuhan ${r.code} terpenuhi`,
      body: approved ? `${r.faskes.name} memverifikasi ${need}. Petugas sedang mencari stok dan pendonor.` : `${need} untuk ${r.patientName} sudah tersedia.`,
      path: '/patient', route: 'request', requestId: r.id, tag: `request-${r.id}`,
    });
  }
}

// each step is isolated: a failed lookup in one must not drop the others (e.g. a whole wave of invites)
async function step(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
  } catch (err) {
    console.error(`[notify] gagal mengirim ${name}`, err);
  }
}

export async function flush(outbox: Outbox) {
  await step('event permintaan', async () => {
    if (!outbox.requests.size) return;
    const requests = await prisma.bloodRequest.findMany({
      where: { id: { in: [...outbox.requests] } },
      select: { id: true, faskesId: true, publicToken: true, phone: true, status: true },
    });
    for (const r of requests) {
      const payload = { id: r.id, status: r.status };
      io?.to([rooms.faskes(r.faskesId), rooms.family(r.phone), rooms.card(r.publicToken)]).emit('request:updated', payload);
    }
  });
  await step('kabar keluarga', async () => { if (outbox.familyNotices.size) await notifyFamilies(outbox.familyNotices); });
  await step('event faskes', () => { for (const id of outbox.faskes) io?.to(rooms.faskes(id)).emit('faskes:updated', { id }); });
  await step('event pendonor', () => { for (const id of outbox.donors) io?.to(rooms.donor(id)).emit('donor:updated', { id }); });
  await step('push petugas', async () => {
    for (const n of outbox.staffPush) await pushService.toFaskes(n.faskesId, { title: n.title, body: n.body, path: `/facility/${n.view}`, route: 'facility' });
  });

  await step('undangan', async () => {
    if (outbox.invites.size) {
      const tickets = await prisma.donorTicket.findMany({
        where: { id: { in: [...outbox.invites] }, status: 'INVITED' },
        include: { donor: true, request: { include: { faskes: true } } },
      });
      for (const t of tickets) {
        const r = t.request;
        const text = `Panggilan Darurat: Pasien di ${r.faskes.name} butuh ${r.bagsNeeded} kantong ${COMPONENT_LABEL[r.component]} ${r.bloodType}. Jarak Anda ${t.distanceKm.toFixed(1).replace('.', ',')} km. Bersedia membantu?`;
        // one failed donor must not stop the rest of the wave
        await step(`undangan ${t.id}`, async () => {
          io?.to(rooms.donor(t.donorId)).emit('invite:new', { ticketId: t.id, requestId: r.id });
          await channels.push(t.donorId, 'Panggilan Darurat BloodSync', text, `invite-${t.id}`);
          const lines = [`🩸 ${text}`, ``, `Balas *1* = Siap Mendonor`, `Balas *2* = Tidak Bisa`, ``, `Atau buka ${env.publicAppUrl}/donor (masuk dengan nomor WA ini, tanpa daftar)`];
          // registry donors never signed up: say why they got this and how to stop it
          if (t.donor.source === 'REGISTRY') {
            lines.push(``, `Anda menerima pesan ini karena terdata sebagai calon pendonor golongan darah ${t.donor.bloodType} di dekat ${r.faskes.name}. Balas *STOP* bila tidak ingin dihubungi lagi.`);
          }
          // seeded donors carry made-up numbers that may belong to real people: local on-screen inbox only, never a real phone
          if (t.donor.isSimulated) return toDevInbox(t.donor.phone, lines.join('\n'), 'pesan');
          await channels.whatsapp(t.donor.phone, lines.join('\n'))
            .catch(err => console.error(`[whatsapp] gagal kirim undangan ${maskPhone(t.donor.phone)}`, err));
        });
      }
    }
  });
}

import { Server } from 'socket.io';
import prisma from '../config/prisma';
import { COMPONENT_LABEL } from '../constants/blood';
import { maskPhone } from '../utils/helpers';
import { env } from '../config/env';

// changes collected inside a transaction and broadcast only after it commits
export class Outbox {
  requests = new Set<string>();
  donors = new Set<string>();
  faskes = new Set<string>();
  invites = new Set<string>();
  // request id -> milestone the family should hear about on whatsapp
  familyNotices = new Map<string, 'APPROVED' | 'FULFILLED'>();
}

let io: Server | null = null;
export const setIo = (server: Server) => { io = server; };

// room names shared with socket/index.ts
export const rooms = {
  faskes: (id: string) => `faskes:${id}`,
  donor: (id: string) => `donor:${id}`,
  family: (phone: string) => `family:${phone}`,
  card: (token: string) => `card:${token}`,
};

// outbound channel adapters; swap the push log line for fcm in production
const channels = {
  async push(donorId: string, title: string, body: string) {
    console.log(`[push] donor=${donorId} ${title} — ${body}`);
  },
  async whatsapp(phone: string, text: string) {
    console.log(`[whatsapp] ${maskPhone(phone)} ${text.replace(/\n/g, ' | ')}`);
    if (!env.fonnteToken) return;
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: env.fonnteToken },
      body: new URLSearchParams({ target: phone, message: text, countryCode: '62' }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({})) as { status?: boolean; reason?: string };
    if (!res.ok || body.status === false) throw new Error(`fonnte: ${body.reason || res.status}`);
  },
};

export const sendWhatsapp = (phone: string, text: string) => channels.whatsapp(phone, text);

export async function sendOtpMessage(phone: string, code: string) {
  try {
    await channels.whatsapp(phone, `Kode OTP BloodSync Anda ${code}. Berlaku 5 menit. Jangan bagikan kode ini.`);
  } catch (err) {
    // the dev response already carries the code, so a gateway hiccup should not block the demo
    if (!env.exposeOtp) throw err;
    console.error('[whatsapp] gagal mengirim OTP', err);
  }
}

async function notifyFamilies(notices: Outbox['familyNotices']) {
  const requests = await prisma.bloodRequest.findMany({
    where: { id: { in: [...notices.keys()] } },
    include: { faskes: { select: { name: true } } },
  });
  const tracker = `${env.publicAppUrl}/pasien.html`;
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
        `${env.publicAppUrl}/kartu.html?t=${r.publicToken}`,
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
  }
}

export async function flush(outbox: Outbox) {
  try {
    if (outbox.requests.size) {
      const requests = await prisma.bloodRequest.findMany({
        where: { id: { in: [...outbox.requests] } },
        select: { id: true, faskesId: true, publicToken: true, phone: true, status: true },
      });
      for (const r of requests) {
        const payload = { id: r.id, status: r.status };
        io?.to([rooms.faskes(r.faskesId), rooms.family(r.phone), rooms.card(r.publicToken)]).emit('request:updated', payload);
      }
    }
    if (outbox.familyNotices.size) await notifyFamilies(outbox.familyNotices);
    for (const id of outbox.faskes) io?.to(rooms.faskes(id)).emit('faskes:updated', { id });
    for (const id of outbox.donors) io?.to(rooms.donor(id)).emit('donor:updated', { id });

    if (outbox.invites.size) {
      const tickets = await prisma.donorTicket.findMany({
        where: { id: { in: [...outbox.invites] }, status: 'INVITED' },
        include: { donor: true, request: { include: { faskes: true } } },
      });
      for (const t of tickets) {
        const r = t.request;
        const text = `Panggilan Darurat: Pasien di ${r.faskes.name} butuh ${r.bagsNeeded} kantong ${COMPONENT_LABEL[r.component]} ${r.bloodType}. Jarak Anda ${t.distanceKm.toFixed(1).replace('.', ',')} km. Bersedia membantu?`;
        io?.to(rooms.donor(t.donorId)).emit('invite:new', { ticketId: t.id, requestId: r.id });
        await channels.push(t.donorId, 'Panggilan Darurat BloodSync', text);
        // one failed number must not stop the rest of the wave
        await channels.whatsapp(t.donor.phone, `🩸 ${text}\n\nBalas *1* = Siap Mendonor\nBalas *2* = Tidak Bisa\n\nAtau buka ${env.publicAppUrl}/pendonor.html`)
          .catch(err => console.error(`[whatsapp] gagal kirim undangan ${maskPhone(t.donor.phone)}`, err));
      }
    }
  } catch (err) {
    console.error('[notify] gagal mengirim event', err);
  }
}

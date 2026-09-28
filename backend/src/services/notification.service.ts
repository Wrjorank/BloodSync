import { Server } from 'socket.io';
import prisma from '../config/prisma';
import { COMPONENT_LABEL } from '../constants/blood';
import { maskPhone } from '../utils/helpers';

// changes collected inside a transaction and broadcast only after it commits
export class Outbox {
  requests = new Set<string>();
  donors = new Set<string>();
  faskes = new Set<string>();
  invites = new Set<string>();
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

// outbound channel adapters; swap the log lines for fcm / whatsapp business api in production
const channels = {
  async push(donorId: string, title: string, body: string) {
    console.log(`[push] donor=${donorId} ${title} — ${body}`);
  },
  async whatsapp(phone: string, text: string) {
    console.log(`[whatsapp] ${maskPhone(phone)} ${text.replace(/\n/g, ' | ')}`);
  },
};

export async function sendOtpMessage(phone: string, code: string) {
  await channels.whatsapp(phone, `Kode OTP BloodSync Anda ${code}. Berlaku 5 menit. Jangan bagikan kode ini.`);
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
        await channels.whatsapp(t.donor.phone, `${text}\nBalas 1 = Siap Mendonor, 2 = Tidak Bisa`);
      }
    }
  } catch (err) {
    console.error('[notify] gagal mengirim event', err);
  }
}

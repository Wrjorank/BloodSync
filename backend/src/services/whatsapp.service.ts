import prisma from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { maskPhone, normalizePhone } from '../utils/helpers';
import { sendWhatsapp } from './notification.service';
import { ticketService } from './ticket.service';

const HELP = 'Balas *1* untuk menyanggupi atau *2* untuk menolak panggilan darurat Anda.';

// inbound replies from the fonnte webhook: "1" accepts, "2" declines the donor's single open invite
export const whatsappService = {
  async handleReply(sender: string, message: string) {
    const phone = normalizePhone(sender);
    const answer = message.trim();
    if (answer !== '1' && answer !== '2') return;

    const donor = await prisma.donor.findUnique({ where: { phone }, select: { id: true } });
    if (!donor) return;
    const open = await prisma.donorTicket.findMany({
      where: { donorId: donor.id, status: 'INVITED', request: { status: 'BROADCASTING' } },
      orderBy: { invitedAt: 'desc' },
      include: { request: { include: { faskes: true } } },
    });
    if (!open.length) return reply(phone, `Tidak ada panggilan darurat yang menunggu jawaban Anda. Terima kasih! 🙏`);
    // several open calls: a bare "1" is ambiguous, so the donor picks one in the app
    if (open.length > 1) {
      return reply(phone, [
        `Anda punya ${open.length} panggilan darurat yang menunggu jawaban:`,
        ``,
        ...open.map((t, i) => `${i + 1}. ${t.request.faskes.name} (${t.request.code})`),
        ``,
        `Silakan pilih dan jawab langsung di aplikasi:`,
        `${env.publicAppUrl}/pendonor.html`,
      ].join('\n'));
    }
    const ticket = open[0];

    try {
      const result = await ticketService.respond(donor.id, ticket.id, answer === '1');
      const f = ticket.request.faskes;
      if (result.status === 'RESERVED') {
        return reply(phone, [
          `✅ Terima kasih! Slot Anda sudah dikunci.`,
          ``,
          `Kode tiket: *${result.code}*`,
          `Lokasi: ${f.name}`,
          `Perkiraan tiba: ${result.etaMin} menit`,
          `Rute: https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`,
          ``,
          `Tunjukkan kode tiket ke petugas saat tiba.`,
        ].join('\n'));
      }
      if (result.status === 'DECLINED') return reply(phone, 'Baik, panggilan dialihkan ke pendonor lain. Terima kasih atas responsnya.');
      return reply(phone, ('message' in result && result.message) || 'Kuota pendonor sudah terpenuhi. Terima kasih!');
    } catch (err) {
      if (err instanceof AppError) return reply(phone, `${err.message}. ${HELP}`);
      throw err;
    }
  },
};

async function reply(phone: string, text: string) {
  await sendWhatsapp(phone, text).catch(err => console.error(`[whatsapp] gagal membalas ${maskPhone(phone)}`, err));
}

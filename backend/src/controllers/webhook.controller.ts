import crypto from 'crypto';
import { Request, Response } from 'express';
import { env } from '../config/env';
import { whatsappService } from '../services/whatsapp.service';

const sameSecret = (given: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(env.waWebhookSecret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const webhookController = {
  // fonnte posts every incoming chat here; always answer 200 so it does not retry
  async whatsapp(req: Request, res: Response) {
    if (!env.waWebhookSecret || !sameSecret(String(req.query.secret || ''))) return res.status(403).json({ ok: false });
    const { sender, message } = req.body || {};
    if (typeof sender === 'string' && typeof message === 'string') {
      await whatsappService.handleReply(sender, message).catch(err => console.error('[webhook] gagal memproses balasan', err));
    }
    return res.json({ ok: true });
  },
};

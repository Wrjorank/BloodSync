import { Request, Response } from 'express';
import fs from 'fs';
import { staffFaskesId } from '../middlewares/auth';
import { letterAbsolutePath } from '../middlewares/upload';
import { faskesService } from '../services/faskes.service';
import { requestService } from '../services/request.service';
import { ticketService } from '../services/ticket.service';
import { staffNotifications } from '../services/notification.service';
import { auditNow } from '../services/audit.service';
import { pushService } from '../services/push.service';
import { ApiResponse } from '../utils/ApiResponse';
import { notFound } from '../utils/AppError';

const userId = (req: Request) => req.auth!.sub;

export const faskesController = {
  async me(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.me(staffFaskesId(req)));
  },

  // everything the dashboard renders in one round trip: one auth check and one request per realtime event,
  // instead of eight plus one per open request
  async dashboard(req: Request, res: Response) {
    const faskesId = staffFaskesId(req);
    const [faskes, stock, active, history, arrivals, movements, pool, transfers, notifications] = await Promise.all([
      faskesService.me(faskesId), faskesService.stockMatrix(faskesId),
      requestService.listForFaskes(faskesId, 'active'), requestService.listForFaskes(faskesId, 'history'),
      faskesService.arrivals(faskesId), faskesService.movements(faskesId, 8), faskesService.donorPool(faskesId),
      requestService.listTransfers(faskesId),
      // the bell popup: latest few plus the unread count for this person
      staffNotifications.list(faskesId, userId(req), 1, 6, false),
    ]);
    // stock options only matter for requests that can still take units
    const open = active.filter(r => r.status === 'APPROVED' || r.status === 'BROADCASTING');
    const options = Object.fromEntries(await Promise.all(open.map(async r => [r.id, await requestService.stockOptions(faskesId, r.id)] as const)));
    return ApiResponse.success(res, { faskes, stock, active, history, arrivals, movements, pool, transfers, options, notifications });
  },

  async stock(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.stockMatrix(staffFaskesId(req)));
  },

  async adjustStock(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.adjustStock(staffFaskesId(req), userId(req), req.body), 'Stok diperbarui');
  },

  async movements(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.movements(staffFaskesId(req), Number(req.query.limit)));
  },

  async donorPool(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.donorPool(staffFaskesId(req)));
  },

  async arrivals(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.arrivals(staffFaskesId(req)));
  },

  async listRequests(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.listForFaskes(staffFaskesId(req), req.query.scope as 'active' | 'history'));
  },

  async requestDetail(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.getForStaff(staffFaskesId(req), req.params.id));
  },

  async letter(req: Request, res: Response) {
    const letter = await requestService.letterFor(staffFaskesId(req), req.params.id);
    const file = letterAbsolutePath(letter.letterPath!);
    if (!fs.existsSync(file)) throw notFound('Berkas surat tidak ditemukan');
    await auditNow(`staff:${userId(req)}`, 'request.view_letter', req.params.id, { file: letter.letterName });
    res.setHeader('Content-Type', letter.letterMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="surat"; filename*=UTF-8''${encodeURIComponent(letter.letterName || 'surat')}`);
    res.setHeader('Cache-Control', 'private, no-store');
    // a pdf opened from this response must not be able to run scripts against the app origin
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    // the file can vanish or be unreadable between the check and the read; never let that crash the process
    fs.createReadStream(file)
      .on('error', err => {
        console.error('[letter] gagal membaca berkas surat', err.message);
        if (!res.headersSent) {
          res.removeHeader('Content-Disposition');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Berkas surat tidak ditemukan' } });
        } else res.destroy(err);
      })
      .pipe(res);
  },

  async stockOptions(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.stockOptions(staffFaskesId(req), req.params.id));
  },

  async approve(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.approve(staffFaskesId(req), userId(req), req.params.id), 'Pengajuan disetujui');
  },

  async reject(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.reject(staffFaskesId(req), userId(req), req.params.id, req.body.reason), 'Pengajuan ditolak');
  },

  async allocate(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.allocate(staffFaskesId(req), userId(req), req.params.id), 'Stok dialokasikan');
  },

  async transfer(req: Request, res: Response) {
    const result = await requestService.requestTransfer(staffFaskesId(req), userId(req), req.params.id, req.body.fromFaskesId);
    return ApiResponse.success(res, result, 'Permintaan mutasi dikirim, menunggu persetujuan faskes sumber', 201);
  },

  async transfers(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.listTransfers(staffFaskesId(req)));
  },

  async approveTransfer(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.decideTransfer(staffFaskesId(req), userId(req), req.params.id, true), 'Mutasi disetujui');
  },

  async rejectTransfer(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.decideTransfer(staffFaskesId(req), userId(req), req.params.id, false), 'Mutasi ditolak');
  },

  async dispatch(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.startDispatch(staffFaskesId(req), userId(req), req.params.id, req.body), 'Panggilan darurat aktif');
  },

  async close(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.close(staffFaskesId(req), userId(req), req.params.id), 'Permintaan ditutup');
  },

  async scan(req: Request, res: Response) {
    return ApiResponse.success(res, await ticketService.scan(staffFaskesId(req), req.body.code), 'Tiket valid');
  },

  async screening(req: Request, res: Response) {
    const result = await ticketService.screening(staffFaskesId(req), userId(req), req.params.id, req.body);
    return ApiResponse.success(res, result, result.pass ? 'Lolos skrining' : 'Tidak lolos skrining');
  },

  async collect(req: Request, res: Response) {
    return ApiResponse.success(res, await ticketService.collect(staffFaskesId(req), userId(req), req.params.id), 'Pengambilan darah tercatat');
  },

  async noShow(req: Request, res: Response) {
    return ApiResponse.success(res, await ticketService.noShow(staffFaskesId(req), userId(req), req.params.id), 'Slot dilepas');
  },

  async notifications(req: Request, res: Response) {
    const { page, pageSize, unread } = req.query as unknown as { page: number; pageSize: number; unread: string };
    return ApiResponse.success(res, await staffNotifications.list(staffFaskesId(req), userId(req), page, pageSize, unread === 'true'));
  },

  async readNotification(req: Request, res: Response) {
    await staffNotifications.markRead(staffFaskesId(req), userId(req), req.params.id);
    return ApiResponse.success(res, null);
  },

  async addPushToken(req: Request, res: Response) {
    await pushService.register(req.body.token, { userId: userId(req), faskesId: staffFaskesId(req) }, req.get('user-agent'));
    return ApiResponse.success(res, null, 'Notifikasi diaktifkan');
  },

  async removePushToken(req: Request, res: Response) {
    await pushService.unregister(req.body.token, { userId: userId(req) });
    return ApiResponse.success(res, null, 'Notifikasi dimatikan');
  },

  async readAllNotifications(req: Request, res: Response) {
    return ApiResponse.success(res, await staffNotifications.markAllRead(staffFaskesId(req), userId(req)), 'Semua notifikasi ditandai dibaca');
  },
};

import { Request, Response } from 'express';
import fs from 'fs';
import { staffFaskesId } from '../middlewares/auth';
import { letterAbsolutePath } from '../middlewares/upload';
import { faskesService } from '../services/faskes.service';
import { requestService } from '../services/request.service';
import { ticketService } from '../services/ticket.service';
import prisma from '../config/prisma';
import { ApiResponse } from '../utils/ApiResponse';
import { notFound } from '../utils/AppError';

const userId = (req: Request) => req.auth!.sub;

export const faskesController = {
  async me(req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.me(staffFaskesId(req)));
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
    await prisma.auditLog.create({ data: { actor: `staff:${userId(req)}`, action: 'request.view_letter', ref: req.params.id } });
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
};

import { Request, Response } from 'express';
import { verifiedPhone } from '../middlewares/auth';
import { requestService } from '../services/request.service';
import { ApiResponse } from '../utils/ApiResponse';
import { badRequest } from '../utils/AppError';

export const familyController = {
  async create(req: Request, res: Response) {
    if (!req.file) throw badRequest('Lampirkan foto surat pengantar dokter');
    const result = await requestService.create(verifiedPhone(req), req.body, req.file);
    return ApiResponse.success(res, result, 'Pengajuan terkirim, menunggu verifikasi faskes', 201);
  },

  async listMine(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.listMine(verifiedPhone(req)));
  },

  async detail(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.getForFamily(verifiedPhone(req), req.params.id));
  },

  async cancel(req: Request, res: Response) {
    return ApiResponse.success(res, await requestService.cancelByFamily(verifiedPhone(req), req.params.id), 'Pengajuan dibatalkan');
  },
};

import { Request, Response } from 'express';
import { verifiedPhone } from '../middlewares/auth';
import { requestService } from '../services/request.service';
import { pushService } from '../services/push.service';
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

  // the family's device gets their request milestones as push, tied to the verified number
  async addPushToken(req: Request, res: Response) {
    await pushService.register(req.body.token, { phone: verifiedPhone(req) }, req.get('user-agent'));
    return ApiResponse.success(res, null, 'Notifikasi diaktifkan');
  },

  async removePushToken(req: Request, res: Response) {
    await pushService.unregister(req.body.token, { phone: verifiedPhone(req) });
    return ApiResponse.success(res, null, 'Notifikasi dimatikan');
  },
};

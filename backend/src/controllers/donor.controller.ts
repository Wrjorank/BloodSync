import { Request, Response } from 'express';
import { donorId, verifiedPhone } from '../middlewares/auth';
import { donorService } from '../services/donor.service';
import { ticketService } from '../services/ticket.service';
import { ApiResponse } from '../utils/ApiResponse';

export const donorController = {
  async register(req: Request, res: Response) {
    const result = await donorService.register(verifiedPhone(req), req.body);
    return ApiResponse.success(res, result, 'Profil pendonor aktif', 201);
  },

  async dashboard(req: Request, res: Response) {
    return ApiResponse.success(res, await donorService.dashboard(donorId(req)));
  },

  async updateArea(req: Request, res: Response) {
    return ApiResponse.success(res, await donorService.updateArea(donorId(req), req.body.area), 'Lokasi diperbarui');
  },

  async updateLocation(req: Request, res: Response) {
    return ApiResponse.success(res, await donorService.updateLocation(donorId(req), req.body), 'Lokasi GPS diperbarui');
  },

  async deactivate(req: Request, res: Response) {
    return ApiResponse.success(res, await donorService.deactivate(donorId(req)), 'Anda tidak akan menerima panggilan lagi');
  },

  async reactivate(req: Request, res: Response) {
    return ApiResponse.success(res, await donorService.reactivate(donorId(req)), 'Profil aktif kembali');
  },

  async respond(req: Request, res: Response) {
    const result = await ticketService.respond(donorId(req), req.params.id, req.body.accept);
    const message = result.status === 'RESERVED' ? 'Slot dikunci untuk Anda' : result.status === 'DECLINED' ? 'Panggilan dialihkan ke pendonor cadangan' : ('message' in result && result.message) || 'Kuota sudah terpenuhi';
    return ApiResponse.success(res, result, message);
  },

  async cancel(req: Request, res: Response) {
    return ApiResponse.success(res, await ticketService.cancelByDonor(donorId(req), req.params.id), 'Kedatangan dibatalkan');
  },

  async acknowledge(req: Request, res: Response) {
    return ApiResponse.success(res, await ticketService.acknowledge(donorId(req), req.params.id));
  },

  async finishRecovery(req: Request, res: Response) {
    return ApiResponse.success(res, await donorService.finishRecovery(donorId(req)), 'Masa pemulihan disimulasikan selesai');
  },
};

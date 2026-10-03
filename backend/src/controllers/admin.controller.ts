import { Request, Response } from 'express';
import { adminService } from '../services/admin.service';
import { ApiResponse } from '../utils/ApiResponse';

const adminId = (req: Request) => req.auth!.sub;

export const adminController = {
  async overview(_req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.overview());
  },

  async listFaskes(_req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.listFaskes());
  },

  async createFaskes(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.createFaskes(adminId(req), req.body), 'Faskes ditambahkan', 201);
  },

  async setFaskesActive(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.setFaskesActive(adminId(req), req.params.id, req.body.isActive), 'Status faskes diperbarui');
  },

  async updateFaskes(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.updateFaskes(adminId(req), req.params.id, req.body), 'Faskes diperbarui');
  },

  async deleteFaskes(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.deleteFaskes(adminId(req), req.params.id), 'Faskes dihapus');
  },

  async updateUser(req: Request, res: Response) {
    const result = await adminService.updateUser(adminId(req), req.params.id, req.body);
    return ApiResponse.success(res, result, result.sessionsRevoked ? 'Akun diperbarui. Pemilik akun perlu masuk ulang.' : 'Akun diperbarui');
  },

  async deleteUser(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.deleteUser(adminId(req), req.params.id), 'Akun dihapus');
  },

  async listUsers(_req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.listUsers());
  },

  async createUser(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.createUser(adminId(req), req.body), 'Akun dibuat', 201);
  },

  async setUserActive(req: Request, res: Response) {
    return ApiResponse.success(res, await adminService.setUserActive(adminId(req), req.params.id, req.body.isActive), 'Status akun diperbarui');
  },

  async audit(req: Request, res: Response) {
    const { page, pageSize, actor } = req.query as unknown as { page: number; pageSize: number; actor?: string };
    return ApiResponse.success(res, await adminService.auditLogs(page, pageSize, actor));
  },
};

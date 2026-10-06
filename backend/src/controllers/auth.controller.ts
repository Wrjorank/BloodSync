import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { ApiResponse } from '../utils/ApiResponse';
import { unauthorized } from '../utils/AppError';
import { clientKey } from '../middlewares/rateLimit';

export const authController = {
  async staffLogin(req: Request, res: Response) {
    const { email, password } = req.body;
    return ApiResponse.success(res, await authService.staffLogin(email, password, clientKey(req.ip)), 'Berhasil masuk');
  },

  async requestOtp(req: Request, res: Response) {
    const { phone, purpose } = req.body;
    return ApiResponse.success(res, await authService.requestOtp(phone, purpose), 'Kode OTP dikirim via WhatsApp');
  },

  async verifyOtp(req: Request, res: Response) {
    const { phone, purpose, code } = req.body;
    return ApiResponse.success(res, await authService.verifyOtp(phone, purpose, code), 'Nomor terverifikasi');
  },

  async me(req: Request, res: Response) {
    if (!req.auth) throw unauthorized();
    return ApiResponse.success(res, await authService.me(req.auth));
  },
};

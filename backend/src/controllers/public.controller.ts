import { Request, Response } from 'express';
import { AREAS, BLOOD_TYPES, COMPONENT_LABEL, DISPATCH, SCREENING } from '../constants/blood';
import { faskesService } from '../services/faskes.service';
import { requestService } from '../services/request.service';
import { ApiResponse } from '../utils/ApiResponse';
import { env } from '../config/env';

export const publicController = {
  async meta(_req: Request, res: Response) {
    return ApiResponse.success(res, {
      bloodTypes: BLOOD_TYPES,
      components: COMPONENT_LABEL,
      urgencies: { KRITIS: 'Kritis', MENDESAK: 'Mendesak', TERJADWAL: 'Terjadwal' },
      areas: Object.keys(AREAS),
      dispatch: DISPATCH,
      screening: SCREENING,
      // tells local pages to show whatsapp messages on screen; always false in production
      devInbox: env.devInbox,
    });
  },

  async faskes(_req: Request, res: Response) {
    return ApiResponse.success(res, await faskesService.listPublic());
  },

  async card(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return ApiResponse.success(res, await requestService.publicCard(req.params.token));
  },
};

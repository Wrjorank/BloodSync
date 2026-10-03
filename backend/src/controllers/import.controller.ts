import { Request, Response } from 'express';
import { staffFaskesId } from '../middlewares/auth';
import { AdminImport, StaffImport, importService } from '../services/import.service';
import { ApiResponse } from '../utils/ApiResponse';
import { badRequest } from '../utils/AppError';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendXlsx(res: Response, filename: string, buffer: Buffer) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

const fileOf = (req: Request) => {
  if (!req.file) throw badRequest('Pilih file Excel (.xlsx) terlebih dahulu');
  return req.file.buffer;
};
const committing = (req: Request) => req.query.commit === '1';

export const importController = {
  async staffTemplate(req: Request, res: Response) {
    const dataset = req.params.dataset as StaffImport;
    sendXlsx(res, `bloodsync_template-import-${dataset}.xlsx`, await importService.staffTemplate(staffFaskesId(req), dataset));
  },

  async adminTemplate(req: Request, res: Response) {
    const dataset = req.params.dataset as AdminImport;
    sendXlsx(res, `bloodsync_template-import-${dataset}.xlsx`, await importService.adminTemplate(dataset));
  },

  // without ?commit=1 the file is only checked; with it, everything is saved in one transaction or nothing is
  async staff(req: Request, res: Response) {
    const dataset = req.params.dataset as StaffImport;
    if (!committing(req)) return ApiResponse.success(res, await importService.previewStaff(staffFaskesId(req), dataset, fileOf(req)));
    const result = await importService.commitStaff(staffFaskesId(req), req.auth!.sub, dataset, fileOf(req));
    return ApiResponse.success(res, result, `Import selesai: ${result.changed} stok diperbarui`);
  },

  async admin(req: Request, res: Response) {
    const dataset = req.params.dataset as AdminImport;
    if (!committing(req)) return ApiResponse.success(res, await importService.previewAdmin(dataset, fileOf(req)));
    const result = await importService.commitAdmin(req.auth!.sub, dataset, fileOf(req));
    // new accounts: the response is the one-time file with their initial passwords
    if ('credentials' in result && result.credentials) {
      res.setHeader('X-Import-Rows', String(result.imported));
      const stamp = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      return sendXlsx(res, `bloodsync_akun-baru_${stamp}.xlsx`, result.credentials);
    }
    return ApiResponse.success(res, result, `Import selesai: ${result.imported} data ditambahkan`);
  },
};

import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { staffFaskesId } from '../middlewares/auth';
import { AdminDataset, ExportFile, ExportFilter, StaffDataset, exportService } from '../services/export.service';

// exports carry patient and donor data, so every download is audited like opening a doctor's letter
async function send(req: Request, res: Response, actor: string, dataset: string, file: ExportFile) {
  const { from, to, actor: actorFilter } = req.query as ExportFilter;
  await prisma.auditLog.create({ data: { actor, action: `export.${dataset}`, meta: { rows: file.rows, truncated: file.truncated, from, to, actor: actorFilter } } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Export-Rows', String(file.rows));
  if (file.truncated) res.setHeader('X-Export-Truncated', '1');
  res.send(file.buffer);
}

export const exportController = {
  async staff(req: Request, res: Response) {
    const dataset = req.params.dataset as StaffDataset;
    const file = await exportService.staff(staffFaskesId(req), dataset, req.query as ExportFilter);
    await send(req, res, `staff:${req.auth!.sub}`, dataset, file);
  },

  async admin(req: Request, res: Response) {
    const dataset = req.params.dataset as AdminDataset;
    const file = await exportService.admin(dataset, req.query as ExportFilter);
    await send(req, res, `admin:${req.auth!.sub}`, dataset, file);
  },
};

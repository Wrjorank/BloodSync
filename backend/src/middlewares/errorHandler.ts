import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Endpoint ${req.method} ${req.path} tidak ada` } });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // multer already wrote the upload before validation ran; a failed request must not leave it behind
  if (req.file?.path) fs.unlink(req.file.path, () => undefined);
  let error: AppError;
  if (err instanceof AppError) error = err;
  else if (err instanceof MulterError) {
    const max = req.path.includes('/import/') ? '2 MB' : '5 MB';
    error = new AppError(400, err.code === 'LIMIT_FILE_SIZE' ? `Ukuran berkas maksimal ${max}` : err.message, 'UPLOAD_FAILED');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const onEmail = String(err.meta?.target ?? '').includes('email');
    error = new AppError(409, onEmail ? 'Email sudah dipakai akun lain' : 'Data sudah terdaftar', 'DUPLICATE');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
    error = new AppError(400, 'Data rujukan tidak ditemukan', 'INVALID_REFERENCE');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    error = new AppError(404, 'Data tidak ditemukan', 'NOT_FOUND');
  } else if (err instanceof SyntaxError && 'body' in err) {
    error = new AppError(400, 'Body JSON tidak valid', 'INVALID_JSON');
  } else {
    console.error('[error]', err);
    error = new AppError(500, env.isProduction ? 'Terjadi kesalahan pada server' : String((err as Error)?.message || err), 'INTERNAL');
  }

  res.status(error.statusCode).json({
    success: false,
    error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
  });
};

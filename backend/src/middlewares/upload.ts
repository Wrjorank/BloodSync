import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { randomCode } from '../utils/helpers';
import { badRequest } from '../utils/AppError';

const LETTER_DIR = path.join(env.uploadDir, 'letters');
fs.mkdirSync(LETTER_DIR, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const TYPE_ERROR = 'Surat pengantar harus berupa foto (JPG/PNG/WEBP/HEIC) atau PDF';

// the browser-sent mimetype is only a hint; the real type comes from the file's first bytes
function sniff(head: Buffer): { mime: string; ext: string } | null {
  const ascii = (from: number, to: number) => head.subarray(from, to).toString('latin1');
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(8, 12))) return { mime: 'image/heic', ext: '.heic' };
  if (ascii(0, 5) === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' };
  return null;
}

const multerSingle = multer({
  storage: multer.diskStorage({
    destination: LETTER_DIR,
    // no part of the client file name reaches the disk name
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${randomCode(16)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(badRequest(TYPE_ERROR));
  },
}).single('letter');

// doctor's letters are stored outside any public folder and only served to staff of the target faskes
export function letterUpload(req: Request, res: Response, next: NextFunction) {
  multerSingle(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.file) return next(badRequest('Lampirkan foto surat pengantar dokter'));
    const fd = fs.openSync(req.file.path, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const real = sniff(head);
    // errorHandler deletes req.file on any failure
    if (!real) return next(badRequest(TYPE_ERROR));
    const finalPath = req.file.path + real.ext;
    fs.renameSync(req.file.path, finalPath);
    Object.assign(req.file, { path: finalPath, filename: req.file.filename + real.ext, mimetype: real.mime });
    next();
  });
}

// excel imports are parsed in memory and never written to disk; readSheet checks the zip signature
export const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(badRequest('Unggah file Excel .xlsx (gunakan template dari BloodSync)'));
  },
}).single('file');

export const letterAbsolutePath = (stored: string) => path.join(LETTER_DIR, path.basename(stored));

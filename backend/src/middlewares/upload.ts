import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env';
import { randomCode } from '../utils/helpers';
import { badRequest } from '../utils/AppError';

const LETTER_DIR = path.join(env.uploadDir, 'letters');
fs.mkdirSync(LETTER_DIR, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

// doctor's letters are stored outside any public folder and only served to staff of the target faskes
export const letterUpload = multer({
  storage: multer.diskStorage({
    destination: LETTER_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomCode(10)}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(badRequest('Surat pengantar harus berupa foto (JPG/PNG/WEBP) atau PDF'));
  },
}).single('letter');

export const letterAbsolutePath = (stored: string) => path.join(LETTER_DIR, path.basename(stored));

import { Response } from 'express';

export class ApiResponse {
  static success(res: Response, data: unknown, message = 'Berhasil', statusCode = 200) {
    return res.status(statusCode).json({ success: true, message, data });
  }
}

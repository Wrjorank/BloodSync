export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code = 'ERROR', public details?: unknown) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new AppError(400, message, code);
export const unauthorized = (message = 'Silakan masuk terlebih dahulu') => new AppError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'Akses ditolak') => new AppError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Data tidak ditemukan') => new AppError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, message, code);
export const tooMany = (message: string) => new AppError(429, message, 'RATE_LIMITED');

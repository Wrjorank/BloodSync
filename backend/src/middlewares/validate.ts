import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

// validates { body, query, params } and replaces them with the parsed (coerced) values
export const validate = (schema: z.ZodType<{ body?: unknown; query?: unknown; params?: unknown }>) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({ body: req.body, query: req.query, params: req.params });
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.params !== undefined) req.params = parsed.params as Request['params'];
      if (parsed.query !== undefined) req.query = parsed.query as Request['query'];
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map(i => ({ path: i.path.slice(1).join('.'), message: i.message }));
        return next(new AppError(400, details[0]?.message || 'Validasi gagal', 'VALIDATION_FAILED', details));
      }
      next(error);
    }
  };

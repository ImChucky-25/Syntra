import type { NextFunction, Request, Response } from 'express';
import type { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: `No route: ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Multer upload errors carry a numeric `code` (e.g. LIMIT_FILE_SIZE) — map
  // them to client errors instead of surfacing as 500s.
  const multerCode = (err as { code?: unknown } | null)?.code;
  if (multerCode === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'File exceeds the 10 MB limit' } });
    return;
  }
  if (typeof multerCode === 'string' && multerCode.startsWith('LIMIT_')) {
    res.status(400).json({ error: { code: 'upload_rejected', message: 'Upload rejected' } });
    return;
  }

  const appErr = err as AppError;
  const statusCode = typeof appErr?.statusCode === 'number' ? appErr.statusCode : 500;
  const code = typeof appErr?.code === 'string' ? appErr.code : 'internal_error';
  const message = statusCode >= 500 && !appErr?.statusCode ? 'Internal server error' : (appErr?.message ?? 'Request failed');

  if (statusCode >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled request error');
  }

  res.status(statusCode).json({
    error: { code, message },
  });
}


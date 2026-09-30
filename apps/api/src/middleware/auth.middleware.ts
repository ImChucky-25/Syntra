import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { AuthError } from '../lib/errors.js';
import type { UserInfo } from '../modules/auth/auth-user.js';

export interface AuthenticatedRequest extends Request {
  user: UserInfo;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  void res;
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const token = bearer ?? (req.cookies as Record<string, string | undefined> | undefined)?.ai_zone_token;
  if (!token) {
    next(new AuthError('Missing authentication token'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: '' };
    next();
    return;
  } catch (err) {
    next(err);
    return;
  }
}

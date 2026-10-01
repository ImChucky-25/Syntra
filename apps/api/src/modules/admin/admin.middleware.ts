import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { ForbiddenError, AuthError } from '../../lib/errors.js';

/** Role-based access for admin endpoints (spec §11.1). Role is read from the DB, not the token. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AuthError('Sign in required');
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, isActive: true } });
    if (!user || !user.isActive) throw new AuthError('Account unavailable');
    if (user.role !== 'ADMIN') throw new ForbiddenError('Administrator access required');
    next();
  } catch (err) {
    next(err);
  }
}

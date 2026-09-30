import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { createSession, signAccessToken, revokeSession } from './token.service.js';
import { ValidationError, AuthError } from '../../lib/errors.js';
import { registerSchema, loginSchema } from '@ai-zone/validation';

const COOKIE_NAME = 'ai_zone_token';

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 72 * 3600_000,
  });
}

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid registration data', parsed.error.flatten());
    }
    const { email, password, displayName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError('An account with this email already exists');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, displayName, passwordHash },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });

    const token = signAccessToken(user.id, user.role);
    await createSession(user.id, token);
    setAuthCookie(res, token);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login data', parsed.error.flatten());
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      // Same message either way — do not reveal which (spec §11.1)
      throw new AuthError('Invalid email or password');
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw new AuthError('Invalid email or password');

    const token = signAccessToken(user.id, user.role);
    await createSession(user.id, token);
    setAuthCookie(res, token);
    res.json({ user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, token });
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies as Record<string, string | undefined>).ai_zone_token;
  if (token) {
    void revokeSession(token)
      .then(() => {
        res.clearCookie(COOKIE_NAME);
        res.json({ ok: true });
      })
      .catch(next);
  } else {
    res.json({ ok: true });
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AuthError();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
    if (!user) throw new AuthError();
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

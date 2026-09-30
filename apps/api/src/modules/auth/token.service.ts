import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { AuthError } from '../../lib/errors.js';

export interface JwtPayload {
  sub: string;
  role: string;
}

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role } satisfies JwtPayload, env.jwtSecret, {
    expiresIn: `${env.accessTokenTtlHours}h`,
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Persist a session row keyed by the SHA-256 of the token. */
export async function createSession(userId: string, token: string): Promise<void> {
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.accessTokenTtlHours * 3600_000),
    },
  });
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

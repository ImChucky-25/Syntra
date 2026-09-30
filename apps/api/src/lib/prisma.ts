import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
    log: env.isProd ? ['error'] : ['error', 'warn'],
  });

if (!env.isProd) global.prisma = prisma;

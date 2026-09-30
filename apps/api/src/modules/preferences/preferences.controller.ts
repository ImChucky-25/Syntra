import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ValidationError } from '../../lib/errors.js';

const updateSchema = z.object({
  defaultModelKey: z.string().min(1).nullable(),
});

export async function getPreferences(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = _req.user?.id;
    if (!userId) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const prefs = await prisma.userPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    res.json({ preferences: { defaultModelKey: prefs.defaultModelKey, theme: prefs.theme } });
  } catch (err) {
    next(err);
  }
}

export async function updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid preferences payload', parsed.error.flatten());
    }
    const { defaultModelKey } = parsed.data;

    if (defaultModelKey) {
      const model = await prisma.aiModel.findFirst({
        where: { modelKey: defaultModelKey, enabled: true, provider: { enabled: true, status: 'active' } },
      });
      if (!model) {
        throw new ValidationError(`Model "${defaultModelKey}" is not available`);
      }
    }

    const prefs = await prisma.userPreference.upsert({
      where: { userId },
      update: { defaultModelKey },
      create: { userId, defaultModelKey },
    });
    res.json({ preferences: { defaultModelKey: prefs.defaultModelKey, theme: prefs.theme } });
  } catch (err) {
    next(err);
  }
}

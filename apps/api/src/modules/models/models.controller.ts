import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';

export async function listModels(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const models = await prisma.aiModel.findMany({
      where: { enabled: true, provider: { enabled: true, status: 'active' } },
      include: { provider: true },
      orderBy: [{ providerId: 'asc' }, { modelKey: 'asc' }],
    });
    res.json({
      models: models.map((m) => ({
        id: m.id,
        modelKey: m.modelKey,
        displayName: m.displayName,
        provider: m.provider.name,
        capabilities: m.capabilities,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        supportsStreaming: true,
        supportsTools: m.capabilities.includes('tools'),
        costPer1kInput: m.costPer1kInput.toNumber(),
        costPer1kOutput: m.costPer1kOutput.toNumber(),
      })),
    });
  } catch (err) {
    next(err);
  }
}

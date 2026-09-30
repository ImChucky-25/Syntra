import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';

export async function getUsageSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new Error('unauthorized');
    const since = new Date(Date.now() - 30 * 24 * 3600_000);

    const records = await prisma.usageRecord.findMany({
      where: { userId: req.user.id, createdAt: { gte: since } },
      include: { model: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const totals = { requests: records.length, inputTokens: 0, outputTokens: 0, costAmount: 0 };
    const byModelMap = new Map<string, { modelId: string; modelKey: string; requests: number; inputTokens: number; outputTokens: number; costAmount: number }>();
    const dailyMap = new Map<string, { date: string; requests: number; inputTokens: number; outputTokens: number; costAmount: number }>();

    for (const r of records) {
      totals.inputTokens += r.inputTokens;
      totals.outputTokens += r.outputTokens;
      totals.costAmount += Number(r.costAmount);

      const mk = r.model?.modelKey ?? 'unknown';
      const mEntry = byModelMap.get(mk) ?? {
        modelId: r.modelId ?? '', modelKey: mk, requests: 0, inputTokens: 0, outputTokens: 0, costAmount: 0,
      };
      mEntry.requests += 1;
      mEntry.inputTokens += r.inputTokens;
      mEntry.outputTokens += r.outputTokens;
      mEntry.costAmount += Number(r.costAmount);
      byModelMap.set(mk, mEntry);

      const day = r.createdAt.toISOString().slice(0, 10);
      const dEntry = dailyMap.get(day) ?? {
        date: day, requests: 0, inputTokens: 0, outputTokens: 0, costAmount: 0,
      };
      dEntry.requests += 1;
      dEntry.inputTokens += r.inputTokens;
      dEntry.outputTokens += r.outputTokens;
      dEntry.costAmount += Number(r.costAmount);
      dailyMap.set(day, dEntry);
    }

    res.json({
      totals,
      byModel: [...byModelMap.values()],
      daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err) {
    next(err);
  }
}

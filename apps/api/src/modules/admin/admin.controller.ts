import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * Administrative console backend (spec §12, §8.2 admin console, §11.1 audited
 * administrative changes). Every mutation logs actor, target, and action.
 */

/** GET /api/v1/admin/overview — operational dashboard snapshot. */
export async function getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const [users, activeSubs, conversations, models, providers, usage] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active', periodEnd: { gt: new Date() } } }),
      prisma.conversation.count({ where: { deletedAt: null } }),
      prisma.aiModel.count({ where: { enabled: true } }),
      prisma.aiProvider.findMany({ select: { id: true, name: true, status: true, enabled: true } }),
      prisma.usageRecord.aggregate({
        where: { createdAt: { gte: since } },
        _count: { id: true },
        _sum: { inputTokens: true, outputTokens: true, costAmount: true },
      }),
    ]);
    res.json({
      overview: {
        users,
        activeSubscriptions: activeSubs,
        conversations,
        enabledModels: models,
        providers: providers.map((p) => ({ id: p.id, name: p.name, status: p.status, enabled: p.enabled })),
        usage30d: {
          requests: usage._count.id,
          inputTokens: usage._sum.inputTokens ?? 0,
          outputTokens: usage._sum.outputTokens ?? 0,
          costUsd: Number(usage._sum.costAmount ?? 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

const listUsersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/v1/admin/users — searchable user list with plan + usage rollups. */
export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = listUsersQuery.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query');
    const { q, limit, offset } = parsed.data;

    const users = await prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        subscriptions: {
          where: { status: 'active', periodEnd: { gt: new Date() } },
          take: 1,
          orderBy: { periodStart: 'desc' },
          select: { plan: { select: { key: true, name: true } }, periodEnd: true },
        },
        _count: { select: { conversations: true, usageRecords: true } },
      },
    });

    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        plan: u.subscriptions[0]?.plan ?? { key: 'free', name: 'Free' },
        conversationCount: u._count.conversations,
        usageCount: u._count.usageRecords,
      })),
    });
  } catch (err) {
    next(err);
  }
}

const patchUserSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  planKey: z.string().max(40).optional(),
});

/** PATCH /api/v1/admin/users/:id — role, activation, and plan assignment (audited). */
export async function patchUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = req.user!;
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid user id');
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid update', parsed.error.flatten());
    const { role, isActive, planKey } = parsed.data;
    if (role === undefined && isActive === undefined && planKey === undefined) {
      throw new ValidationError('Nothing to update');
    }

    const target = await prisma.user.findUnique({ where: { id: id.data } });
    if (!target) throw new NotFoundError('User not found');

    if (role !== undefined || isActive !== undefined) {
      // Guard: the last active admin cannot lock themselves out.
      if (target.role === 'ADMIN' && (role === 'USER' || isActive === false)) {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (adminCount <= 1) throw new ValidationError('Cannot demote or disable the last active administrator');
      }
      await prisma.user.update({
        where: { id: target.id },
        data: {
          ...(role !== undefined ? { role } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });
    }

    if (planKey !== undefined) {
      const plan = await prisma.plan.findUnique({ where: { key: planKey } });
      if (!plan) throw new ValidationError(`Unknown plan "${planKey}"`);
      const now = new Date();
      // Expire current active subscriptions, then grant the new plan to period end.
      await prisma.subscription.updateMany({
        where: { userId: target.id, status: 'active', periodEnd: { gt: now } },
        data: { status: 'canceled', periodEnd: now },
      });
      await prisma.subscription.create({
        data: {
          userId: target.id,
          planId: plan.id,
          status: 'active',
          periodStart: now,
          periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
        },
      });
    }

    logger.info(
      { actor: actor.id, target: target.id, changes: parsed.data },
      'admin.user.patched',
    );

    const updated = await prisma.user.findUnique({
      where: { id: target.id },
      select: { id: true, email: true, role: true, isActive: true },
    });
    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
}

const patchModelSchema = z.object({
  enabled: z.boolean().optional(),
});

/** PATCH /api/v1/admin/models/:id — enable/disable a model (audited). */
export async function patchModel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = req.user!;
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid model id');
    const parsed = patchModelSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.enabled === undefined) throw new ValidationError('Nothing to update');

    const model = await prisma.aiModel.findUnique({ where: { id: id.data } });
    if (!model) throw new NotFoundError('Model not found');

    await prisma.aiModel.update({ where: { id: model.id }, data: { enabled: parsed.data.enabled } });
    logger.info({ actor: actor.id, model: model.modelKey, enabled: parsed.data.enabled }, 'admin.model.patched');

    res.json({ model: { id: model.id, modelKey: model.modelKey, enabled: parsed.data.enabled } });
  } catch (err) {
    next(err);
  }
}

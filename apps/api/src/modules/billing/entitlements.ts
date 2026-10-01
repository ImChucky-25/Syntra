import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { RateLimitError } from '../../lib/errors.js';

/**
 * Plan entitlements (spec §12.2): entitlement is computed server-side from the
 * user's plan and actual usage rows — never from frontend counters.
 */

export const planLimitsSchema = z.object({
  monthlyRequestLimit: z.number().int().min(0), // 0 = block (use with care)
  monthlyTokenLimit: z.number().int().min(0),
  allowedModels: z.union([z.literal('*'), z.array(z.string())]),
  maxFilesPerMonth: z.number().int().min(0),
  maxUploadBytes: z.number().int().min(0),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const FREE_PLAN_KEY = 'free';

export function parsePlanLimits(raw: unknown): PlanLimits {
  const result = planLimitsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Plan limits are invalid');
  }
  return result.data;
}

export interface EntitlementSnapshot {
  planKey: string;
  planName: string;
  periodStart: Date;
  periodEnd: Date;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  limits: PlanLimits;
}

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function endOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Resolve the user's current billing window and usage. Users without a
 * subscription fall back to the free plan for the current calendar month.
 */
export async function getEntitlementSnapshot(userId: string): Promise<EntitlementSnapshot> {
  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: 'active', periodStart: { lte: now }, periodEnd: { gt: now } },
    include: { plan: true },
    orderBy: { periodStart: 'desc' },
  });

  let planKey = FREE_PLAN_KEY;
  let planName = 'Free';
  let limitsJson: unknown = undefined;
  let periodStart = startOfMonthUtc(now);
  let periodEnd = endOfMonthUtc(now);

  if (sub) {
    planKey = sub.plan.key;
    planName = sub.plan.name;
    limitsJson = sub.plan.limits;
    periodStart = sub.periodStart;
    periodEnd = sub.periodEnd;
  } else {
    const freePlan = await prisma.plan.findUnique({ where: { key: FREE_PLAN_KEY } });
    if (freePlan) {
      planName = freePlan.name;
      limitsJson = freePlan.limits;
    }
  }

  const limits = parsePlanLimits(limitsJson ?? {});

  const usage = await prisma.usageRecord.aggregate({
    where: { userId, createdAt: { gte: periodStart, lt: periodEnd } },
    _count: { id: true },
    _sum: { inputTokens: true, outputTokens: true },
  });

  return {
    planKey,
    planName,
    periodStart,
    periodEnd,
    requests: usage._count.id,
    inputTokens: usage._sum.inputTokens ?? 0,
    outputTokens: usage._sum.outputTokens ?? 0,
    limits,
  };
}

export type EntitlementCheck =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeTo?: string };

/** Pre-flight check before a billable model call. Throws 429 when over limits. */
export function assertWithinLimits(snapshot: EntitlementSnapshot): EntitlementCheck {
  const { limits, requests, inputTokens, outputTokens } = snapshot;
  if (limits.monthlyRequestLimit > 0 && requests >= limits.monthlyRequestLimit) {
    return { allowed: false, reason: `Monthly request limit reached (${limits.monthlyRequestLimit})`, upgradeTo: 'pro' };
  }
  if (limits.monthlyTokenLimit > 0 && inputTokens + outputTokens >= limits.monthlyTokenLimit) {
    return { allowed: false, reason: `Monthly token limit reached (${limits.monthlyTokenLimit})`, upgradeTo: 'pro' };
  }
  return { allowed: true };
}

/** Convenience wrapper: throws RateLimitError (HTTP 429) when over limits. */
export async function enforceUsageLimits(userId: string): Promise<EntitlementSnapshot> {
  const snapshot = await getEntitlementSnapshot(userId);
  const check = assertWithinLimits(snapshot);
  if (!check.allowed) {
    throw new RateLimitError(check.reason);
  }
  return snapshot;
}

/** Whether the user's plan permits a specific model. */
export function isModelAllowed(limits: PlanLimits, modelKey: string): boolean {
  return limits.allowedModels === '*' || limits.allowedModels.includes(modelKey);
}

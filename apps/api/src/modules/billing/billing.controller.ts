import type { Request, Response, NextFunction } from 'express';
import { getEntitlementSnapshot } from './entitlements.js';

/** GET /api/v1/subscriptions — the caller's plan, limits, and period usage (spec §9.1). */
export async function getSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const snap = await getEntitlementSnapshot(user.id);
    res.json({
      subscription: {
        planKey: snap.planKey,
        planName: snap.planName,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
        limits: snap.limits,
        usage: {
          requests: snap.requests,
          inputTokens: snap.inputTokens,
          outputTokens: snap.outputTokens,
          totalTokens: snap.inputTokens + snap.outputTokens,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

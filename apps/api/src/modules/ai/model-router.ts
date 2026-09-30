import type { AiModel, AiProvider } from '@prisma/client';
import { ProviderError } from '../../lib/errors.js';

export type TaskKind = 'general' | 'code' | 'research' | 'document' | 'writing' | 'data';

export interface RoutingCandidate {
  model: AiModel & { provider: AiProvider };
  score: number;
  reason: string;
}

export interface RoutingPolicy {
  /** models explicitly preferred by the user, in order */
  preferredModelKey?: string | null;
  taskKind?: TaskKind;
  /** hard cap on estimated input size the model must accept */
  expectedInputTokens?: number;
}

/**
 * Deterministic auto-routing (spec §6.3): prefer user's explicit choice,
 * then rank enabled models by task capability fit, context headroom, and cost.
 */
export function rankModels(models: Array<AiModel & { provider: AiProvider }>, policy: RoutingPolicy): RoutingCandidate[] {
  if (models.length === 0) {
    throw new ProviderError('router', 'availability', 'No enabled models are available', 503);
  }

  const scored = models.map((model) => {
    let score = 0;
    const reasons: string[] = [];

    if (policy.preferredModelKey) {
      if (model.modelKey === policy.preferredModelKey) {
        score += 1000;
        reasons.push('user preference');
      } else {
        score -= 500;
        reasons.push('not preferred');
      }
    }

    const caps = model.capabilities ?? [];
    if (policy.taskKind === 'code' && caps.includes('code')) {
      score += 40;
      reasons.push('code capability');
    }
    if (policy.taskKind === 'research' && caps.includes('web')) {
      score += 30;
      reasons.push('web capability');
    }
    if (policy.taskKind === 'document' && caps.includes('long_context')) {
      score += 30;
      reasons.push('long context');
    }

    if (policy.expectedInputTokens && model.contextWindow > policy.expectedInputTokens * 2) {
      score += 10;
      reasons.push('context headroom');
    }

    // cheaper models win ties (cost is per 1k tokens)
    const raw = model.costPer1kInput as unknown as { toNumber?: () => number };
    const inCost = typeof raw?.toNumber === 'function' ? raw.toNumber() : Number(model.costPer1kInput);
    const rawOut = model.costPer1kOutput as unknown as { toNumber?: () => number };
    const outCost = typeof rawOut?.toNumber === 'function' ? rawOut.toNumber() : Number(model.costPer1kOutput);
    const cost = inCost + outCost;
    score -= cost * 10;
    reasons.push(`cost ${cost.toFixed(4)}/1k`);

    return { model, score, reason: reasons.join(', ') } satisfies RoutingCandidate;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

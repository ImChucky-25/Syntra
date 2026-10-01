import { describe, expect, it } from 'vitest';
import { parsePlanLimits, assertWithinLimits, isModelAllowed, type EntitlementSnapshot } from './entitlements.js';

function snap(partial: Partial<EntitlementSnapshot>): EntitlementSnapshot {
  return {
    planKey: 'free',
    planName: 'Free',
    periodStart: new Date('2026-10-01T00:00:00Z'),
    periodEnd: new Date('2026-11-01T00:00:00Z'),
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    limits: {
      monthlyRequestLimit: 100,
      monthlyTokenLimit: 200_000,
      allowedModels: ['gpt-4o-mini', 'claude-3-5-haiku-20241022'],
      maxFilesPerMonth: 5,
      maxUploadBytes: 10_000_000,
    },
    ...partial,
  };
}

describe('parsePlanLimits', () => {
  it('accepts a valid limits object', () => {
    const limits = parsePlanLimits({
      monthlyRequestLimit: 10,
      monthlyTokenLimit: 1_000,
      allowedModels: '*',
      maxFilesPerMonth: 2,
      maxUploadBytes: 100,
    });
    expect(limits.allowedModels).toBe('*');
  });

  it('rejects invalid limits', () => {
    expect(() => parsePlanLimits({})).toThrowError(/invalid/i);
    expect(() => parsePlanLimits({ monthlyRequestLimit: -5 })).toThrowError(/invalid/i);
  });
});

describe('assertWithinLimits', () => {
  it('allows usage under all limits', () => {
    expect(assertWithinLimits(snap({ requests: 99, inputTokens: 1000 }))).toEqual({ allowed: true });
  });

  it('blocks at the request limit and suggests an upgrade', () => {
    const check = assertWithinLimits(snap({ requests: 100 }));
    expect(check).toEqual({ allowed: false, reason: expect.stringMatching(/request limit/), upgradeTo: 'pro' });
  });

  it('blocks when combined tokens reach the cap', () => {
    const check = assertWithinLimits(snap({ inputTokens: 150_000, outputTokens: 50_000 }));
    expect(check.allowed).toBe(false);
    expect(check.allowed === false && check.reason).toMatch(/token limit/);
  });
});

describe('isModelAllowed', () => {
  it('permits listed models on the free plan', () => {
    expect(isModelAllowed(snap({}).limits, 'gpt-4o-mini')).toBe(true);
  });

  it('refuses unlisted models on the free plan', () => {
    expect(isModelAllowed(snap({}).limits, 'gpt-4o')).toBe(false);
  });

  it('allows everything under the wildcard', () => {
    expect(isModelAllowed(parsePlanLimits({ monthlyRequestLimit: 1, monthlyTokenLimit: 1, allowedModels: '*', maxFilesPerMonth: 1, maxUploadBytes: 1 }), 'any-model')).toBe(true);
  });
});

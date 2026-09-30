import { describe, it, expect } from 'vitest';

// Mirror of the cost formula in usage-tracker.recordUsage.
// Kept as a pure function test because DB integration is covered by E2E.
function computeCost(
  inputTokens: number,
  outputTokens: number,
  costPer1kInput: number,
  costPer1kOutput: number,
): number {
  const costIn = (inputTokens / 1000) * costPer1kInput;
  const costOut = (outputTokens / 1000) * costPer1kOutput;
  return costIn + costOut;
}

describe('computeCost', () => {
  it('prices input and output separately', () => {
    // 1000 in @ 0.00015 + 500 out @ 0.0006
    const cost = computeCost(1000, 500, 0.00015, 0.0006);
    expect(cost).toBeCloseTo(0.00015 + 0.0003, 10);
  });

  it('is zero when no tokens are used', () => {
    expect(computeCost(0, 0, 0.001, 0.002)).toBe(0);
  });
});

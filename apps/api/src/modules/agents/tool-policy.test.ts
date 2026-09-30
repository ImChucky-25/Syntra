import { describe, expect, it } from 'vitest';
import { parseToolPolicy, checkToolPermission, ToolCallBudget } from './tool-policy.js';
import type { ToolDefinition } from './tools/tool.types.js';

function makeTool(name: string, risk: 'safe' | 'sensitive' = 'safe'): ToolDefinition {
  return {
    name,
    description: `${name} test tool`,
    risk,
    parameters: { type: 'object', properties: {} },
    async execute() {
      return { ok: true };
    },
  };
}

describe('parseToolPolicy', () => {
  it('applies defaults for missing fields', () => {
    const policy = parseToolPolicy({});
    expect(policy.allow).toEqual([]);
    expect(policy.maxToolCalls).toBe(6);
    expect(policy.timeoutMs).toBe(60_000);
  });

  it('rejects invalid policies', () => {
    expect(() => parseToolPolicy({ maxToolCalls: -1 })).toThrowError(/invalid/i);
    expect(() => parseToolPolicy('nope')).toThrowError(/invalid/i);
  });
});

describe('checkToolPermission', () => {
  const policy = parseToolPolicy({ allow: ['calc', 'risky'], requireApproval: ['risky'] });

  it('allows tools on the allowlist without approval when safe', () => {
    expect(checkToolPermission(policy, makeTool('calc'))).toEqual({ allowed: true, requiresApproval: false });
  });

  it('requires approval for tools listed in requireApproval', () => {
    expect(checkToolPermission(policy, makeTool('risky'))).toEqual({ allowed: true, requiresApproval: true });
  });

  it('always requires approval for sensitive tools, even if policy omits them', () => {
    const p = parseToolPolicy({ allow: ['danger'] });
    expect(checkToolPermission(p, makeTool('danger', 'sensitive'))).toEqual({ allowed: true, requiresApproval: true });
  });

  it('refuses tools outside the allowlist regardless of model output', () => {
    expect(checkToolPermission(policy, makeTool('other'))).toMatchObject({ allowed: false });
  });
});

describe('ToolCallBudget', () => {
  it('consumes calls until exhausted', () => {
    const budget = new ToolCallBudget(2);
    budget.tryConsume('a');
    budget.tryConsume('b');
    expect(budget.remainingCalls).toBe(0);
    expect(() => budget.tryConsume('c')).toThrowError(/budget exhausted/);
  });
});

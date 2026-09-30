import { describe, it, expect } from 'vitest';
import { rankModels } from './model-router.js';
import type { AiModel, AiProvider } from '@prisma/client';

class FakeDecimal {
  constructor(private readonly n: number) {}
  toNumber(): number {
    return this.n;
  }
}

function fakeModel(overrides: Partial<AiModel>): AiModel {
  return {
    id: 'm1',
    providerId: 'p1',
    modelKey: 'test-model',
    displayName: 'Test Model',
    capabilities: ['chat'],
    contextWindow: 8192,
    maxOutputTokens: 4096,
    costPer1kInput: new FakeDecimal(0.001) as unknown as AiModel['costPer1kInput'],
    costPer1kOutput: new FakeDecimal(0.002) as unknown as AiModel['costPer1kOutput'],
    enabled: true,
    version: 1,
    createdAt: new Date(),
    ...overrides,
  } as AiModel;
}

const provider = { id: 'p1', name: 'TestProvider', adapterKey: 'openai', status: 'active', configRef: null, enabled: true, createdAt: new Date() } as unknown as AiProvider;

describe('rankModels', () => {
  it('prefers the user-selected model', () => {
    const a = fakeModel({ id: 'a', modelKey: 'cheap' });
    const b = fakeModel({ id: 'b', modelKey: 'preferred' });
    const ranked = rankModels([a, b].map((m) => ({ ...m, provider })), { preferredModelKey: 'preferred' });
    expect(ranked[0]?.model.modelKey).toBe('preferred');
  });

  it('rewards code capability for code tasks', () => {
    const plain = fakeModel({ id: 'plain', modelKey: 'plain', capabilities: ['chat'] });
    const coder = fakeModel({ id: 'coder', modelKey: 'coder', capabilities: ['chat', 'code'] });
    const ranked = rankModels([plain, coder].map((m) => ({ ...m, provider })), { taskKind: 'code' });
    expect(ranked[0]?.model.modelKey).toBe('coder');
  });

  it('breaks ties by lower cost', () => {
    const dec = (n: number) => new FakeDecimal(n) as unknown as AiModel['costPer1kInput'];
    const cheap = fakeModel({ id: 'cheap', modelKey: 'cheap', costPer1kInput: dec(0.0001), costPer1kOutput: dec(0.0001) });
    const dear = fakeModel({ id: 'dear', modelKey: 'dear', costPer1kInput: dec(0.01), costPer1kOutput: dec(0.02) });
    const ranked = rankModels([dear, cheap].map((m) => ({ ...m, provider })), {});
    expect(ranked[0]?.model.modelKey).toBe('cheap');
  });

  it('throws a provider error when no models exist', () => {
    expect(() => rankModels([], {})).toThrow(/No enabled models/);
  });
});

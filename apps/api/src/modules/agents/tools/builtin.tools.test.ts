import { describe, expect, it } from 'vitest';
import { builtinTools } from './builtin.tools.js';
import { getTool } from './tool.registry.js';

const noopCtx = { userId: 'u', runId: 'r', isCancelled: () => false };

describe('tool registry', () => {
  it('exposes all built-in tools', () => {
    for (const tool of builtinTools) {
      expect(getTool(tool.name)).toBeDefined();
    }
  });
});

describe('calculator', () => {
  it('evaluates arithmetic', async () => {
    const res = await getTool('calculator')!.execute({ expression: '(2+3)*7' }, noopCtx);
    expect(res).toEqual({ ok: true, data: { expression: '(2+3)*7', value: 35 } });
  });

  it('rejects identifiers and unsafe characters', async () => {
    const res = await getTool('calculator')!.execute({ expression: 'process.exit(1)' }, noopCtx);
    expect(res.ok).toBe(false);
  });

  it('rejects non-arithmetic junk that passes the charset', async () => {
    const res = await getTool('calculator')!.execute({ expression: '1..2.3' }, noopCtx);
    expect(res.ok).toBe(false);
  });
});

describe('datetime', () => {
  it('returns ISO time components', async () => {
    const res = await getTool('datetime')!.execute({}, noopCtx);
    expect(res.ok).toBe(true);
    const data = res.data as { iso: string; utcDate: string };
    expect(data.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.utcDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('text_stats', () => {
  it('counts characters, words, lines', async () => {
    const res = await getTool('text_stats')!.execute({ text: 'one two\nthree' }, noopCtx);
    expect(res.data).toEqual({ characters: 13, words: 3, lines: 2 });
  });
});

describe('json_format', () => {
  it('validates and formats JSON', async () => {
    const res = await getTool('json_format')!.execute({ json: '{"a":1}' }, noopCtx);
    expect(res.data).toEqual({ valid: true, formatted: '{\n  "a": 1\n}' });
  });

  it('reports invalid JSON without throwing', async () => {
    const res = await getTool('json_format')!.execute({ json: '{oops' }, noopCtx);
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ valid: false });
  });
});

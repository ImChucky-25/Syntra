import { describe, it, expect } from 'vitest';
import { buildModelMessages, estimateTokens } from './context-manager.js';

describe('estimateTokens', () => {
  it('estimates tokens from characters', () => {
    expect(estimateTokens('x'.repeat(400), 4)).toBe(100);
    expect(estimateTokens('', 4)).toBe(0);
  });

  it('handles zero charsPerToken safely', () => {
    expect(estimateTokens('abc', 0)).toBe(3);
  });
});

describe('buildModelMessages', () => {
  const mk = (role: 'user' | 'assistant', words: number) => ({
    role,
    content: 'w '.repeat(words).trim(),
  });

  it('keeps everything when history fits the budget', () => {
    const history = [mk('user', 10), mk('assistant', 10), mk('user', 10)];
    const result = buildModelMessages({ history, charsPerToken: 4, maxInputTokens: 1000 });
    expect(result.messages).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it('keeps at least the newest message when budget is tiny', () => {
    const history = [mk('user', 100), mk('assistant', 100), mk('user', 100)];
    const result = buildModelMessages({ history, charsPerToken: 4, maxInputTokens: 60 });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.messages[result.messages.length - 1]?.role).toBe('user');
    expect(result.truncated).toBe(true);
  });

  it('drops oldest messages first', () => {
    const history = [mk('user', 50), mk('assistant', 50), mk('user', 5), mk('assistant', 5)];
    const result = buildModelMessages({ history, charsPerToken: 1, maxInputTokens: 30 });
    // newest two small messages fit; the two 50-word ones cannot
    expect(result.messages.map((m) => m.content)).toEqual(['w '.repeat(5).trim(), 'w '.repeat(5).trim()]);
  });

  it('includes the system prompt when provided', () => {
    const result = buildModelMessages({
      history: [mk('user', 5)],
      systemPrompt: 'You are Syntra.',
      charsPerToken: 4,
      maxInputTokens: 1000,
    });
    expect(result.messages[0]?.role).toBe('system');
  });
});

import { describe, expect, it } from 'vitest';
import { AnthropicAdapter, normalizeAnthropicError } from './anthropic.adapter.js';
import { ProviderError } from '../../../lib/errors.js';
import { getAdapterForProvider } from '../adapter-registry.js';

function errWith(status: number, extra: Record<string, unknown> = {}): unknown {
  return { status, message: `http ${status}`, ...extra };
}

describe('normalizeAnthropicError', () => {
  it('maps 401 to an auth error', () => {
    const e = normalizeAnthropicError(errWith(401));
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.kind).toBe('auth');
    expect(e.statusCode).toBe(502);
    expect(e.code).toBe('provider_auth');
  });

  it('maps 429 to rate_limit with status 429', () => {
    const e = normalizeAnthropicError(errWith(429));
    expect(e.kind).toBe('rate_limit');
    expect(e.statusCode).toBe(429);
  });

  it('maps 400 to invalid_request', () => {
    const e = normalizeAnthropicError(errWith(400));
    expect(e.kind).toBe('invalid_request');
    expect(e.statusCode).toBe(502);
  });

  it('maps 413 to invalid_request with context message', () => {
    const e = normalizeAnthropicError(errWith(413));
    expect(e.kind).toBe('invalid_request');
    expect(e.message).toMatch(/context limit/i);
  });

  it('maps 529 to availability', () => {
    const e = normalizeAnthropicError(errWith(529));
    expect(e.kind).toBe('availability');
  });

  it('maps timeout messages to timeout with status 504', () => {
    const e = normalizeAnthropicError({ message: 'Request timeout after 120s' });
    expect(e.kind).toBe('timeout');
    expect(e.statusCode).toBe(504);
  });

  it('maps ETIMEDOUT codes to timeout', () => {
    const e = normalizeAnthropicError({ code: 'ETIMEDOUT' });
    expect(e.kind).toBe('timeout');
  });

  it('falls back to unknown', () => {
    const e = normalizeAnthropicError(new Error('boom'));
    expect(e.kind).toBe('unknown');
    expect(e.statusCode).toBe(502);
  });
});

describe('AnthropicAdapter', () => {
  it('rejects construction without a configured key', () => {
    expect(() => new AnthropicAdapter('')).toThrow(ProviderError);
  });

  it('constructs with an explicit key and reports its provider', () => {
    const adapter = new AnthropicAdapter('sk-test');
    expect(adapter.providerKey).toBe('anthropic');
  });

  it('maps thrown SDK errors through the stream as a normalized error event', async () => {
    const adapter = new AnthropicAdapter('sk-test');
    const events: Array<{ type: string }> = [];
    // No network call happens because messages.create fails synchronously on a bad model param —
    // instead exercise the catch path via a stubbed client.
    (adapter as unknown as { client: { messages: { create: () => Promise<never> } } }).client = {
      messages: { create: () => Promise.reject(Object.assign(new Error('boom'), { status: 429 })) },
    };
    for await (const ev of adapter.stream({ messages: [{ role: 'user', content: 'hi' }], model: 'claude-3-5-haiku-20241022' })) {
      events.push(ev as { type: string });
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
  });
});

describe('adapter registry', () => {
  it('returns the Anthropic adapter for the anthropic key', { skip: !process.env.ANTHROPIC_API_KEY }, () => {
    const adapter = getAdapterForProvider('anthropic');
    expect(adapter).toBeInstanceOf(AnthropicAdapter);
  });

  it('maps the anthropic adapterKey to a registered adapter without a key', () => {
    // Without a configured key, construction still must fail as a normalized auth error —
    // proving the registry resolves the adapterKey to the Anthropic adapter.
    try {
      getAdapterForProvider('anthropic');
      expect.unreachable('expected construction to fail without ANTHROPIC_API_KEY');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).provider).toBe('anthropic');
    }
  });

  it('throws a normalized error for unknown providers', () => {
    expect(() => getAdapterForProvider('nope')).toThrowError(ProviderError);
  });
});

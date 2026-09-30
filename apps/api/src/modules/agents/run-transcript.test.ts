import { describe, expect, it } from 'vitest';
import { parseRunTranscript, toolContractMessage, runTranscriptSchema } from './run-transcript.js';

const valid = {
  messages: [
    { role: 'system', content: 'instructions' },
    { role: 'user', content: 'hi' },
  ],
  partialOutput: 'partial answer',
  remainingToolCalls: 3,
  step: 2,
  inputTokens: 100,
  outputTokens: 50,
  modelKey: 'gpt-4o-mini',
  maxOutputTokens: 2048,
};

describe('runTranscriptSchema', () => {
  it('accepts a well-formed snapshot', () => {
    expect(() => parseRunTranscript(valid)).not.toThrow();
  });

  it('rejects invalid role values', () => {
    expect(() => parseRunTranscript({ ...valid, messages: [{ role: 'tool', content: 'x' }] })).toThrowError(/invalid/i);
  });

  it('rejects negative token counts', () => {
    expect(() => parseRunTranscript({ ...valid, inputTokens: -1 })).toThrowError(/invalid/i);
  });

  it('rejects out-of-range steps', () => {
    expect(() => parseRunTranscript({ ...valid, step: 11 })).toThrowError(/invalid/i);
  });

  it('rejects non-object input', () => {
    expect(() => parseRunTranscript('nope')).toThrowError(/invalid/i);
  });
});

describe('toolContractMessage', () => {
  it('lists allowed tools', () => {
    const msg = toolContractMessage(['calculator', 'uuid']);
    expect(msg.role).toBe('system');
    expect(msg.content).toContain('calculator');
    expect(msg.content).toContain('uuid');
  });

  it('handles an empty allowlist', () => {
    expect(toolContractMessage([]).content).toContain('(none)');
  });
});

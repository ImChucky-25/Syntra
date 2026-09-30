import { describe, expect, it } from 'vitest';
import { parseToolCalls } from './tool-parser.js';

describe('parseToolCalls', () => {
  it('returns plain text untouched when there are no tool blocks', () => {
    const out = parseToolCalls('Just a normal answer.');
    expect(out.text).toBe('Just a normal answer.');
    expect(out.toolCalls).toHaveLength(0);
  });

  it('extracts a tool call and strips it from the text', () => {
    const raw = 'Let me compute.\n```agent_tool\n{"tool": "calculator", "arguments": {"expression": "2+2"}}\n```agent_tool\n';
    const out = parseToolCalls(raw);
    expect(out.text).toBe('Let me compute.');
    expect(out.toolCalls).toEqual([{ tool: 'calculator', arguments: { expression: '2+2' } }]);
  });

  it('defaults missing arguments to an empty object', () => {
    const raw = '```agent_tool\n{"tool": "datetime"}\n```agent_tool';
    const out = parseToolCalls(raw);
    expect(out.toolCalls).toEqual([{ tool: 'datetime', arguments: {} }]);
  });

  it('rejects malformed JSON with a validation error', () => {
    expect(() => parseToolCalls('```agent_tool\n{not json}\n```agent_tool')).toThrowError(/Malformed/);
  });

  it('rejects invalid tool names', () => {
    expect(() => parseToolCalls('```agent_tool\n{"tool": "Bad Name!", "arguments": {}}\n```agent_tool')).toThrowError(/Invalid tool name/);
  });

  it('rejects non-object arguments', () => {
    expect(() => parseToolCalls('```agent_tool\n{"tool": "uuid", "arguments": [1]}\n```agent_tool')).toThrowError(/arguments must be an object/);
  });

  it('enforces a per-message tool call cap', () => {
    const block = '```agent_tool\n{"tool": "uuid"}\n```agent_tool\n';
    expect(() => parseToolCalls(block.repeat(6))).toThrowError(/Too many tool requests/);
  });
});

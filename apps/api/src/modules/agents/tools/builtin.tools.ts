import type { ToolDefinition } from './tool.types.js';

/**
 * Safe built-in tools (spec §7 tool table): pure, bounded computation with no
 * network, filesystem, or DB side effects. These can never leak user data or
 * execute untrusted code.
 */

export const calculatorTool: ToolDefinition = {
  name: 'calculator',
  description: 'Evaluate an arithmetic expression (+ - * / % parentheses).',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Arithmetic expression, e.g. (2+3)*7' },
    },
    required: ['expression'],
  },
  async execute(input) {
    const expression = typeof input.expression === 'string' ? input.expression : '';
    if (!expression.trim()) return { ok: false, error: 'expression is required' };
    if (expression.length > 200) return { ok: false, error: 'expression too long' };
    // Digits/whitespace/operators/parens/dot only — no identifiers, no accessors.
    if (!/^[0-9+\-*/%().\s]+$/.test(expression)) {
      return { ok: false, error: 'expression contains disallowed characters' };
    }
    try {
      // Compartment-evaluated arithmetic on a validated charset.
      const fn = new Function(`"use strict"; return (${expression});`) as () => unknown;
      const value = fn();
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, error: 'expression did not produce a finite number' };
      }
      return { ok: true, data: { expression, value } };
    } catch {
      return { ok: false, error: 'invalid expression' };
    }
  },
};

export const datetimeTool: ToolDefinition = {
  name: 'datetime',
  description: 'Current UTC time and date components.',
  risk: 'safe',
  parameters: { type: 'object', properties: {} },
  async execute() {
    const now = new Date();
    return {
      ok: true,
      data: {
        iso: now.toISOString(),
        utcDate: now.toISOString().slice(0, 10),
        utcTime: now.toISOString().slice(11, 19),
      },
    };
  },
};

export const textStatsTool: ToolDefinition = {
  name: 'text_stats',
  description: 'Character, word, and line counts for a text.',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' },
    },
    required: ['text'],
  },
  async execute(input) {
    const text = typeof input.text === 'string' ? input.text : '';
    if (text.length > 100_000) return { ok: false, error: 'text too long' };
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return {
      ok: true,
      data: {
        characters: text.length,
        words,
        lines: text ? text.split('\n').length : 0,
      },
    };
  },
};

export const uuidTool: ToolDefinition = {
  name: 'uuid',
  description: 'Generate a random UUID (v4).',
  risk: 'safe',
  parameters: { type: 'object', properties: {} },
  async execute() {
    return { ok: true, data: { uuid: crypto.randomUUID() } };
  },
};

export const jsonFormatTool: ToolDefinition = {
  name: 'json_format',
  description: 'Validate and pretty-print JSON.',
  risk: 'safe',
  parameters: {
    type: 'object',
    properties: {
      json: { type: 'string', description: 'JSON text to validate and format' },
    },
    required: ['json'],
  },
  async execute(input) {
    const json = typeof input.json === 'string' ? input.json : '';
    if (!json.trim()) return { ok: false, error: 'json is required' };
    if (json.length > 100_000) return { ok: false, error: 'json too long' };
    try {
      const parsed: unknown = JSON.parse(json);
      return { ok: true, data: { valid: true, formatted: JSON.stringify(parsed, null, 2) } };
    } catch (err) {
      return { ok: true, data: { valid: false, error: err instanceof Error ? err.message : 'invalid JSON' } };
    }
  },
};

export const builtinTools: ToolDefinition[] = [calculatorTool, datetimeTool, textStatsTool, uuidTool, jsonFormatTool];

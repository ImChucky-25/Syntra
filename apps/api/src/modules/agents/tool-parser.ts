import { ProviderError } from '../../lib/errors.js';

/**
 * Provider-neutral tool-call protocol (spec §6.1: adapters normalize providers).
 * A model requests a tool by emitting a fenced block:
 *
 * ```agent_tool
 * {"tool": "calculator", "arguments": {"expression": "2+2"}}
 * ```
 *
 * The closing fence may be plain ``` or labelled (```agent_tool) — both accepted.
 * Anything outside the block is streamed to the user as normal text.
 */

export interface ParsedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ParseOutcome {
  text: string;
  toolCalls: ParsedToolCall[];
}

const MAX_BLOCK = 8_000; // chars per tool block
const MAX_TOOL_CALLS_PER_MESSAGE = 5;

export function parseToolCalls(raw: string): ParseOutcome {
  const toolCalls: ParsedToolCall[] = [];
  const textParts: string[] = [];

  const pattern = /```agent_tool\s*([\s\S]*?)\s*```(?:agent_tool)?/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    textParts.push(raw.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    if (toolCalls.length >= MAX_TOOL_CALLS_PER_MESSAGE) {
      throw new ProviderError('agent', 'invalid_request', 'Too many tool requests in one message', 400);
    }
    const body = match[1] ?? '';
    if (body.length > MAX_BLOCK) {
      throw new ProviderError('agent', 'invalid_request', 'Tool call block too large', 400);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ProviderError('agent', 'invalid_request', 'Malformed tool call JSON', 400);
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new ProviderError('agent', 'invalid_request', 'Tool call must be a JSON object', 400);
    }
    const obj = parsed as Record<string, unknown>;
    const tool = obj.tool;
    if (typeof tool !== 'string' || !/^[a-z0-9_]{1,64}$/.test(tool)) {
      throw new ProviderError('agent', 'invalid_request', 'Invalid tool name in tool call', 400);
    }
    let args: unknown = obj.arguments;
    if (args === undefined) args = {};
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      throw new ProviderError('agent', 'invalid_request', 'Tool call arguments must be an object', 400);
    }
    toolCalls.push({ tool, arguments: args as Record<string, unknown> });
  }

  textParts.push(raw.slice(cursor));
  return { text: textParts.join('').trim(), toolCalls };
}

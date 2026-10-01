import type { ChatMessage } from '@syntra/shared-types';

export interface ContextBudgetResult {
  messages: ChatMessage[];
  keptMessages: number;
  droppedMessages: number;
  estimatedInputTokens: number;
  truncated: boolean;
}

/** Rough char/4 token estimate — fine for budgeting; provider reports exact usage later. */
export function estimateTokens(text: string, charsPerToken: number): number {
  return Math.ceil(text.length / Math.max(1, charsPerToken));
}

/**
 * Build the model input from conversation history + the new user message,
 * keeping the newest messages that fit the token budget. Always keeps the
 * system prompt and the newest user message (spec §3.2 "Prepare context").
 */
export function buildModelMessages(opts: {
  history: ChatMessage[];
  systemPrompt?: string;
  charsPerToken: number;
  maxInputTokens: number;
}): ContextBudgetResult {
  const { charsPerToken, maxInputTokens } = opts;
  const messages: ChatMessage[] = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });

  let budget = maxInputTokens - estimateTokens(messages.map((m) => m.content).join(''), charsPerToken);
  const kept: ChatMessage[] = [];

  for (let i = opts.history.length - 1; i >= 0; i--) {
    const msg = opts.history[i];
    if (!msg) continue;
    const cost = estimateTokens(msg.content, charsPerToken);
    if (kept.length > 0 && cost > budget) break; // once full, stop (but keep at least one message)
    kept.unshift(msg);
    budget -= cost;
    if (budget <= 0) break;
  }

  const all = [...messages, ...kept];
  const estimatedInputTokens = estimateTokens(all.map((m) => m.content).join(''), charsPerToken);
  const droppedMessages = opts.history.length - kept.length;

  return {
    messages: all,
    keptMessages: kept.length,
    droppedMessages,
    estimatedInputTokens,
    truncated: droppedMessages > 0,
  };
}

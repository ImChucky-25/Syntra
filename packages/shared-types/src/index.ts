/**
 * AI Zone shared DTOs — consumed by both apps/api and apps/web.
 * Kept as plain interfaces/types so both Node and browser bundles can use them.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Model descriptor returned by GET /api/v1/models */
export interface ModelDescriptor {
  id: string;
  modelKey: string;
  displayName: string;
  provider: string;
  capabilities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  /** USD per 1k input tokens (server-side pricing, spec §6.4) */
  costPer1kInput: number;
  /** USD per 1k output tokens */
  costPer1kOutput: number;
}

/** Usage summary returned by GET /api/v1/usage */
export interface UsageSummary {
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costAmount: number;
  };
  byModel: Array<{
    modelId: string;
    modelKey: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costAmount: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costAmount: number;
  }>;
}

/** SSE events emitted by POST /api/v1/chat/stream */
export type ChatStreamEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string; assistantMessageId: string; model: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costAmount: number }
  | { type: 'done'; conversationId: string; title?: string }
  | { type: 'error'; code: string; message: string };

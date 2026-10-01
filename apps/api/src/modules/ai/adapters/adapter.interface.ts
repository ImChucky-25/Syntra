import type { ChatMessage } from '@syntra/shared-types';

export interface GenerateInput {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateOutput {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done'; finishReason?: string }
  | { type: 'error'; code: string; message: string };

/** Provider-neutral adapter contract (spec §6.1). Implementations map to vendor SDKs. */
export interface AIModelAdapter {
  readonly providerKey: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
  /** Streaming variant; async iterable of normalized events. */
  stream(input: GenerateInput): AsyncIterable<StreamEvent>;
}

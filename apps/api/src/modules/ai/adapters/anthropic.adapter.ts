import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env.js';
import { ProviderError } from '../../../lib/errors.js';
import type { AIModelAdapter, GenerateInput, GenerateOutput, StreamEvent } from './adapter.interface.js';

export class AnthropicAdapter implements AIModelAdapter {
  readonly providerKey = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey ?? env.anthropicApiKey;
    if (!key) {
      throw new ProviderError('anthropic', 'auth', 'ANTHROPIC_API_KEY is not configured', 500);
    }
    this.client = new Anthropic({
      apiKey: key,
      baseURL: baseUrl ?? env.anthropicBaseUrl,
      maxRetries: 1,
      timeout: 120_000,
      // Unscoped (user-level) keys must target a workspace explicitly.
      ...(env.anthropicWorkspaceId ? { defaultHeaders: { 'anthropic-workspace-id': env.anthropicWorkspaceId } } : {}),
    });
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    try {
      const { system, messages } = splitSystem(input.messages);
      const res = await this.client.messages.create({
        model: input.model,
        system: system || undefined,
        messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens ?? 2048,
        stream: false,
      });
      const text = res.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
      return {
        text,
        inputTokens: res.usage?.input_tokens,
        outputTokens: res.usage?.output_tokens,
        finishReason: res.stop_reason ?? undefined,
      };
    } catch (err) {
      throw normalizeAnthropicError(err);
    }
  }

  async *stream(input: GenerateInput): AsyncIterable<StreamEvent> {
    try {
      const { system, messages } = splitSystem(input.messages);
      const res = await this.client.messages.create({
        model: input.model,
        system: system || undefined,
        messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens ?? 2048,
        stream: true,
      });
      for await (const ev of res) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          if (ev.delta.text) yield { type: 'delta', text: ev.delta.text };
        } else if (ev.type === 'message_start') {
          yield { type: 'usage', inputTokens: ev.message.usage?.input_tokens };
        } else if (ev.type === 'message_delta') {
          if (ev.usage?.output_tokens !== undefined) {
            yield { type: 'usage', outputTokens: ev.usage.output_tokens };
          }
          if (ev.delta.stop_reason) {
            yield { type: 'done', finishReason: ev.delta.stop_reason };
          }
        }
        // Note: stream-level failures throw from the iterator and are caught below.
      }
    } catch (err) {
      yield { type: 'error', code: 'provider_error', message: normalizeAnthropicError(err).message };
    }
  }
}

/** Anthropic takes the system prompt separately from the message list. */
function splitSystem(messages: GenerateInput['messages']): {
  system: string;
  messages: GenerateInput['messages'];
} {
  const systemParts: string[] = [];
  const rest: GenerateInput['messages'] = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else rest.push(m);
  }
  return { system: systemParts.join('\n\n'), messages: rest };
}

export function normalizeAnthropicError(err: unknown): ProviderError {
  const anyErr = err as { status?: number; message?: string; error?: { type?: string }; code?: string };
  const status = anyErr?.status;
  if (status === 401) return new ProviderError('anthropic', 'auth', 'Provider rejected credentials', 502);
  if (status === 429) return new ProviderError('anthropic', 'rate_limit', 'Provider rate limit reached', 429);
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderError('anthropic', 'invalid_request', anyErr?.message ?? 'Invalid request to provider', 502);
  }
  if (status === 413) {
    return new ProviderError('anthropic', 'invalid_request', 'Request exceeds provider context limit', 502);
  }
  if (status === 408 || anyErr?.error?.type === 'timeout_error') {
    return new ProviderError('anthropic', 'timeout', 'Provider request timed out', 504);
  }
  if (status === 529 || (status !== undefined && status >= 500)) {
    return new ProviderError('anthropic', 'availability', 'Provider unavailable', 502);
  }
  if (anyErr?.code === 'ETIMEDOUT' || anyErr?.message?.toLowerCase().includes('timeout')) {
    return new ProviderError('anthropic', 'timeout', 'Provider request timed out', 504);
  }
  return new ProviderError('anthropic', 'unknown', anyErr?.message ?? 'Unknown provider error', 502);
}

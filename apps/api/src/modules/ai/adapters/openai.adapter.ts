import OpenAI from 'openai';
import { env } from '../../../config/env.js';
import { ProviderError } from '../../../lib/errors.js';
import type { AIModelAdapter, GenerateInput, GenerateOutput, StreamEvent } from './adapter.interface.js';

export class OpenAIAdapter implements AIModelAdapter {
  readonly providerKey = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey ?? env.openaiApiKey;
    if (!key) {
      throw new ProviderError('openai', 'auth', 'OPENAI_API_KEY is not configured', 500);
    }
    this.client = new OpenAI({
      apiKey: key,
      baseURL: baseUrl ?? env.openaiBaseUrl,
      maxRetries: 1,
      timeout: 120_000,
    });
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    try {
      const res = await this.client.chat.completions.create({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens,
        stream: false,
      });
      const choice = res.choices[0];
      return {
        text: choice?.message?.content ?? '',
        inputTokens: res.usage?.prompt_tokens,
        outputTokens: res.usage?.completion_tokens,
        finishReason: choice?.finish_reason ?? undefined,
      };
    } catch (err) {
      throw normalizeOpenAiError(err);
    }
  }

  async *stream(input: GenerateInput): AsyncIterable<StreamEvent> {
    try {
      const res = await this.client.chat.completions.create({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens,
        stream: true,
        stream_options: { include_usage: true },
      });
      for await (const chunk of res) {
        if (chunk.usage) {
          yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield { type: 'delta', text: delta };
        if (chunk.choices[0]?.finish_reason) {
          yield { type: 'done', finishReason: chunk.choices[0].finish_reason };
        }
      }
    } catch (err) {
      yield { type: 'error', code: 'provider_error', message: normalizeOpenAiError(err).message };
    }
  }
}

export function normalizeOpenAiError(err: unknown): ProviderError {
  const anyErr = err as { status?: number; message?: string; code?: string };
  const status = anyErr?.status;
  if (status === 401) return new ProviderError('openai', 'auth', 'Provider rejected credentials', 502);
  if (status === 429) return new ProviderError('openai', 'rate_limit', 'Provider rate limit reached', 429);
  if (status === 404 || status === 400) {
    return new ProviderError('openai', 'invalid_request', anyErr?.message ?? 'Invalid request to provider', 502);
  }
  if (status !== undefined && status >= 500) {
    return new ProviderError('openai', 'availability', 'Provider unavailable', 502);
  }
  if (anyErr?.code === 'ETIMEDOUT' || anyErr?.message?.toLowerCase().includes('timeout')) {
    return new ProviderError('openai', 'timeout', 'Provider request timed out', 504);
  }
  return new ProviderError('openai', 'unknown', anyErr?.message ?? 'Unknown provider error', 502);
}
// END_OF_ADAPTER


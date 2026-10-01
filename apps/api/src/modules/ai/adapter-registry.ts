import { ProviderError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import type { AIModelAdapter } from './adapters/adapter.interface.js';
import { OpenAIAdapter } from './adapters/openai.adapter.js';
import { AnthropicAdapter } from './adapters/anthropic.adapter.js';

const registry = new Map<string, AIModelAdapter>();

function makeAdapter(adapterKey: string): AIModelAdapter {
  switch (adapterKey) {
    case 'openai':
      return new OpenAIAdapter();
    case 'anthropic':
      return new AnthropicAdapter();
    case 'deepseek':
      // DeepSeek exposes an OpenAI-compatible API — reuse the adapter with its own key/endpoint.
      return new OpenAIAdapter(env.deepseekApiKey, env.deepseekBaseUrl, 'deepseek');
    case 'gemini':
      // Google Gemini's OpenAI-compatible endpoint — same adapter, own key/base URL.
      return new OpenAIAdapter(env.geminiApiKey, env.geminiBaseUrl, 'gemini');
    default:
      throw new ProviderError(adapterKey, 'unknown', `No adapter implemented for provider "${adapterKey}"`, 500);
  }
}

/** Get (and memoize) the adapter for a provider's adapterKey. */
export function getAdapterForProvider(adapterKey: string): AIModelAdapter {
  let adapter = registry.get(adapterKey);
  if (!adapter) {
    adapter = makeAdapter(adapterKey);
    registry.set(adapterKey, adapter);
  }
  return adapter;
}

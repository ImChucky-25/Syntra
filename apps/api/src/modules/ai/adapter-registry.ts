import { ProviderError } from '../../lib/errors.js';
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

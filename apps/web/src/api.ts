import type { ModelDescriptor } from '@ai-zone/shared-types';

const BASE = '/api/v1';

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: { message?: string } }).error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export const api = {
  register: (data: { email: string; password: string; displayName: string }) =>
    request<{ user: UserDto; token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request<{ user: UserDto; token: string }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: UserDto }>('/auth/me'),

  listConversations: () =>
    request<{ conversations: Array<{ id: string; title: string; messageCount: number; updatedAt: string }> }>('/conversations'),

  createConversation: () => request<{ conversation: { id: string; title: string } }>('/conversations', { method: 'POST', body: '{}' }),

  getConversation: (id: string) =>
    request<{ conversation: { id: string; title: string }; messages: Array<{ id: string; role: string; content: string }> }>(
      `/conversations/${id}`,
    ),

  deleteConversation: (id: string) => request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),

  listModels: () => request<{ models: ModelDescriptor[] }>('/models'),

  getPreferences: () =>
    request<{ preferences: { defaultModelKey: string | null; theme: string } }>('/preferences'),

  updatePreferences: (data: { defaultModelKey: string | null }) =>
    request<{ preferences: { defaultModelKey: string | null; theme: string } }>('/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export interface ChatStreamHandlers {
  onMeta?: (e: { conversationId: string; model: string }) => void;
  onDelta?: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

/** POST to the SSE chat endpoint and dispatch parsed events to handlers. */
export async function streamChat(
  body: { conversationId: string; content: string; modelKey?: string },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: { message?: string } }).error?.message ?? `Chat failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'meta') handlers.onMeta?.(event);
        else if (event.type === 'delta') handlers.onDelta?.(event.text);
        else if (event.type === 'error') handlers.onError?.(event.message);
        else if (event.type === 'done') handlers.onDone?.();
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

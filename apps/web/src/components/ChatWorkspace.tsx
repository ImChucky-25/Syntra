import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamChat, type UserDto } from '../api';
import ModelHub from './ModelHub';
import Documents from './Documents';

type View = 'chat' | 'model-hub' | 'documents';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelKey?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

interface ModelOption {
  modelKey: string;
  displayName: string;
  provider: string;
}

export default function ChatWorkspace({ user, onSignOut }: { user: UserDto; onSignOut: () => void }) {
  const [view, setView] = useState<View>('chat');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelKey, setModelKey] = useState(''); // '' = auto
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await api.listConversations(search.trim() || undefined);
      setConversations(res.conversations);
    } catch {
      /* transient */
    }
  }, [search]);

  useEffect(() => {
    // Debounced history search (spec §4.1): fires on query change and on mount.
    const t = setTimeout(() => void refreshConversations(), 250);
    return () => clearTimeout(t);
  }, [refreshConversations]);

  useEffect(() => {
    api
      .listModels()
      .then((r) => setModels(r.models))
      .catch(() => setModels([]));
    api
      .getPreferences()
      .then((r) => setModelKey(r.preferences.defaultModelKey ?? ''))
      .catch(() => {
        /* prefs optional */
      });
  }, [refreshConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const openConversation = useCallback(async (id: string) => {
    setError(null);
    setSidebarOpen(false);
    try {
      const res = await api.getConversation(id);
      setActiveId(id);
      setMessages(
        res.messages
          .filter((m) => m.role !== 'SYSTEM')
          .map((m) => ({ id: m.id, role: m.role as Message['role'], content: m.content })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;
      setError(null);
      setStreaming(true);
      setInput('');

      let convId = activeId;
      const tempUserId = `tmp-u-${Date.now()}`;
      const tempAssistantId = `tmp-a-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: tempUserId, role: 'user', content },
        { id: tempAssistantId, role: 'assistant', content: '' },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (!convId) {
          const created = await api.createConversation();
          convId = created.conversation.id;
          setActiveId(convId);
        }
        await streamChat(
          { conversationId: convId, content, modelKey: modelKey || undefined },
          {
            onMeta: (e) => {
              if (e.model) {
                setMessages((prev) => prev.map((m) => (m.id === tempAssistantId ? { ...m, modelKey: e.model } : m)));
              }
            },
            onDelta: (t) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === tempAssistantId ? { ...m, content: m.content + t } : m)),
              );
            },
            onError: (msg) => setError(msg),
          },
          controller.signal,
        );
      } catch (err) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        if (!aborted) {
          setError(err instanceof Error ? err.message : 'Chat failed');
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        void refreshConversations();
      }
    },
    [activeId, streaming, modelKey, refreshConversations],
  );

  const newChat = useCallback(async () => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      try {
        await api.deleteConversation(id);
        if (activeId === id) {
          setActiveId(null);
          setMessages([]);
        }
        void refreshConversations();
      } catch {
        /* ignore */
      }
    },
    [activeId, refreshConversations],
  );

  const activeModelLabel = modelKey
    ? models.find((m) => m.modelKey === modelKey)?.displayName ?? modelKey
    : 'Auto';

  if (view === 'model-hub') {
    return (
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <ModelHub onBack={() => setView('chat')} />
      </div>
    );
  }

  if (view === 'documents') {
    return (
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <Documents onBack={() => setView('chat')} />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4">
          <h1 className="text-lg font-bold">AI Zone</h1>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
        <button
          onClick={() => void newChat()}
          className="mx-4 mb-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold hover:bg-indigo-500"
        >
          + New chat
        </button>
        <nav className="space-y-1 px-4 pb-2">
          <button
            onClick={() => {
              setView('model-hub');
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            <span aria-hidden="true">🧭</span> Model Hub
          </button>
          <button
            onClick={() => {
              setView('documents');
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            <span aria-hidden="true">📄</span> Documents
          </button>
        </nav>
        <div className="px-4 pb-2">
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                c.id === activeId ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <button className="flex-1 truncate text-left" onClick={() => void openConversation(c.id)}>
                {c.title}
              </button>
              <button
                className="ml-2 hidden text-slate-500 hover:text-red-400 group-hover:block"
                onClick={() => void removeConversation(c.id)}
                aria-label="Delete conversation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button onClick={onSignOut} className="border-t border-slate-800 p-4 text-left text-sm text-slate-400 hover:text-slate-200">
          Sign out
        </button>
      </aside>

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate text-sm text-slate-400">{activeId ? 'Conversation' : 'New conversation'}</div>
          </div>
          <select
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs"
            value={modelKey}
            onChange={(e) => setModelKey(e.target.value)}
          >
            <option value="">Auto (recommended)</option>
            {models.map((m) => (
              <option key={m.modelKey} value={m.modelKey}>
                {m.displayName} · {m.provider}
              </option>
            ))}
          </select>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="mt-24 text-center text-slate-500">
              <p className="text-3xl">✳</p>
              <p className="mt-2">Ask anything. Your conversation stays yours.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-2xl whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
                }`}
              >
                {m.content || '…'}
                {m.role === 'assistant' && m.modelKey && (
                  <div className="mt-1.5 text-[10px] text-slate-500">{m.modelKey}</div>
                )}
              </div>
            </div>
          ))}
          {error && (
            <div className="mx-auto max-w-2xl rounded-lg bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</div>
          )}
        </div>

        <form
          className="border-t border-slate-800 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              placeholder={`Message AI Zone… (${activeModelLabel})`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            {streaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="rounded-xl border border-slate-600 bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-600"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

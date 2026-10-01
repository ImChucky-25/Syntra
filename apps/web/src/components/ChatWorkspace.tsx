import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamChat, type UserDto } from '../api';
import ModelHub from './ModelHub';
import Documents from './Documents';
import Usage from './Usage';
import AdminConsole from './AdminConsole';
import Markdown from './Markdown';
import syntraLogo from '../../img/Syntra Logo.jpg';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  FileText,
  Gauge,
  History,
  LogOut,
  Menu,
  MessageSquarePlus,
  PenLine,
  Search,
  Shield,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';

type View = 'chat' | 'model-hub' | 'documents' | 'usage' | 'admin';

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
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Auto-scroll sticks only while the reader is near the bottom (§4.1 UX):
  // scrolling up to read pauses it; sending or opening a chat re-engages it.
  const stickToBottomRef = useRef(true);

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
    if (stickToBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setError(null);
    setSidebarOpen(false);
    stickToBottomRef.current = true;
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
      stickToBottomRef.current = true;

      let convId = activeId;
      const tempUserId = `tmp-u-${Date.now()}`;
      const tempAssistantId = `tmp-a-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        { id: tempUserId, role: 'user', content },
        { id: tempAssistantId, role: 'assistant', content: '' },
      ]);
      setStreamingMessageId(tempAssistantId);

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
        setStreamingMessageId(null);
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

  const renderComposer = () => (
    <form
      className="mx-auto w-full max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault();
        void send(input);
      }}
    >
      <div className="rounded-2xl border border-slate-700 bg-[#111113] p-3 shadow-[0_12px_48px_rgba(0,0,0,0.18)] transition-colors focus-within:border-slate-500">
        <input
          ref={inputRef}
          className="h-12 w-full bg-transparent px-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          placeholder="Ask Syntra anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3 px-1 pt-1">
          <label className="relative flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200">
            <Bot size={15} aria-hidden="true" />
            <select
              className="max-w-44 cursor-pointer appearance-none bg-transparent pr-4 outline-none"
              aria-label="Select model"
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
            <ChevronDown className="pointer-events-none absolute right-1" size={13} aria-hidden="true" />
          </label>
          {streaming ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-950 transition-colors hover:bg-white"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square size={14} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              disabled={!input.trim()}
              aria-label="Send message"
              title="Send message"
            >
              <ArrowUp size={17} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-600">Syntra can make mistakes. Verify important information.</p>
    </form>
  );

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

  if (view === 'usage') {
    return (
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <Usage onBack={() => setView('chat')} />
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <AdminConsole onBack={() => setView('chat')} />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 transform flex-col border-r border-slate-800 bg-[#080809] transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <div className="grid h-8 w-8 place-items-center rounded-lg border border-slate-700 bg-slate-900 text-slate-100">
            <img src={syntraLogo} alt="" className="h-full w-full rounded-lg object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-wide text-slate-100">Syntra</div>
            <div className="truncate text-[11px] text-slate-500">AI workspace</div>
          </div>
          <button
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="px-3 pb-4">
          <button
            onClick={() => void newChat()}
            className="flex w-full items-center gap-2.5 rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2.5 text-left text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            <MessageSquarePlus size={16} className="text-slate-400" aria-hidden="true" />
            New chat
          </button>
        </div>

        <div className="px-3 pb-4">
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#101012] px-3 focus-within:border-slate-600">
            <Search size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
            <input
              className="h-9 min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
              placeholder="Search chats"
              aria-label="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-500 hover:text-slate-200"
                aria-label="Clear search"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
        </div>

        <nav className="space-y-1 px-3 pb-5" aria-label="Workspace">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Workspace</p>
          <button
            onClick={() => {
              setView('model-hub');
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-100"
          >
            <Bot size={16} aria-hidden="true" />
            Model hub
          </button>
          <button
            onClick={() => {
              setView('documents');
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-100"
          >
            <FileText size={16} aria-hidden="true" />
            Documents
          </button>
          <button
            onClick={() => {
              setView('usage');
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-100"
          >
            <Gauge size={16} aria-hidden="true" />
            Usage &amp; plan
          </button>
          {user.role === 'ADMIN' && (
            <button
              onClick={() => {
                setView('admin');
                setSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-100"
            >
              <Shield size={16} aria-hidden="true" />
              Admin console
            </button>
          )}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-800/80 px-2 pt-4">
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <History size={14} aria-hidden="true" />
              Recent chats
            </div>
            <span className="text-[10px] text-slate-600">{conversations.length || ''}</span>
          </div>
          <div className="flex-1 overflow-y-auto pb-3">
            {conversations.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-600">Your conversations will appear here.</p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] ${
                    c.id === activeId ? 'bg-slate-900 text-slate-100' : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-200'
                  }`}
                >
                  <button className="min-w-0 flex-1 truncate py-0.5 text-left" onClick={() => void openConversation(c.id)}>
                    {c.title}
                  </button>
                  <button
                    className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => void removeConversation(c.id)}
                    aria-label={`Delete ${c.title}`}
                    title="Delete conversation"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-800/80 p-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
            {user.email.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-300">{user.email}</div>
            <div className="text-[10px] text-slate-600">{user.role === 'ADMIN' ? 'Administrator' : 'Personal workspace'}</div>
          </div>
          <button
            onClick={onSignOut}
            className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="rounded-md p-2 text-slate-400 hover:bg-slate-900 hover:text-slate-100 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <span className="truncate text-xs text-slate-500">
              {activeId ? conversations.find((c) => c.id === activeId)?.title ?? 'Conversation' : 'New chat'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="hidden sm:inline">Current model</span>
            <span className="max-w-36 truncate rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-slate-300">
              {activeModelLabel}
            </span>
          </div>
        </header>

        {messages.length === 0 ? (
          <div ref={scrollRef} onScroll={handleScroll} className="flex flex-1 flex-col overflow-y-auto px-4">
            <section className="m-auto flex w-full max-w-4xl flex-col items-center py-10 text-center">
              <div className="mb-7 max-w-2xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-400">
                  <Sparkles size={13} aria-hidden="true" />
                  Your AI workspace
                </div>
                <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-5xl">
                  What do you want to work on?
                </h1>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                  Chat with leading models, explore ideas, and work with your documents in one place.
                </p>
              </div>

              {renderComposer()}

              <div className="mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
                <button
                  onClick={() => {
                    setInput('Help me brainstorm ideas for ');
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3.5 py-2 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Brainstorm ideas
                </button>
                <button
                  onClick={() => {
                    setInput('Explain this topic in simple terms: ');
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3.5 py-2 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200"
                >
                  <Bot size={14} aria-hidden="true" />
                  Explain a topic
                </button>
                <button
                  onClick={() => {
                    setInput('Help me draft a message about ');
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3.5 py-2 text-xs text-slate-400 transition-colors hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200"
                >
                  <PenLine size={14} aria-hidden="true" />
                  Draft a message
                </button>
              </div>
              {error && <p className="mt-5 text-sm text-red-300">{error}</p>}
            </section>
          </div>
        ) : (
          <>
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-7 overflow-y-auto px-4 py-8 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-7">
                {messages.map((m) => (
                  <div key={m.id} className={`flex w-full gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300">
                        <Sparkles size={14} aria-hidden="true" />
                      </div>
                    )}
                    <div
                      className={`min-w-0 text-sm leading-6 ${
                        m.role === 'user'
                          ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-slate-800 px-4 py-3 text-slate-100'
                          : 'max-w-[90%] flex-1 py-1 text-slate-100'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        <>
                          {m.content ? (
                            <Markdown text={m.content} streaming={m.id === streamingMessageId} />
                          ) : (
                            <span className="text-slate-400">…</span>
                          )}
                          {m.modelKey && <div className="mt-2 text-[10px] text-slate-600">{m.modelKey}</div>}
                        </>
                      ) : (
                        m.content || '…'
                      )}
                    </div>
                  </div>
                ))}
                {error && <div className="rounded-lg border border-red-900/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">{error}</div>}
              </div>
            </div>
            <footer className="shrink-0 border-t border-slate-800/70 px-4 py-4 sm:px-6">
              {renderComposer()}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

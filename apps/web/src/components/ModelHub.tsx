import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ModelDescriptor } from '@syntra/shared-types';

const CAPABILITY_LABELS: Record<string, string> = {
  chat: 'Chat',
  tools: 'Tools',
  code: 'Code',
  web: 'Web',
  long_context: 'Long context',
};

function fmtContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function fmtCost(per1k: number): string {
  if (per1k === 0) return '—';
  return `$${per1k < 0.001 ? per1k.toFixed(5) : per1k.toFixed(4)}`;
}

export default function ModelHub({ onBack }: { onBack: () => void }) {
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listModels(), api.getPreferences()])
      .then(([modelsRes, prefs]) => {
        setModels(modelsRes.models as ModelDescriptor[]);
        setDefaultModelKey(prefs.preferences.defaultModelKey ?? null);
      })
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  async function setDefault(modelKey: string | null): Promise<void> {
    setSavingKey(modelKey ?? '__auto__');
    try {
      const res = await api.updatePreferences({ defaultModelKey: modelKey });
      setDefaultModelKey(res.preferences.defaultModelKey ?? null);
    } catch {
      /* keep old value; error surfaced by silent failure for now */
    } finally {
      setSavingKey(null);
    }
  }

  const grouped = models.reduce<Record<string, ModelDescriptor[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Model Hub</h1>
          <p className="mt-1 text-sm text-slate-400">
            Model catalog, capabilities, and pricing. Your default applies to new conversations using Auto routing.
          </p>
        </div>
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Back to chat
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-500">Loading models…</div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          No models are enabled. Run <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">npm run db:seed</code> to
          populate the catalog.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([provider, providerModels]) => (
            <section key={provider}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{provider}</h2>
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Model</th>
                      <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Capabilities</th>
                      <th className="hidden px-4 py-2.5 font-medium md:table-cell">Context</th>
                      <th className="hidden px-4 py-2.5 font-medium md:table-cell">Max out</th>
                      <th className="hidden px-4 py-2.5 font-medium lg:table-cell">In $/1k</th>
                      <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Out $/1k</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                    {providerModels.map((m) => {
                      const isDefault = m.modelKey === defaultModelKey;
                      return (
                        <tr key={m.id} className={isDefault ? 'bg-indigo-950/40' : undefined}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-100">{m.displayName}</div>
                            <div className="font-mono text-xs text-slate-500">{m.modelKey}</div>
                            <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                              {m.capabilities.map((c) => (
                                <span key={c} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                                  {CAPABILITY_LABELS[c] ?? c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {m.capabilities.map((c) => (
                                <span
                                  key={c}
                                  className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"
                                >
                                  {CAPABILITY_LABELS[c] ?? c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 text-slate-300 md:table-cell">{fmtContext(m.contextWindow)}</td>
                          <td className="hidden px-4 py-3 text-slate-300 md:table-cell">{fmtContext(m.maxOutputTokens)}</td>
                          <td className="hidden px-4 py-3 text-slate-300 lg:table-cell">{fmtCost(m.costPer1kInput)}</td>
                          <td className="hidden px-4 py-3 text-slate-300 lg:table-cell">{fmtCost(m.costPer1kOutput)}</td>
                          <td className="px-4 py-3 text-right">
                            {isDefault ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/20 px-2.5 py-1 text-xs font-medium text-indigo-300">
                                Default
                              </span>
                            ) : (
                              <button
                                onClick={() => void setDefault(m.modelKey)}
                                disabled={savingKey !== null}
                                className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                              >
                                {savingKey === m.modelKey ? '…' : 'Set default'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="text-xs text-slate-500">
            Auto routing picks the cheapest capable model unless you choose one.{' '}
            {defaultModelKey ? (
              <>
                Current default: <code className="text-slate-400">{defaultModelKey}</code>.{' '}
              </>
            ) : (
              'No personal default set. '
            )}
            <button className="underline hover:text-slate-300" onClick={() => void setDefault(null)}>
              Use pure auto-routing
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

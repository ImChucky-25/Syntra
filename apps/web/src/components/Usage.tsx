import { useEffect, useState } from 'react';
import { api, type SubscriptionDto, type UsageSummary } from '../api';

function bar(used: number, limit: number): { pct: number; label: string } {
  if (limit <= 0) return { pct: 0, label: '∞' };
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return { pct, label: `${pct}%` };
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Usage({ onBack }: { onBack: () => void }) {
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSubscription().then((r) => setSub(r.subscription)).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  useEffect(() => {
    api.getUsage(days).then(setUsage).catch(() => setUsage(null));
  }, [days]);

  const reqBar = sub ? bar(sub.usage.requests, sub.limits.monthlyRequestLimit) : null;
  const tokBar = sub ? bar(sub.usage.totalTokens, sub.limits.monthlyTokenLimit) : null;
  const modelsList = sub ? (sub.limits.allowedModels === '*' ? 'All models' : sub.limits.allowedModels.join(', ')) : '';

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usage & Plan</h1>
          <p className="mt-1 text-sm text-slate-400">Your subscription entitlements and consumption.</p>
        </div>
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Back to chat
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</div>}

      {sub && (
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <span className="rounded-lg bg-indigo-600/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
                {sub.planName} plan
              </span>
              <span className="ml-3 text-xs text-slate-500">
                Renews {new Date(sub.periodEnd).toLocaleDateString()}
              </span>
            </div>
            <div className="text-right text-xs text-slate-500">
              Models: <span className="text-slate-300">{modelsList}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Requests this period</span>
                <span>
                  {sub.usage.requests} / {sub.limits.monthlyRequestLimit || '∞'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${reqBar && reqBar.pct > 90 ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${reqBar?.pct ?? 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>Tokens this period</span>
                <span>
                  {fmtTokens(sub.usage.totalTokens)} / {sub.limits.monthlyTokenLimit ? fmtTokens(sub.limits.monthlyTokenLimit) : '∞'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${tokBar && tokBar.pct > 90 ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${tokBar?.pct ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Consumption history</h2>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {usage && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium">Requests</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Tokens in</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Tokens out</th>
                <th className="px-4 py-2.5 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {usage.byModel.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No usage in this period.
                  </td>
                </tr>
              )}
              {usage.byModel.map((m) => (
                <tr key={m.modelKey}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{m.modelKey}</td>
                  <td className="px-4 py-3 text-slate-300">{m.requests}</td>
                  <td className="hidden px-4 py-3 text-slate-300 sm:table-cell">{fmtTokens(m.inputTokens)}</td>
                  <td className="hidden px-4 py-3 text-slate-300 sm:table-cell">{fmtTokens(m.outputTokens)}</td>
                  <td className="px-4 py-3 text-slate-300">${m.costAmount.toFixed(4)}</td>
                </tr>
              ))}
              {usage.byModel.length > 0 && (
                <tr className="bg-slate-900">
                  <td className="px-4 py-3 text-xs font-semibold uppercase text-slate-400">Total</td>
                  <td className="px-4 py-3 font-medium text-slate-200">{usage.totals.requests}</td>
                  <td className="hidden px-4 py-3 font-medium text-slate-200 sm:table-cell">{fmtTokens(usage.totals.inputTokens)}</td>
                  <td className="hidden px-4 py-3 font-medium text-slate-200 sm:table-cell">{fmtTokens(usage.totals.outputTokens)}</td>
                  <td className="px-4 py-3 font-medium text-slate-200">${usage.totals.costAmount.toFixed(4)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

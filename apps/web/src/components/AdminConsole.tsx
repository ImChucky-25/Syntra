import { useCallback, useEffect, useState } from 'react';
import { api, type AdminOverview, type AdminUserDto } from '../api';

type Tab = 'overview' | 'users' | 'models';

export default function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [models, setModels] = useState<Array<{ id: string; modelKey: string; displayName: string; provider: string; enabled?: boolean }>>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadUsers = useCallback(async (q?: string) => {
    try {
      const res = await api.adminListUsers(q);
      setUsers(res.users);
    } catch {
      /* tab guard handles */
    }
  }, []);

  useEffect(() => {
    setError(null);
    if (tab === 'overview') {
      api.adminOverview().then((r) => setOverview(r.overview)).catch((e) => setError(e.message));
    } else if (tab === 'users') {
      void loadUsers();
    } else {
      api.listModels().then((r) => setModels(r.models)).catch((e) => setError(e.message));
    }
  }, [tab, loadUsers]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === 'users') void loadUsers(query.trim() || undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [query, tab, loadUsers]);

  async function patchUser(id: string, data: { role?: 'USER' | 'ADMIN'; isActive?: boolean; planKey?: string }): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      await api.adminPatchUser(id, data);
      setNotice('User updated');
      await loadUsers(query.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function toggleModel(id: string, enabled: boolean): Promise<void> {
    setError(null);
    try {
      await api.adminPatchModel(id, enabled);
      setModels((prev) => prev.map((m) => (m.id === id ? { ...m, enabled } : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Admin console</h1>
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Back to chat
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        {(['overview', 'users', 'models'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${
              tab === t ? 'bg-indigo-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</div>}
      {notice && <div className="mb-4 rounded-lg bg-emerald-950/60 px-4 py-2 text-sm text-emerald-300">{notice}</div>}

      {tab === 'overview' && overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Users', value: overview.users },
            { label: 'Active subscriptions', value: overview.activeSubscriptions },
            { label: 'Conversations', value: overview.conversations },
            { label: 'Enabled models', value: overview.enabledModels },
            { label: 'Requests (30d)', value: overview.usage30d.requests },
            { label: 'Tokens (30d)', value: overview.usage30d.inputTokens + overview.usage30d.outputTokens },
            { label: 'Provider cost 30d', value: `$${overview.usage30d.costUsd.toFixed(2)}` },
            { label: 'Providers', value: overview.providers.map((p) => `${p.name}: ${p.enabled ? 'on' : 'off'}`).join(', ') },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500">{c.label}</div>
              <div className="mt-1 truncate text-xl font-semibold text-slate-100">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <input
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Search users by email or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-100">
                      {u.displayName} <span className="text-slate-500">· {u.email}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {u.plan.name} plan · {u.conversationCount} conversations · {u.usageCount} requests
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                      value={u.plan.key}
                      onChange={(e) => void patchUser(u.id, { planKey: e.target.value })}
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="team">Team</option>
                    </select>
                    <select
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                      value={u.role}
                      onChange={(e) => void patchUser(u.id, { role: e.target.value as 'USER' | 'ADMIN' })}
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <button
                      onClick={() => void patchUser(u.id, { isActive: !u.isActive })}
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
                        u.isActive ? 'bg-emerald-950/60 text-emerald-300' : 'bg-red-950/60 text-red-300'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {users.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No users match.</p>}
          </div>
        </div>
      )}

      {tab === 'models' && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Provider</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {models.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{m.displayName}</div>
                    <div className="font-mono text-xs text-slate-500">{m.modelKey}</div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-300 sm:table-cell">{m.provider}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void toggleModel(m.id, !(m.enabled ?? true))}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        (m.enabled ?? true) ? 'bg-emerald-950/60 text-emerald-300' : 'bg-red-950/60 text-red-300'
                      }`}
                    >
                      {(m.enabled ?? true) ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

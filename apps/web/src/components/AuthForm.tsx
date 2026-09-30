import { useState } from 'react';
import { api, type UserDto } from '../api';

export default function AuthForm({ onAuthed }: { onAuthed: (u: UserDto) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, password, displayName });
      onAuthed(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">AI Zone</h1>
      <p className="mb-6 text-sm text-slate-400">
        {mode === 'login' ? 'Sign in to your workspace' : 'Create your account'}
      </p>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
          />
        )}
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'register' ? 10 : 1}
        />
        {error && <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          disabled={busy}
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        className="mt-4 text-sm text-slate-400 hover:text-slate-200"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'No account yet? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, type UserDto } from './api';
import AuthForm from './components/AuthForm';
import ChatWorkspace from './components/ChatWorkspace';
import Landing from './components/Landing';

type PublicView = 'landing' | 'auth';

export default function App() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [checking, setChecking] = useState(true);
  const [publicView, setPublicView] = useState<PublicView>('landing');

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">Loading…</div>;
  }

  if (!user) {
    if (publicView === 'auth') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
          <div className="w-full max-w-sm">
            <button
              onClick={() => setPublicView('landing')}
              className="mb-4 text-sm text-slate-500 hover:text-slate-300"
            >
              ← Back
            </button>
            <AuthForm onAuthed={setUser} />
          </div>
        </div>
      );
    }
    return <Landing onEnter={() => setPublicView('auth')} />;
  }

  return <ChatWorkspace user={user} onSignOut={() => setUser(null)} />;
}

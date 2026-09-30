import { useEffect, useState } from 'react';
import { api, type UserDto } from './api';
import AuthForm from './components/AuthForm';
import ChatWorkspace from './components/ChatWorkspace';

export default function App() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <AuthForm onAuthed={setUser} />
      </div>
    );
  }

  return <ChatWorkspace user={user} onSignOut={() => setUser(null)} />;
}

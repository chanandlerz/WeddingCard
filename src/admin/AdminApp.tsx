import { useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import GuestsTab from './GuestsTab';
import RecapTab from './RecapTab';
import WishesTab from './WishesTab';
import SettingsTab from './SettingsTab';

const TABS = [
  { key: 'guests', label: 'Tamu' },
  { key: 'recap', label: 'Rekap' },
  { key: 'wishes', label: 'Ucapan' },
  { key: 'settings', label: 'Pengaturan' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>(() => {
    const h = location.hash.slice(1);
    return (TABS.find((t) => t.key === h)?.key ?? 'guests') as TabKey;
  });

  useEffect(() => {
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(undefined);
      return;
    }
    void sb.rpc('is_admin').then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [session?.user.id]);

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
  }, [tab]);

  if (session === undefined) return <Centered>Memuat…</Centered>;
  if (!session) return <Login />;
  if (isAdmin === undefined) return <Centered>Memeriksa akses…</Centered>;
  if (!isAdmin) {
    return (
      <Centered>
        <p>
          Akun <strong>{session.user.email}</strong> bukan admin.
        </p>
        <button type="button" class="btn btn-outline mt-4" onClick={() => void sb.auth.signOut()}>
          Keluar
        </button>
      </Centered>
    );
  }

  return (
    <div class="mx-auto max-w-6xl px-4 pb-16">
      <header class="sticky top-0 z-10 -mx-4 border-b border-ink/10 bg-paper/95 px-4 pt-4 backdrop-blur">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl">Admin Undangan</h1>
          <div class="flex items-center gap-3 text-xs text-ink-soft">
            <span class="hidden sm:inline">{session.user.email}</span>
            <button type="button" class="btn btn-outline !min-h-8 !py-1 text-xs" onClick={() => void sb.auth.signOut()}>
              Keluar
            </button>
          </div>
        </div>
        <nav class="mt-3 flex gap-1 overflow-x-auto" aria-label="Menu admin">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={tab === t.key ? 'page' : undefined}
              class={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${
                tab === t.key ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-soft'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main class="pt-6">
        {tab === 'guests' && <GuestsTab />}
        {tab === 'recap' && <RecapTab />}
        {tab === 'wishes' && <WishesTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}

function Centered({ children }: { children: preact.ComponentChildren }) {
  return <div class="min-h-screen-safe flex flex-col items-center justify-center p-6 text-center">{children}</div>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Otomatis deteksi full path admin saat ini (misal http://localhost:4321/admin atau https://.../WeddingCard/admin)
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;

  async function submit(e: Event) {
    e.preventDefault();
    setState('sending');
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: redirectUrl },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setState('sent');
    }
  }

  async function loginWithGitHub() {
    setState('sending');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectUrl,
      },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    }
  }

  return (
    <Centered>
      <div class="card w-full max-w-sm space-y-4 text-left">
        <h1 class="text-center text-2xl">Admin Undangan</h1>

        {/* GitHub OAuth Button */}
        <button
          type="button"
          class="btn btn-outline flex w-full items-center justify-center gap-2"
          onClick={loginWithGitHub}
          disabled={state === 'sending'}
        >
          <svg class="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          Masuk dengan GitHub
        </button>

        <div class="relative flex items-center justify-center">
          <div class="w-full border-t border-ink/10"></div>
          <span class="bg-paper px-2 text-xs text-ink-soft uppercase">atau email</span>
          <div class="w-full border-t border-ink/10"></div>
        </div>

        <form class="space-y-4" onSubmit={submit}>
          {state === 'sent' ? (
            <p class="text-sm">
              Link masuk sudah dikirim ke <strong>{email}</strong>. Buka email dan klik link tersebut di browser ini.
            </p>
          ) : (
            <>
              <div>
                <label class="block text-sm font-medium" for="admin-email">
                  Email admin
                </label>
                <input
                  id="admin-email"
                  type="email"
                  class="input mt-1 w-full"
                  required
                  autoComplete="email"
                  value={email}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                />
              </div>
              <button type="submit" class="btn btn-primary w-full" disabled={state === 'sending'}>
                {state === 'sending' ? 'Mengirim…' : 'Kirim Magic Link'}
              </button>
            </>
          )}
        </form>

        {state === 'error' && <p class="text-sm text-rose-700">{message}</p>}
      </div>
    </Centered>
  );
}

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Button, Card, Field } from '../../components/ui';

/** Email magic-link gate. Single-operator system: anyone who can receive
 *  mail at the owner address gets in; RLS enforces the rest server-side. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-[var(--ink-muted)]">
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;
  return <>{children}</>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--paper)] p-4">
      <Card className="w-[min(420px,94vw)] p-8">
        <div className="mb-6 flex items-center gap-3">
          <KeelMark />
          <div>
            <div className="font-[var(--font-display)] text-[22px] font-bold leading-none text-[var(--ink)]">
              Keel
            </div>
            <div className="mt-1 font-mono text-[13px] text-[var(--ink-muted)]">Lettings CRM</div>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <p className="mb-4 rounded border border-[var(--danger)] px-3 py-2 text-[13px] text-[var(--danger)]">
            Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
          </p>
        )}

        {sent ? (
          <p className="text-[15px] text-[var(--ink)]">
            Check your email — we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={sendLink} className="flex flex-col gap-4">
            <Field
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@keellettings.com"
              autoComplete="email"
            />
            {error && <p className="m-0 text-[13px] text-[var(--danger)]">{error}</p>}
            <Button type="submit" variant="primary" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

/** Brass diamond brand mark. */
function KeelMark() {
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 rotate-45 place-items-center rounded-sm"
      style={{ background: 'var(--hull)' }}
    >
      <span className="h-3.5 w-3.5 rounded-[2px]" style={{ background: 'var(--brass)' }} />
    </span>
  );
}

import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from './lib/supabase';
import { AuthGate } from './features/auth/AuthGate';
import { useAuth } from './features/auth/useAuth';
import { ToastProvider } from './components/ui';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { BinPage } from './features/bin/BinPage';
import { PipelinePage } from './features/pipeline/PipelinePage';
import { ApplicantPage } from './features/applicants/ApplicantPage';
import { PropertiesPage } from './features/properties/PropertiesPage';
import { ContactsPage } from './features/contacts/ContactsPage';
import { FeesPage } from './features/fees/FeesPage';
import { CommandSearch } from './features/search/CommandSearch';
import { ThemeToggle } from './components/ThemeToggle';
import DevTokens from './routes/DevTokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/bin', label: 'Bin' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/properties', label: 'Properties' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/fees', label: 'Fees' },
];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Styleguide is data-free; public so token drift is checkable on any deploy */}
            <Route path="/dev/tokens" element={<DevTokens />} />
            <Route
              path="*"
              element={
                <AuthGate>
                  <Shell />
                </AuthGate>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const navigate = useNavigate();
  const { email, signOut } = useAuth();

  // Keyboard shortcut: V jumps to the Bin ready to paste (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'v') navigate('/bin');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2">
        {/* Clickable home / brand */}
        <Link to="/" aria-label="Home" title="Home" className="mr-3 flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-[var(--paper)]">
          <span aria-hidden className="grid h-7 w-7 rotate-45 place-items-center rounded-sm" style={{ background: 'var(--hull)' }}>
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--brass)' }} />
          </span>
          <span className="hidden font-[var(--font-display)] text-[18px] font-bold text-[var(--ink)] sm:block">Keel</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-[15px] transition-colors ${
                  isActive
                    ? 'bg-[var(--paper)] font-semibold text-[var(--ink)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 font-mono text-[13px] text-[var(--ink-muted)] lg:flex">
            <kbd className="rounded border border-[var(--line)] px-1.5 py-0.5">Ctrl K</kbd>
            <span>search</span>
          </span>
          <ThemeToggle />
          <UserMenu email={email} onSignOut={signOut} />
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/bin" element={<BinPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/applicants/:id" element={<ApplicantPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/fees" element={<FeesPage />} />
        </Routes>
      </main>

      <CommandSearch />
    </div>
  );
}

function UserMenu({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [setting, setSetting] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const initials = email ? email.slice(0, 2).toUpperCase() : '··';

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setSetting(false); setMsg(''); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const savePassword = async () => {
    if (pw.length < 6) { setMsg('At least 6 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : 'Password set — you can use it to sign in.');
    if (!error) { setPw(''); setSetting(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--hull)] text-[13px] font-semibold text-white"
        aria-label="Account menu"
        title={email ?? 'Account'}
      >
        {initials}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-pop)]"
        >
          <div className="border-b border-[var(--line)] px-4 py-3">
            <div className="text-[13px] text-[var(--ink-muted)]">Signed in as</div>
            <div className="truncate text-[15px] text-[var(--ink)]">{email ?? '—'}</div>
          </div>

          {setting ? (
            <div className="border-b border-[var(--line)] p-3">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => { setSetting(false); setMsg(''); }} className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
                <button onClick={savePassword} className="rounded-md bg-[var(--hull)] px-3 py-1 text-[13px] text-white">Save</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setSetting(true); setMsg(''); }}
              className="block w-full border-b border-[var(--line)] px-4 py-3 text-left text-[15px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
            >
              Set / change password
            </button>
          )}

          {msg && <div className="px-4 py-2 text-[13px] text-[var(--ink-muted)]">{msg}</div>}

          <button
            onClick={onSignOut}
            className="block w-full px-4 py-3 text-left text-[15px] text-[var(--danger)] transition-colors hover:bg-[var(--paper)]"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

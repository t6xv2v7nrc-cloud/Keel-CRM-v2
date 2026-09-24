import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from './lib/supabase';
import { AuthGate } from './features/auth/AuthGate';
import { useAuth } from './features/auth/useAuth';
import { Icon, ToastProvider } from './components/ui';
import type { IconName } from './components/ui';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { BinPage } from './features/bin/BinPage';
import { PipelinePage } from './features/pipeline/PipelinePage';
import { ApplicantPage } from './features/applicants/ApplicantPage';
import { PropertiesPage } from './features/properties/PropertiesPage';
import { CallsPage } from './features/calls/CallsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { CommandSearch, openSearch } from './features/search/CommandSearch';
import { useEnsureProfile, usePeople, useSettings } from './lib/hooks';
import { setActiveSettings } from './lib/settings';
import { ThemeToggle } from './components/ThemeToggle';
import DevTokens from './routes/DevTokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const NAV: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/bin', label: 'Bin', icon: 'inbox' },
  { to: '/pipeline', label: 'Pipeline', icon: 'list' },
  { to: '/calls', label: 'Calls', icon: 'phone' },
  { to: '/properties', label: 'Properties', icon: 'building' },
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

  // Team rules plus this person's own settings, before any page works them out
  const { settings, isLoading: settingsLoading } = useSettings();
  setActiveSettings(settings);
  useEnsureProfile();
  const { myName } = usePeople();

  // Open on the person's chosen start page, once, when they arrive at Home
  const location = useLocation();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || settingsLoading) return;
    started.current = true;
    if (location.pathname === '/' && settings.startPage !== '/') navigate(settings.startPage, { replace: true });
  }, [settingsLoading, settings.startPage, location.pathname, navigate]);

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
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-[var(--line)] bg-[var(--surface)]/95 px-4 py-2 backdrop-blur">
        {/* Clickable home / brand */}
        <Link to="/" aria-label="Home" title="Home" className="mr-2 flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-[var(--surface-2)]">
          <span aria-hidden className="grid h-7 w-7 rotate-45 place-items-center rounded-[6px] bg-[var(--accent)]">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--surface)]" />
          </span>
          <span className="hidden font-[var(--font-display)] text-[18px] font-bold text-[var(--ink)] sm:block">Keel</span>
        </Link>
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-2.5 py-2 text-[15px] transition-colors ${
                  isActive
                    ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                }`
              }
            >
              <Icon name={item.icon} size={18} />
              <span className="hidden md:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={openSearch} title="Search (Ctrl K)"
            className="flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            <Icon name="search" size={16} />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden rounded border border-[var(--line)] px-1 font-mono text-[11px] lg:inline">Ctrl K</kbd>
          </button>
          <NavLink to="/settings" title="Settings" aria-label="Settings"
            className={({ isActive }) => `grid h-9 w-9 place-items-center rounded-md border transition-colors ${
              isActive ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
            <Icon name="sliders" size={17} />
          </NavLink>
          <ThemeToggle />
          <UserMenu email={email} name={myName} onSignOut={signOut} />
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/bin" element={<BinPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/applicants/:id" element={<ApplicantPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <CommandSearch />
    </div>
  );
}

function UserMenu({ email, name, onSignOut }: { email: string | null; name: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [setting, setSetting] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const initials = name ? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : email ? email.slice(0, 2).toUpperCase() : '··';

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setSetting(false); setMsg(''); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const savePassword = async () => {
    if (pw.length < 6) { setMsg('At least 6 characters.'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : 'Password set. You can use it to sign in.');
    if (!error) { setPw(''); setSetting(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-[13px] font-semibold text-[var(--on-accent)]"
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
            <div className="truncate text-[15px] font-medium text-[var(--ink)]">{name ?? email ?? 'Unknown'}</div>
            {name && email && <div className="truncate text-[13px] text-[var(--ink-muted)]">{email}</div>}
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
                <button onClick={savePassword} className="rounded-md bg-[var(--accent)] px-3 py-1 text-[13px] text-[var(--on-accent)]">Save password</button>
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

          <Link to="/settings" onClick={() => setOpen(false)}
            className="block w-full border-b border-[var(--line)] px-4 py-3 text-left text-[15px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]">
            My settings
          </Link>

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

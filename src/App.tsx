import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from './features/auth/AuthGate';
import { ToastProvider } from './components/ui';
import { BinPage } from './features/bin/BinPage';
import { PipelinePage } from './features/pipeline/PipelinePage';
import { ApplicantPage } from './features/applicants/ApplicantPage';
import { PropertiesPage } from './features/properties/PropertiesPage';
import { ContactsPage } from './features/contacts/ContactsPage';
import { CommandSearch } from './features/search/CommandSearch';
import DevTokens from './routes/DevTokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const NAV = [
  { to: '/', label: 'Bin' },
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
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2">
        <span aria-hidden className="mr-3 grid h-7 w-7 rotate-45 place-items-center rounded-sm" style={{ background: 'var(--hull)' }}>
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--brass)' }} />
        </span>
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
        <span className="ml-auto hidden items-center gap-1 font-mono text-[13px] text-[var(--ink-muted)] sm:flex">
          <kbd className="rounded border border-[var(--line)] px-1.5 py-0.5">Ctrl K</kbd>
          <span>search</span>
        </span>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<BinPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/applicants/:id" element={<ApplicantPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/fees" element={<Placeholder name="Fees" hint="Fee status, splits, monthly totals (Phase 4)" />} />
        </Routes>
      </main>

      <CommandSearch />
    </div>
  );
}

function Placeholder({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">{name}</h1>
        <p className="mt-2 text-[15px] text-[var(--ink-muted)]">{hint}</p>
      </div>
    </div>
  );
}

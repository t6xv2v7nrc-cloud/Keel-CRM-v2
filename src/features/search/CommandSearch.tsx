import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApplicants, useProperties } from '../../lib/hooks';
import { Avatar, Icon } from '../../components/ui';
import { areaOf, matchesTerms, parseQuery, searchText } from '../../lib/search';

interface Hit {
  id: string;
  label: string;
  sub: string;
  group: 'Clients' | 'Properties';
  to: string;
}

/** Opens the search from anywhere, e.g. the search button in the header. */
export const openSearch = () => window.dispatchEvent(new Event('keel:search'));

/** Global ⌘K / Ctrl-K search (§8.7) across clients and properties. */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: applicants = [] } = useApplicants();
  const { data: properties = [] } = useProperties();

  // Open on Cmd/Ctrl-K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keel:search', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keel:search', onOpen); };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const hits: Hit[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: Hit[] = [];
    // Clients: same matching as the Pipeline search (name, phone, area, notes, benefits...)
    const terms = parseQuery(q);
    for (const a of applicants) {
      if (matchesTerms(searchText(a), terms)) {
        out.push({ id: a.id, label: a.full_name, sub: [areaOf(a), a.stage].filter(Boolean).join(' · '), group: 'Clients', to: `/applicants/${a.id}` });
      }
    }
    for (const p of properties) {
      if (p.address_line.toLowerCase().includes(s) || p.postcode?.toLowerCase().includes(s) || p.borough?.toLowerCase().includes(s)) {
        out.push({ id: p.id, label: p.address_line, sub: [p.postcode, p.status].filter(Boolean).join(' · '), group: 'Properties', to: '/properties' });
      }
    }
    return out.slice(0, 12);
  }, [q, applicants, properties]);

  const go = (hit: Hit) => {
    setOpen(false);
    navigate(hit.to);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-[rgba(42,40,36,0.35)] pt-[14vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(600px,94vw)] flex-col overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
        <Icon name="search" size={20} className="text-[var(--ink-muted)]" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && hits[active]) go(hits[active]);
          }}
          placeholder="Search clients and properties…"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-[18px] text-[var(--ink)] outline-none"
        />
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {q && hits.length === 0 && (
            <div className="px-4 py-6 text-center text-[15px] text-[var(--ink-muted)]">No matches.</div>
          )}
          {hits.map((hit, i) => (
            <button
              key={`${hit.group}-${hit.id}`}
              onClick={() => go(hit)}
              onMouseEnter={() => setActive(i)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
              style={{ background: i === active ? 'var(--surface-2)' : 'transparent' }}
            >
              {hit.group === 'Clients' ? <Avatar name={hit.label} size={30} />
                : <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name="building" size={16} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-[var(--ink)]">{hit.label}</span>
                {hit.sub && <span className="block truncate font-mono text-[13px] text-[var(--ink-muted)]">{hit.sub}</span>}
              </span>
            </button>
          ))}
          {!q && (
            <div className="px-4 py-6 text-center text-[15px] text-[var(--ink-muted)]">
              Type to search. <kbd className="rounded border border-[var(--line)] px-1 font-mono text-[13px]">Esc</kbd> to close.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

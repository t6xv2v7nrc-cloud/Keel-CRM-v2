import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApplicants, useContacts, useProperties } from '../../lib/hooks';

interface Hit {
  id: string;
  label: string;
  sub: string;
  group: 'Applicants' | 'Properties' | 'Contacts';
  to: string;
}

/** Global ⌘K / Ctrl-K search (§8.7) across applicants, properties, contacts. */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: applicants = [] } = useApplicants();
  const { data: properties = [] } = useProperties();
  const { data: contacts = [] } = useContacts();

  // Open on Cmd/Ctrl-K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
    for (const a of applicants) {
      if (a.full_name.toLowerCase().includes(s) || a.phone?.includes(s) || a.referring_borough?.toLowerCase().includes(s)) {
        out.push({ id: a.id, label: a.full_name, sub: [a.referring_borough, a.stage].filter(Boolean).join(' · '), group: 'Applicants', to: `/applicants/${a.id}` });
      }
    }
    for (const p of properties) {
      if (p.address_line.toLowerCase().includes(s) || p.postcode?.toLowerCase().includes(s) || p.borough?.toLowerCase().includes(s)) {
        out.push({ id: p.id, label: p.address_line, sub: [p.postcode, p.status].filter(Boolean).join(' · '), group: 'Properties', to: '/properties' });
      }
    }
    for (const c of contacts) {
      if (c.full_name.toLowerCase().includes(s) || c.organisation?.toLowerCase().includes(s)) {
        out.push({ id: c.id, label: c.full_name, sub: [c.organisation, c.borough].filter(Boolean).join(' · '), group: 'Contacts', to: '/contacts' });
      }
    }
    return out.slice(0, 12);
  }, [q, applicants, properties, contacts]);

  const go = (hit: Hit) => {
    setOpen(false);
    navigate(hit.to);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/40 pt-[14vh]" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[min(600px,94vw)] flex-col overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-pop)]"
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && hits[active]) go(hits[active]);
          }}
          placeholder="Search applicants, properties, contacts…"
          className="border-b border-[var(--line)] bg-transparent px-4 py-3 text-[18px] text-[var(--ink)] outline-none"
        />
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
              style={{ background: i === active ? 'var(--paper)' : 'transparent' }}
            >
              <span className="rounded bg-[var(--stage-lead-bg)] px-1.5 py-0.5 text-[13px] text-[var(--stage-lead-fg)]">
                {hit.group.slice(0, -1)}
              </span>
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

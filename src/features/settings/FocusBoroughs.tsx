import { useState } from 'react';
import { Card, CardHeader, Icon } from '../../components/ui';
import type { AppSettings } from '../../lib/settings';
import { LONDON_BOROUGHS } from '../../lib/london';

const LONDON = [...LONDON_BOROUGHS].sort((a, b) => a.localeCompare(b));

/** Team settings: the boroughs Keel works hardest (first and starred everywhere) and the ones it would like to work next. */
export function FocusBoroughs({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  return (
    <Card fold="settings.focus" startsFolded>
      <CardHeader icon="flag" title="Focus boroughs" sub={`${draft.focusBoroughs.length} focus, ${draft.wishlistBoroughs.length} on the wish-list`} help="councils" />
      <div className="flex flex-col gap-4 p-5">
        <BoroughList label="Focus" note="Listed first and starred on Councils, and first on dashboards." value={draft.focusBoroughs}
          others={draft.wishlistBoroughs} onChange={(v) => set('focusBoroughs', v)} />
        <BoroughList label="Wish-list" note="Sorted after the focus boroughs." value={draft.wishlistBoroughs}
          others={draft.focusBoroughs} onChange={(v) => set('wishlistBoroughs', v)} />
      </div>
    </Card>
  );
}

function BoroughList({ label, note, value, others, onChange }: { label: string; note: string; value: string[]; others: string[]; onChange: (v: string[]) => void }) {
  const [pick, setPick] = useState('');
  const free = LONDON.filter((b) => !value.includes(b) && !others.includes(b));
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-[15px] font-medium text-[var(--ink)]">{label}</div>
        <div className="text-[13px] text-[var(--ink-muted)]">{note}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((b) => (
          <span key={b} className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] pl-3 pr-1 text-[13px] font-medium text-[var(--accent-ink)]">
            {b}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== b))} aria-label={`Take ${b} off the ${label.toLowerCase()} list`}
              className="grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--surface)]"><Icon name="x" size={12} /></button>
          </span>
        ))}
        {value.length === 0 && <span className="text-[13px] text-[var(--ink-muted)]">None yet.</span>}
        <select value={pick} aria-label={`Add a borough to ${label.toLowerCase()}`}
          onChange={(e) => { const b = e.target.value; if (b) onChange([...value, b]); setPick(''); }}
          className="min-h-[34px] max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]">
          <option value="">Add a borough…</option>
          {free.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
    </div>
  );
}

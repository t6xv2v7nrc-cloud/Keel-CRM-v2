import { useRef, useState } from 'react';
import { Card, CardHeader, Icon, useToast } from '../../components/ui';
import type { AppSettings } from '../../lib/settings';
import { LHA_DIRECT_URL, parseLhaCsv } from '../../lib/lha';
import { LHA_RATES, LHA_YEAR } from '../../data/lha-rates';

const pounds = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const SIZES = ['Shared room', '1 bed', '2 bed', '3 bed', '4 bed'];

/** Team settings: which LHA rates are in use, a rate finder, the top-up leeway and area corrections. */
export function LhaSettings({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const table = draft.lhaRates ?? { year: LHA_YEAR, rates: LHA_RATES };
  const names = Object.keys(table.rates).sort((a, b) => a.localeCompare(b));
  const [look, setLook] = useState(names.includes('Outer North London') ? 'Outer North London' : names[0]);
  const [district, setDistrict] = useState('');
  const [area, setArea] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const overrides = Object.entries(draft.lhaAreaOverrides ?? {}).sort(([a], [b]) => a.localeCompare(b));

  const load = async (f: File) => {
    try {
      const t = parseLhaCsv(await f.text());
      set('lhaRates', t);
      toast(`Loaded ${t.year}: ${Object.keys(t.rates).length} areas. Save team settings to start using them.`, 'success');
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };
  const addOverride = () => {
    const key = district.trim().toUpperCase();
    if (!key || !area) return;
    set('lhaAreaOverrides', { ...draft.lhaAreaOverrides, [key]: area });
    setDistrict(''); setArea('');
  };
  const rates = table.rates[look] ?? [];

  return (
    <Card>
      <CardHeader icon="pound" title="LHA rates" sub={`${table.year} · ${names.length} areas`} help="lha" />
      <div className="flex flex-col gap-5 p-5">
        {/* Which rates */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name="calendar" size={16} /></span>
          <div className="min-w-[220px] flex-1">
            <div className="text-[15px] font-medium text-[var(--ink)]">Rates in use: {table.year}</div>
            <div className="text-[13px] text-[var(--ink-muted)]">
              {draft.lhaRates ? 'Loaded from a file.' : 'Built in.'} When a new year is published, load its CSV here (area name, then shared, 1, 2, 3 and 4 bed monthly rates).
            </div>
          </div>
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
          <button type="button" onClick={() => file.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-2 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
            <Icon name="plus" size={14} /> Load a new year's rates
          </button>
          {draft.lhaRates && (
            <button type="button" onClick={() => set('lhaRates', null)} className="text-[13px] text-[var(--link)] hover:underline">
              Use the built-in {LHA_YEAR} rates
            </button>
          )}
        </div>

        {/* Rate finder */}
        <div className="rounded-lg bg-[var(--surface-2)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">Look up an area</span>
            <select value={look} onChange={(e) => setLook(e.target.value)} aria-label="LHA area"
              className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <a href={LHA_DIRECT_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[13px] text-[var(--link)] hover:underline">
              Find an address's area on LHA Direct <Icon name="arrowRight" size={12} className="-rotate-45" />
            </a>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {SIZES.map((label, i) => (
              <div key={label} className="rounded-md bg-[var(--surface)] px-2 py-2">
                <div className="text-[12px] text-[var(--ink-muted)]">{label}</div>
                <div className="font-mono text-[15px] font-semibold text-[var(--ink)]">{rates[i] != null ? pounds(rates[i]) : '·'}</div>
              </div>
            ))}
          </div>
          <p className="m-0 mt-2 text-[12px] text-[var(--ink-muted)]">Monthly. Studios and en-suite rooms are checked against the 1 bed rate; other rooms against the shared rate.</p>
        </div>

        {/* Leeway */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name="pound" size={16} /></span>
          <div className="min-w-[220px] flex-1">
            <div className="text-[15px] font-medium text-[var(--ink)]">Top-up a client might cover</div>
            <div className="text-[13px] text-[var(--ink-muted)]">In matching, a rent up to this much over a client's LHA is a small top-up; more than this counts against the match.</div>
          </div>
          <span className="flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-[var(--accent)]">
            <span className="pl-2.5 font-mono text-[15px] text-[var(--ink-muted)]">£</span>
            <input type="number" min={0} step={10} value={draft.lhaLeeway} aria-label="Top-up a client might cover"
              onChange={(e) => set('lhaLeeway', Math.max(0, Number(e.target.value) || 0))}
              className="h-10 w-24 bg-transparent px-2.5 font-mono text-[15px] text-[var(--ink)] outline-none" />
          </span>
        </div>

        {/* Corrections */}
        <div className="flex flex-col gap-2">
          <div className="text-[15px] font-medium text-[var(--ink)]">Area corrections</div>
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">
            Keel estimates each property's area from its postcode district. If you check one on LHA Direct and it is different, correct the whole district here
            (or one property from its card).
          </p>
          {overrides.length > 0 && (
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)] p-0">
              {overrides.map(([k, v]) => (
                <li key={k} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                  <span className="w-16 font-mono font-semibold text-[var(--ink)]">{k}</span>
                  <Icon name="arrowRight" size={14} className="text-[var(--ink-muted)]" />
                  <span className="flex-1 text-[var(--ink)]">{v}</span>
                  <button type="button" onClick={() => { const next = { ...draft.lhaAreaOverrides }; delete next[k]; set('lhaAreaOverrides', next); }}
                    aria-label={`Remove the correction for ${k}`} className="grid h-7 w-7 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]">
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. N17" aria-label="Postcode district or borough" maxLength={24}
              className="h-9 w-32 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[15px] uppercase text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <Icon name="arrowRight" size={14} className="text-[var(--ink-muted)]" />
            <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Correct area"
              className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
              <option value="">Choose the area…</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" onClick={addOverride} disabled={!district.trim() || !area}
              className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-40">
              Add correction
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

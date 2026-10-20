import { useMemo, useRef, useState } from 'react';
import { Button, Card, CardHeader, Icon, UpdateNote, useToast } from '../../components/ui';
import type { AppSettings } from '../../lib/settings';
import { areaSource, lhaSourceWords, lhaVerified, lookupPostcode, parseDistrict, parseGovLhaCsv, parseLhaCsv, rowsForDatabase } from '../../lib/lha';
import type { GovLhaFile, LhaTable } from '../../lib/lha';
import { canonicalBorough } from '../../lib/london';
import { shortDate } from '../../lib/format';
import { useLhaDatabase, useLoadLhaRates, usePeople, useSetPostcodeBrma } from '../../lib/hooks';
import { LHA_RATES, LHA_YEAR } from '../../data/lha-rates';
import { BrmaSelect, LhaLookup, whereWords } from '../properties/Lha';

const SIZES = ['shared', '1 bed', '2 bed', '3 bed', '4 bed'];
const SAMPLES = ['Inner North London', 'Outer West London', 'Outer South London', 'North West London'];
const pounds = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const input = 'h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const chip = (on: boolean) => `inline-flex min-h-[34px] items-center rounded-full border px-3 text-[13px] font-medium ${on
  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`;

/** "NW10 4" (a postcode sector, typed as such) → itself; anything else postcode-like → its district; null if not a postcode. */
function postcodeKey(typed: string): string | null {
  const t = typed.trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^[A-Z]{1,2}\d[A-Z\d]? \d$/.test(t)) return t;
  return parseDistrict(t);
}

/** Team settings: which LHA rates are in use and where they came from, loading gov.uk's, a rate finder, the top-up leeway and area corrections. */
export function LhaSettings({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const lha = useLhaDatabase();
  const { isOwner } = usePeople();
  const setPostcode = useSetPostcodeBrma();
  const table: LhaTable = lha.table
    ?? (draft.lhaRates ? { ...draft.lhaRates, source: { kind: 'file' } } : { year: LHA_YEAR, rates: LHA_RATES, source: { kind: 'built_in' } });
  const names = Object.keys(table.rates);
  const checked = lhaVerified(table);
  const [district, setDistrict] = useState('');
  const [area, setArea] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // corrections: postcodes in the database once 0018 is in (boroughs stay in Team settings), all in Team settings before
  const inDb = new Set(lha.postcodes.map((r) => r.postcode_prefix));
  const settingsOnes = Object.entries(draft.lhaAreaOverrides ?? {})
    .filter(([k]) => !lha.ready || !inDb.has(k))
    .sort(([a], [b]) => a.localeCompare(b));

  const loadOld = async (f: File) => {
    try {
      const t = parseLhaCsv(await f.text());
      set('lhaRates', t);
      toast(`Loaded ${t.year}: ${Object.keys(t.rates).length} areas. Save team settings to start using them.`, 'success');
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };
  const addOverride = () => {
    const pc = postcodeKey(district);
    if (!area) return;
    if (pc && lha.ready) {
      setPostcode.mutate({ prefix: pc, brma: area }, {
        onSuccess: () => { toast(`Every ${pc} property now uses ${area}`, 'success'); setDistrict(''); setArea(''); },
        onError: (e) => toast((e as Error).message, 'danger'),
      });
      return;
    }
    // before 0018, or a borough: kept in Team settings by its proper name
    const key = pc ?? canonicalBorough(district) ?? district.trim();
    if (!key) return;
    set('lhaAreaOverrides', { ...draft.lhaAreaOverrides, [key]: area });
    setDistrict(''); setArea('');
  };
  const typed = district.trim() ? lookupPostcode(district) : null;

  return (
    <Card id="lha" fold="settings.lha" startsFolded className="scroll-mt-28">
      <CardHeader icon="pound" title="LHA rates" sub={`${table.year} · ${names.length} areas`} help="lha" />
      <div className="flex flex-col gap-5 p-5">
        {/* Which rates, and where they came from */}
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name="calendar" size={16} /></span>
          <div className="min-w-0 flex-1 basis-[220px]">
            <div className="text-[15px] font-medium text-[var(--ink)]">Rates in use: {table.year}</div>
            <div className="text-[13px] text-[var(--ink-muted)]">
              {names.length} areas. Source: {table.source?.kind === 'database' && table.source.url
                ? <a href={table.source.url} target="_blank" rel="noreferrer" className="break-all text-[var(--link)] hover:underline">{lhaSourceWords(table)}</a>
                : lhaSourceWords(table)}.
            </div>
            {lha.later && <div className="text-[13px] text-[var(--ink-muted)]">Rates applying from {shortDate(lha.later)} are loaded and take over that day.</div>}
          </div>
        </div>
        {!checked && (
          <p className="m-0 flex gap-2 rounded-md px-3 py-2 text-[14px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>These figures are not checked against gov.uk, so treat every LHA amount and gap as a guide.{' '}
              {lha.ready ? 'Load the gov.uk CSV below to replace them.' : 'Once the update below is run, the gov.uk CSV can be loaded with its source.'}</span>
          </p>
        )}

        {!lha.ready && !lha.loading && (
          <>
            <UpdateNote title="LHA rates kept with their source need a one-off database update." file="0018_lha_rates.sql">
              Until then Keel uses the rates above.
            </UpdateNote>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadOld(f); e.target.value = ''; }} />
              <button type="button" onClick={() => file.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-2 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
                <Icon name="plus" size={14} /> Load a CSV without its source
              </button>
              {draft.lhaRates && (
                <button type="button" onClick={() => set('lhaRates', null)} className="text-[13px] text-[var(--link)] hover:underline">
                  Use the built-in {LHA_YEAR} rates
                </button>
              )}
            </div>
          </>
        )}
        {lha.ready && (isOwner
          ? <GovImport />
          : <p className="m-0 text-[13px] text-[var(--ink-muted)]">Only the owner can load new rates.</p>)}

        {/* Postcode and area lookup */}
        <div className="rounded-lg bg-[var(--surface-2)] p-4">
          <LhaLookup />
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
            Keel estimates each property's area from its postcode. If you check one on LHA Direct and it is different, correct the whole district (NW11)
            or sector (NW10 4) here, or one property from its card.{lha.ready ? ' Postcode corrections are saved straight away.' : ''}
          </p>
          {(lha.postcodes.length > 0 || settingsOnes.length > 0) && (
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)] p-0">
              {lha.postcodes.map((r) => (
                <li key={`db-${r.postcode_prefix}`} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                  <span className="w-16 shrink-0 font-mono font-semibold text-[var(--ink)]">{r.postcode_prefix}</span>
                  <Icon name="arrowRight" size={14} className="shrink-0 text-[var(--ink-muted)]" />
                  <span className="min-w-0 flex-1 text-[var(--ink)]">{r.brma}{r.manual_override && <span className="text-[13px] text-[var(--ink-muted)]"> · checked by hand</span>}</span>
                  {isOwner && (
                    <button type="button" disabled={setPostcode.isPending} onClick={() => setPostcode.mutate({ prefix: r.postcode_prefix, brma: null }, {
                      onSuccess: () => toast(`${r.postcode_prefix} is back to the estimate`, 'success'), onError: (e) => toast((e as Error).message, 'danger'),
                    })}
                      aria-label={`Remove the correction for ${r.postcode_prefix}`} className="grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </li>
              ))}
              {settingsOnes.map(([k, v]) => (
                <li key={`set-${k}`} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                  <span className="w-16 shrink-0 font-mono font-semibold text-[var(--ink)]">{k}</span>
                  <Icon name="arrowRight" size={14} className="shrink-0 text-[var(--ink-muted)]" />
                  <span className="min-w-0 flex-1 text-[var(--ink)]">{v}</span>
                  <button type="button" onClick={() => { const next = { ...draft.lhaAreaOverrides }; delete next[k]; set('lhaAreaOverrides', next); }}
                    aria-label={`Remove the correction for ${k}`} className="grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]">
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. N17 or Barnet" aria-label="Postcode district, sector or borough" maxLength={24}
              className="h-9 w-32 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <Icon name="arrowRight" size={14} className="text-[var(--ink-muted)]" />
            <BrmaSelect value={area} onChange={setArea} placeholder="Choose the area…" label="Correct area"
              className="h-9 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]" />
            <button type="button" onClick={addOverride} disabled={!district.trim() || !area || setPostcode.isPending}
              className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-40">
              Add correction
            </button>
          </div>
          {typed && (
            <p className="m-0 text-[13px] text-[var(--ink-muted)]">
              {typed.district}{whereWords(typed) ? ` (${whereWords(typed)})` : ''} is {typed.area ? `now ${typed.area.brma}, ${areaSource(typed.area)}.` : 'not known to Keel yet.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Load the gov.uk rates CSV: where it came from, the day it applies from, a look at what was read, then load. */
function GovImport() {
  const load = useLoadLhaRates();
  const { toast } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [unit, setUnit] = useState<'auto' | 'weekly' | 'monthly'>('auto');
  const [url, setUrl] = useState('');
  const [from, setFrom] = useState('');
  const read = useMemo((): { file: GovLhaFile } | { error: string } | null => {
    if (!text) return null;
    try { return { file: parseGovLhaCsv(text, unit) }; } catch (e) { return { error: (e as Error).message }; }
  }, [text, unit]);
  const f = read && 'file' in read ? read.file : null;
  const count = f ? Object.keys(f.rates).length : 0;
  const urlOk = /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim());
  const samples = f ? SAMPLES.filter((n) => f.rates[n]).slice(0, 3) : [];
  const reset = () => { setText(null); setFileName(''); setUnit('auto'); setUrl(''); setFrom(''); };

  const go = () => {
    if (!f || !urlOk || !from) return;
    load.mutate({ rows: rowsForDatabase(f, url.trim(), from), areas: count }, {
      onSuccess: () => { toast(`Loaded ${count} areas, applying from ${shortDate(from)}`, 'success'); reset(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] p-4">
      <div className="text-[15px] font-medium text-[var(--ink)]">Load rates from gov.uk</div>
      <p className="m-0 text-[13px] text-[var(--ink-muted)]">
        Download the LHA rates CSV from gov.uk, then choose it here with the page it came from and the day the rates apply from. Weekly figures are changed to the monthly
        Universal Credit amount (× 52 ÷ 12). Nothing is typed in by hand.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">gov.uk page the CSV came from</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.gov.uk/government/publications/..." className={`${input} w-full`} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">Rates apply from</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} w-full`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden"
          onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) { setText(await fl.text()); setFileName(fl.name); setUnit('auto'); } e.target.value = ''; }} />
        <Button onClick={() => file.current?.click()}><Icon name="plus" size={14} />{fileName ? 'Choose a different CSV' : 'Choose the CSV'}</Button>
        {fileName && <span className="min-w-0 break-all text-[13px] text-[var(--ink-muted)]">{fileName}</span>}
      </div>

      {read && 'error' in read && <p className="m-0 text-[14px] text-[var(--danger)]">{read.error}</p>}
      {f && (
        <div className="flex flex-col gap-2 rounded-md bg-[var(--surface-2)] p-3 text-[14px] text-[var(--ink)]">
          <div><strong>{count} areas read.</strong> The file's figures are {f.unit}
            {f.unitFrom === 'heading' ? ' (from its headings)' : f.unitFrom === 'size' ? ' (judged from their size)' : ''}{f.unit === 'weekly' ? ', shown here as monthly' : ''}.</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-[var(--ink-muted)]">The figures are</span>
            <button type="button" className={chip(f.unit === 'weekly')} onClick={() => setUnit('weekly')}>Weekly</button>
            <button type="button" className={chip(f.unit === 'monthly')} onClick={() => setUnit('monthly')}>Monthly</button>
          </div>
          {samples.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {samples.map((n) => (
                <li key={n}><strong>{n}:</strong> {f.rates[n].map((v, i) => `${pounds(v)} ${SIZES[i]}`).join(' · ')}</li>
              ))}
            </ul>
          )}
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">Check these against the gov.uk page before loading.</p>
          {f.newNames.length > 0 && (
            <p className="m-0 text-[13px]" style={{ color: 'var(--note-fg)' }}>
              {f.newNames.length} {f.newNames.length === 1 ? 'name' : 'names'} Keel does not know yet: {f.newNames.slice(0, 6).join(', ')}{f.newNames.length > 6 ? '…' : ''}.
              Postcode estimates use the names Keel knows, so a different spelling of a London area would leave it without a rate.
            </p>
          )}
          {f.incomplete.length > 0 && (
            <p className="m-0 text-[13px]" style={{ color: 'var(--note-fg)' }}>Left out for a missing size: {f.incomplete.join(', ')}.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button busy={load.isPending} variant="primary" disabled={!urlOk || !from || load.isPending} onClick={go}>
              {load.isPending ? 'Loading…' : `Load ${count} areas${from ? `, applying from ${shortDate(from)}` : ''}`}
            </Button>
            <Button busy={load.isPending} disabled={load.isPending} onClick={reset}>Cancel</Button>
            {(!urlOk || !from) && <span className="text-[13px] text-[var(--ink-muted)]">Add the gov.uk page and the date first.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Help, Icon, useToast } from '../../components/ui';
import { usePeople, useSaveSettings, useSetLhaArea, useSettings } from '../../lib/hooks';
import { activeSettings } from '../../lib/settings';
import { brmaNames, districtFor, LHA_DIRECT_URL, lhaCheck, lhaTable, lhaWords, sizeWords } from '../../lib/lha';
import type { LhaCheck, PropertyForLha } from '../../lib/lha';
import type { Property } from '../../lib/types';

const pounds = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function tone(c: LhaCheck): { bg: string; fg: string } {
  if (c.status === 'under' || c.status === 'at') return { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' };
  if (c.status === 'over') return { bg: 'var(--note-bg)', fg: 'var(--note-fg)' };
  return { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)' };
}

/** "£36 over LHA" / "£120 under LHA" / "At LHA", coloured, with the detail on hover. */
export function LhaChip({ property }: { property: PropertyForLha }) {
  const c = lhaCheck(property);
  if (!c) return null;
  const t = tone(c);
  const overLeeway = c.status === 'over' && (c.diff ?? 0) > activeSettings().lhaLeeway;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] ${overLeeway ? 'font-semibold' : 'font-medium'}`}
      style={{ background: t.bg, color: t.fg }}
      title={`${sizeWords(c.size)} LHA in ${c.area.brma}: ${pounds(c.rate)} pcm${c.area.how === 'estimated' ? ' (area estimated)' : ''}`}>
      {lhaWords(c)}
    </span>
  );
}

/** The full LHA line for a property card, with a way to correct its area. */
export function LhaLine({ property }: { property: Property }) {
  const c = lhaCheck(property);
  const [editing, setEditing] = useState(false);
  const district = districtFor(property);

  if (!c) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-muted)]">
        <Icon name="pound" size={14} /> LHA: {property.postcode || property.borough ? 'size not known' : 'area not known (no postcode)'}
        <button type="button" onClick={() => setEditing(true)} className="text-[var(--link)] hover:underline">Set the LHA area</button>
        <Help topic="lha" />
        {editing && <AreaEditor property={property} district={district} current={null} onClose={() => setEditing(false)} />}
      </div>
    );
  }

  const t = tone(c);
  const source = c.area.how === 'set' ? 'set by hand' : c.area.how === 'team' ? `team setting for ${c.area.basis}` : `estimated from ${c.area.basis}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: t.bg, color: t.fg }}>{lhaWords(c)}</span>
        <span className="text-[var(--ink)]">{sizeWords(c.size)} LHA <strong className="font-mono">{pounds(c.rate)}</strong></span>
        <span className="text-[var(--ink-muted)]">· {c.area.brma}</span>
        <span className={c.area.how === 'estimated' ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}>({source})</span>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="text-[var(--link)] hover:underline">Change area</button>}
        <Help topic="lha" />
      </div>
      {editing && <AreaEditor property={property} district={district} current={c.area.brma} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AreaEditor({ property, district, current, onClose }: { property: Property; district: string | null; current: string | null; onClose: () => void }) {
  const [area, setArea] = useState(current ?? '');
  const [everywhere, setEverywhere] = useState(false);
  const setLha = useSetLhaArea();
  const save = useSaveSettings();
  const { settings } = useSettings();
  const people = usePeople();
  const { toast } = useToast();
  const busy = setLha.isPending || save.isPending;

  const apply = () => {
    if (!area) return;
    if (everywhere && district) {
      save.mutate({ scope: 'team', value: { ...settings, lhaAreaOverrides: { ...settings.lhaAreaOverrides, [district]: area } } }, {
        onSuccess: () => { toast(`Every ${district} property now uses ${area}`, 'success'); onClose(); },
        onError: (e) => toast((e as Error).message, 'danger'),
      });
      return;
    }
    setLha.mutate({ properties: [property], area }, {
      onSuccess: () => { toast(`LHA area set to ${area}`, 'success'); onClose(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const useEstimate = () => setLha.mutate({ properties: [property], area: null }, {
    onSuccess: () => { toast('Back to the estimated LHA area', 'success'); onClose(); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[13px]">
      <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="LHA area"
        className="h-8 max-w-[240px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)]">
        <option value="">Choose the LHA area…</option>
        {brmaNames().map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      {district && people.canEditTeam && (
        <label className="inline-flex items-center gap-1.5 text-[var(--ink)]">
          <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} className="accent-[var(--accent)]" />
          Use for every {district} property
        </label>
      )}
      <button type="button" onClick={apply} disabled={!area || busy}
        className="rounded-md bg-[var(--accent)] px-2.5 py-1 font-medium text-[var(--on-accent)] disabled:opacity-40">Save area</button>
      {property.lha_area && <button type="button" onClick={useEstimate} disabled={busy} className="text-[var(--link)] hover:underline">Use the estimate</button>}
      <button type="button" onClick={onClose} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
      <a href={LHA_DIRECT_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[var(--link)] hover:underline">
        Check on LHA Direct <Icon name="arrowRight" size={12} className="-rotate-45" />
      </a>
      <span className="w-full text-[12px] text-[var(--ink-muted)]">Rates: {lhaTable().year}.</span>
    </div>
  );
}

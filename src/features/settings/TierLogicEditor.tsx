import { useMemo } from 'react';
import { Donut, Icon } from '../../components/ui';
import type { CondField, Condition, TierDef, TierLogic } from '../../lib/settings';
import { DEFAULT_TIER_LOGIC } from '../../lib/settings';
import { computeTier, describeTier, FIELDS, opsFor, tierColor, tierStyle } from '../../lib/tiering';
import type { Applicant } from '../../lib/types';

const MAX_TIERS = 6;

/** A tier set by hand stays (if that tier still exists); everyone else follows the logic being edited. */
export function tierUnder(a: Applicant, logic: TierLogic): number {
  const n = logic.tiers.length;
  const stored = typeof a.tier === 'number' && a.tier >= 1 && a.tier <= n ? a.tier : null;
  if (stored && (a.tier_locked || a.tier_locked === undefined)) return stored;
  return computeTier(a, logic);
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** Build the tier logic: any number of tiers, checked in order, each with its own conditions. */
export function TierLogicEditor({ logic, saved, onChange, active }: {
  logic: TierLogic; saved: TierLogic; onChange: (l: TierLogic) => void; active: Applicant[];
}) {
  const n = logic.tiers.length;
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const a of active) { const t = tierUnder(a, logic); c.set(t, (c.get(t) ?? 0) + 1); }
    return c;
  }, [active, logic]);
  // Saved counts by tier name, so adding or moving a tier does not show false changes
  const countsNow = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of active) { const label = saved.tiers[tierUnder(a, saved) - 1]?.label ?? ''; c.set(label, (c.get(label) ?? 0) + 1); }
    return c;
  }, [active, saved]);
  const changeOf = (k: number) => {
    const label = logic.tiers[k].label;
    if (!saved.tiers.some((t) => t.label === label)) return 0;
    return (counts.get(k + 1) ?? 0) - (countsNow.get(label) ?? 0);
  };

  const setTier = (k: number, t: TierDef) => onChange({ tiers: logic.tiers.map((x, i) => (i === k ? t : x)) });
  const move = (k: number, dir: -1 | 1) => {
    const tiers = [...logic.tiers];
    [tiers[k], tiers[k + dir]] = [tiers[k + dir], tiers[k]];
    onChange({ tiers });
  };
  const remove = (k: number) => onChange({ tiers: logic.tiers.filter((_, i) => i !== k) });
  const addTier = () => {
    const tiers = [...logic.tiers];
    tiers.splice(n - 1, 0, { label: `Tier ${n}`, all: [], any: [] });
    // keep the catch-all's default name in step with its new position
    const last = tiers[tiers.length - 1];
    if (/^Tier \d+$/.test(last.label)) tiers[tiers.length - 1] = { ...last, label: `Tier ${tiers.length}` };
    onChange({ tiers });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_210px]">
      <div className="flex flex-col gap-3">
        {logic.tiers.map((t, k) => (
          <TierCard key={k} tier={t} index={k} count={n} clients={counts.get(k + 1) ?? 0} change={changeOf(k)}
            onChange={(x) => setTier(k, x)} onUp={k > 0 && k < n - 1 ? () => move(k, -1) : undefined}
            onDown={k < n - 2 ? () => move(k, 1) : undefined} onRemove={k < n - 1 && n > 2 ? () => remove(k) : undefined} />
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addTier} disabled={n >= MAX_TIERS}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--line-strong)] px-3 py-2 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-40">
            <Icon name="plus" size={14} /> Add a tier
          </button>
          <button type="button" onClick={() => onChange(DEFAULT_TIER_LOGIC)} disabled={same(logic, DEFAULT_TIER_LOGIC)}
            className="rounded-md px-3 py-2 text-[13px] text-[var(--link)] hover:underline disabled:opacity-40 disabled:no-underline">
            Use the standard tiers
          </button>
        </div>
      </div>

      <div className="flex h-fit flex-col items-center gap-3 rounded-lg bg-[var(--surface-2)] p-4 lg:sticky lg:top-20">
        <Donut size={128} thickness={16} centre={active.length} centreSub="active"
          slices={logic.tiers.map((t, k) => ({ label: t.label, value: counts.get(k + 1) ?? 0, color: tierColor(k + 1, n) }))} />
        <ul className="m-0 w-full list-none p-0 text-[13px]">
          {logic.tiers.map((t, k) => {
            const diff = changeOf(k);
            return (
              <li key={k} className="flex items-center justify-between gap-2 py-0.5">
                <span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: tierColor(k + 1, n) }} /><span className="truncate">{t.label || `Tier ${k + 1}`}</span></span>
                <span className="font-mono">{counts.get(k + 1) ?? 0}{diff !== 0 && <span className="text-[var(--accent-ink)]"> ({diff > 0 ? '+' : ''}{diff})</span>}</span>
              </li>
            );
          })}
        </ul>
        <span className="text-center text-[12px] text-[var(--ink-muted)]">Preview with this logic. Tiers set by hand stay put.</span>
      </div>
    </div>
  );
}

function TierCard({ tier, index, count, clients, change, onChange, onUp, onDown, onRemove }: {
  tier: TierDef; index: number; count: number; clients: number; change: number; onChange: (t: TierDef) => void;
  onUp?: () => void; onDown?: () => void; onRemove?: () => void;
}) {
  const isLast = index === count - 1;
  const style = tierStyle(index + 1);
  const empty = !isLast && tier.all.length === 0 && tier.any.length === 0;
  return (
    <div className={`rounded-lg border bg-[var(--surface)] ${empty ? 'border-[var(--note-fg)]' : 'border-[var(--line)]'}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <span className="grid h-6 min-w-6 place-items-center rounded px-1.5 text-[12px] font-bold" style={{ background: style.bg, color: style.fg }}>{index + 1}</span>
        <input value={tier.label} onChange={(e) => onChange({ ...tier, label: e.target.value })} aria-label={`Name of tier ${index + 1}`}
          placeholder={`Tier ${index + 1}`} maxLength={24}
          className="h-8 w-40 rounded-md border border-transparent bg-transparent px-2 text-[15px] font-semibold text-[var(--ink)] outline-none hover:border-[var(--line-strong)] focus:border-[var(--accent)]" />
        <span className="text-[13px] text-[var(--ink-muted)]">{clients} active{change !== 0 && <span className="text-[var(--accent-ink)]"> ({change > 0 ? '+' : ''}{change})</span>}</span>
        <span className="ml-auto flex items-center gap-0.5">
          {onUp && <IconButton icon="arrowRight" rotate="-rotate-90" label="Move up" onClick={onUp} />}
          {onDown && <IconButton icon="arrowRight" rotate="rotate-90" label="Move down" onClick={onDown} />}
          {onRemove && <IconButton icon="trash" label="Remove this tier" onClick={onRemove} danger />}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <p className={`m-0 text-[13px] ${empty ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}`}>{describeTier(tier, isLast)}</p>
        {!isLast && (
          <>
            <ConditionList title="Must be all of these" conds={tier.all} onChange={(all) => onChange({ ...tier, all })} />
            <ConditionList title="And at least one of these (optional)" conds={tier.any} onChange={(any) => onChange({ ...tier, any })} />
          </>
        )}
      </div>
    </div>
  );
}

function ConditionList({ title, conds, onChange }: { title: string; conds: Condition[]; onChange: (c: Condition[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{title}</span>
      {conds.map((c, i) => (
        <ConditionRow key={i} cond={c} onChange={(x) => onChange(conds.map((y, j) => (j === i ? x : y)))} onRemove={() => onChange(conds.filter((_, j) => j !== i))} />
      ))}
      <button type="button" onClick={() => onChange([...conds, { field: 'uc', op: 'yes' }])}
        className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-[13px] text-[var(--link)] hover:bg-[var(--surface-2)]">
        <Icon name="plus" size={13} /> Add a condition
      </button>
    </div>
  );
}

const selectClass = 'h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)]';

function ConditionRow({ cond, onChange, onRemove }: { cond: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const f = FIELDS[cond.field];
  const setField = (field: CondField) => {
    const op = opsFor(field)[0][0];
    onChange({ field, op, ...(FIELDS[field].kind === 'choice' ? { values: [] } : {}), ...(FIELDS[field].kind === 'number' ? { n: 0 } : {}) });
  };
  const values = cond.values ?? [];
  const toggle = (v: string) => onChange({ ...cond, values: values.includes(v) ? values.filter((x) => x !== v) : [...values, v] });
  const options = Object.entries(f.options ?? {});
  const manyOptions = options.length > 8;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-2 py-1.5">
      <select value={cond.field} onChange={(e) => setField(e.target.value as CondField)} aria-label="Answer" className={selectClass}>
        {(Object.keys(FIELDS) as CondField[]).map((k) => <option key={k} value={k}>{FIELDS[k].label}</option>)}
      </select>
      <select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as Condition['op'] })} aria-label="Test" className={selectClass}>
        {opsFor(cond.field).map(([op, label]) => <option key={op} value={op}>{label}</option>)}
      </select>
      {f.kind === 'number' && cond.op !== 'unknown' && (
        <span className="flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)]">
          {f.unit && <span className="pl-2 font-mono text-[13px] text-[var(--ink-muted)]">{f.unit}</span>}
          <input type="number" min={0} value={cond.n ?? 0} aria-label="Number" onChange={(e) => onChange({ ...cond, n: Number(e.target.value) || 0 })}
            className="h-8 w-20 bg-transparent px-2 font-mono text-[13px] text-[var(--ink)] outline-none" />
        </span>
      )}
      {f.kind === 'choice' && cond.op !== 'unknown' && !manyOptions && options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => toggle(v)} aria-pressed={values.includes(v)}
          className={`rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${
            values.includes(v) ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-[var(--ink-muted)]'}`}>
          {label}
        </button>
      ))}
      {f.kind === 'choice' && cond.op !== 'unknown' && manyOptions && (
        <>
          {values.map((v) => (
            <button key={v} type="button" onClick={() => toggle(v)} title="Remove"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--accent-ink)]">
              {f.options?.[v] ?? v} <Icon name="x" size={11} />
            </button>
          ))}
          <select value="" onChange={(e) => e.target.value && toggle(e.target.value)} aria-label="Add a council" className={selectClass}>
            <option value="">Add…</option>
            {options.filter(([v]) => !values.includes(v)).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove this condition" title="Remove this condition"
        className="ml-auto grid h-7 w-7 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function IconButton({ icon, label, onClick, rotate = '', danger = false }: {
  icon: 'arrowRight' | 'trash'; label: string; onClick: () => void; rotate?: string; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid h-7 w-7 place-items-center rounded text-[var(--ink-muted)] ${danger ? 'hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]' : 'hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'}`}>
      <Icon name={icon} size={14} className={rotate} />
    </button>
  );
}

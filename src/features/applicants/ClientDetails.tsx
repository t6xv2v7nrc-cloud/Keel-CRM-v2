import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Help, Icon, useToast } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useMoveStage, usePeople, useUpdateTriage } from '../../lib/hooks';
import { activeSettings } from '../../lib/settings';
import { computeTier, HOUSEHOLD_LABEL, tierLabel, tierNumbers, tierReason, tierStyle, URGENCY_LABEL, WORK_STATUS_LABEL } from '../../lib/tiering';
import { effectiveTier } from '../../lib/search';
import { confidenceWord, readNotes } from '../../lib/readNotes';
import type { Evidence, Flag, Suggestion } from '../../lib/readNotes';
import type { Applicant } from '../../lib/types';
import type { ApplicantStage } from '../../types/extraction';

const STAGES: Array<[ApplicantStage, string]> = [
  ['lead', 'Lead'], ['referred', 'Referred'], ['viewing', 'Viewing'], ['offer', 'Offer'], ['placed', 'Placed'], ['lost', 'Lost'],
];
const STAGE_ORDER: ApplicantStage[] = ['lead', 'referred', 'viewing', 'offer', 'placed', 'fee_invoiced', 'fee_paid'];
const yesNoWord = (b: boolean | null | undefined) => (b === true ? 'yes' : b === false ? 'no' : 'not known');

/** Everything about a client, edited in one place. Each box saves when you
 *  leave it; the tier follows the answers unless it was set by hand. */
export function ClientDetails({ applicant }: { applicant: Applicant }) {
  const triage = useUpdateTriage();
  const moveStage = useMoveStage();
  const people = usePeople();
  const { toast } = useToast();
  const a = applicant;
  const effective = effectiveTier(a);
  const auto = computeTier(a);
  const locked = a.tier_locked === true || (a.tier_locked === undefined && a.tier != null && a.tier !== auto);
  const canSetTier = people.isOwner || !people.rolesReady || activeSettings().membersCanSetTier;

  /** Save a change, note it on the timeline, and say if the tier moved. */
  const save = (patch: Partial<Applicant>, note: string) => {
    const after = 'tier' in patch ? (patch.tier as number) : locked ? effective : computeTier({ ...a, ...patch });
    triage.mutate({ applicant: a, patch, note }, {
      onSuccess: () => toast(after !== effective ? `${note}. Now ${tierLabel(after)}` : note, 'success'),
      onError: (e) => toast(`Could not save: ${(e as Error).message}`, 'danger'),
    });
  };
  const text = (label: string, key: keyof Applicant) => (v: string) => {
    const value = v.trim() || null;
    if ((a[key] ?? null) === value) return;
    save({ [key]: value } as Partial<Applicant>, value ? `${label} set to ${value}` : `${label} cleared`);
  };
  const number = (label: string, key: 'adults' | 'children' | 'budget_pcm', format = (n: number) => String(n)) => (v: string) => {
    const n = v.trim() === '' ? null : Math.max(0, Math.round(Number(v)));
    if (n !== null && Number.isNaN(n)) return;
    if ((a[key] ?? null) === n) return;
    save({ [key]: n } as Partial<Applicant>, n === null ? `${label} cleared` : `${label} set to ${format(n)}`);
  };

  const changeStage = (to: ApplicantStage) => {
    if (to === a.stage) return;
    const back = to !== 'lost' && a.stage !== 'lost' && STAGE_ORDER.indexOf(to) < STAGE_ORDER.indexOf(a.stage);
    if (back && !window.confirm(`Move ${a.full_name} back from ${a.stage.replace('_', ' ')} to ${to}?`)) return;
    moveStage.mutate({ id: a.id, from: a.stage, to }, {
      onSuccess: () => toast(`Stage set to ${STAGES.find(([s]) => s === to)?.[1] ?? to}`, 'success'),
      onError: (e) => toast(`Could not change the stage: ${(e as Error).message}`, 'danger'),
    });
  };

  const council = a.council || a.referring_borough || '';

  return (
    <Card id="details" className="scroll-mt-20">
      <CardHeader icon="user" title="Client details" help="clientDetails">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)]">
          {triage.isPending || moveStage.isPending ? 'Saving…' : <><Icon name="check" size={13} />Saves as you go</>}
        </span>
      </CardHeader>

      {/* Stage and tier */}
      <div className="grid gap-5 border-b border-[var(--line)] p-5 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">Stage <Help topic="stage" /></span>
          <select value={a.stage} onChange={(e) => changeStage(e.target.value as ApplicantStage)} disabled={moveStage.isPending} aria-label="Stage"
            className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
            {STAGES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
            {!STAGES.some(([s]) => s === a.stage) && <option value={a.stage}>{a.stage.replace('_', ' ')}</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">Tier <Help topic="tiers" /></span>
          <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="group" aria-label="Tier">
            {tierNumbers().map((t) => {
              const on = t === effective;
              const style = tierStyle(t);
              return (
                <button key={t} type="button" aria-pressed={on} disabled={triage.isPending || !canSetTier}
                  onClick={() => !(on && locked) && save({ tier: t, tier_locked: true }, `Tier set to ${tierLabel(t)} by hand`)}
                  className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
                    on ? 'shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] enabled:hover:text-[var(--ink)]'}`}
                  style={on ? { background: style.bg, color: style.fg } : undefined}>
                  {tierLabel(t)}
                </button>
              );
            })}
          </div>
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">
            {locked ? (
              <>Set by hand. The logic would give {tierLabel(auto)}: {tierReason(a)}{' '}
                {canSetTier && <button type="button" onClick={() => save({ tier: auto, tier_locked: false }, `Tier back to the logic (${tierLabel(auto)})`)}
                  className="text-[var(--link)] hover:underline">Use the logic</button>}</>
            ) : (
              <>From the answers below: {tierReason(a)} <Link to="/settings?tab=team" className="text-[var(--link)] hover:underline">See the logic</Link></>
            )}
            {!canSetTier && <> Only {people.ownerName ?? 'the owner'} can set a tier by hand.</>}
          </p>
        </div>
      </div>

      {/* Looking for */}
      <Section icon="search" title="Looking for">
        <Area label="In their own words" value={a.notes ?? ''} rows={4} onSave={text('Notes', 'notes')}
          placeholder="What the client is looking for: area, bedrooms, budget, anything they said" />
        <Box label="Must-haves" value={a.requirements ?? ''} placeholder="e.g. ground floor, near school" onSave={text('Must-haves', 'requirements')} wide />
        <NotesReader applicant={a} save={save} busy={triage.isPending} />
      </Section>

      <div className="grid md:grid-cols-2">
        <Section icon="phone" title="Contact" border="md:border-r">
          <Box label="Full name" value={a.full_name} onSave={(v) => {
            if (!v.trim()) { toast('A client needs a name', 'danger'); return; }
            if (v.trim() !== a.full_name) save({ full_name: v.trim() }, `Name changed to ${v.trim()}`);
          }} />
          <Box label="Phone" value={a.phone ?? ''} mono placeholder="07..." onSave={text('Phone', 'phone')} />
          <Box label="Email" value={a.email ?? ''} placeholder="name@example.com" onSave={text('Email', 'email')} />
        </Section>

        <Section icon="users" title="Household and budget">
          <Row label="Household">
            <Choice value={a.household_type ?? ''} options={[['', 'Not known'], ...Object.entries(HOUSEHOLD_LABEL)]}
              onChange={(v) => save({ household_type: v || null }, `Household set to ${v ? HOUSEHOLD_LABEL[v].toLowerCase() : 'not known'}`)} />
          </Row>
          <Box label="Adults" value={a.adults != null ? String(a.adults) : ''} type="number" onSave={number('Adults', 'adults')} />
          <Box label="Children" value={a.children != null ? String(a.children) : ''} type="number" onSave={number('Children', 'children')} />
          <Box label="Budget pcm" value={a.budget_pcm != null ? String(a.budget_pcm) : ''} type="number" mono prefix="£"
            onSave={number('Budget', 'budget_pcm', (n) => `£${n.toLocaleString('en-GB')}`)} />
          <Box label="LHA band" value={a.lha_band ?? ''} placeholder="e.g. 1-Bed" onSave={text('LHA band', 'lha_band')} />
        </Section>

        <Section icon="layers" title="Benefits and work" border="md:border-r">
          {([['on_uc', 'On UC'], ['pip', 'PIP'], ['lcwra', 'LCWRA']] as const).map(([key, label]) => (
            <Row key={key} label={label}>
              <YesNo value={a[key]} onChange={(v) => save({ [key]: v } as Partial<Applicant>, `${label} set to ${yesNoWord(v)}`)} />
            </Row>
          ))}
          <Box label="Other benefits" value={a.benefit_type ?? ''} placeholder="e.g. HB, ESA" onSave={text('Other benefits', 'benefit_type')} />
          <Row label="Work">
            <Choice value={a.work_status ?? ''} options={[['', 'Not known'], ...Object.entries(WORK_STATUS_LABEL)]}
              onChange={(v) => save({ work_status: v || null }, `Work set to ${v ? WORK_STATUS_LABEL[v].toLowerCase() : 'not known'}`)} />
          </Row>
        </Section>

        <Section icon="home" title="Housing">
          <Box label="Council" value={council} placeholder="e.g. Barnet" onSave={(v) => {
            const value = v.trim() || null;
            if ((council || null) === value) return;
            save({ council: value, referring_borough: value }, value ? `Council set to ${value}` : 'Council cleared');
          }} />
          <Row label="Council-registered">
            <YesNo value={a.council_registered} onChange={(v) => save({ council_registered: v }, `Council-registered set to ${yesNoWord(v)}`)} />
          </Row>
          <Row label="Urgency">
            <Choice value={a.urgency ?? ''} options={[['', 'Not known'], ...Object.entries(URGENCY_LABEL)]}
              onChange={(v) => save({ urgency: v || null }, `Urgency set to ${v ? URGENCY_LABEL[v].toLowerCase() : 'not known'}`)} />
          </Row>
          <Box label="Situation" value={a.housing_situation ?? ''} placeholder="e.g. sofa surfing" onSave={text('Situation', 'housing_situation')} />
          <Row label="Consent to share">
            <YesNo value={a.consent} onChange={(v) => save({ consent: v }, `Consent set to ${yesNoWord(v)}`)} />
          </Row>
        </Section>
      </div>

      <Section icon="user" title="Housing officer" last>
        <div className="grid gap-x-6 md:grid-cols-3">
          <Box label="Name" value={a.officer_name ?? ''} placeholder="Not given" onSave={text('Officer name', 'officer_name')} />
          <Box label="Email" value={a.officer_email ?? ''} placeholder="Not given" onSave={text('Officer email', 'officer_email')} />
          <Box label="Phone" value={a.officer_phone ?? ''} placeholder="Not given" mono onSave={text('Officer phone', 'officer_phone')} />
        </div>
      </Section>
    </Card>
  );
}

// ── Found in their notes ───────────────────────────────────────────

function NotesReader({ applicant, save, busy }: { applicant: Applicant; save: (p: Partial<Applicant>, note: string) => void; busy: boolean }) {
  const reading = useMemo(() => readNotes(applicant), [applicant]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const suggestions = reading.suggestions.filter((s) => !hidden.has(s.id));
  const flags = reading.flags.filter((f) => !hidden.has(f.id));
  const hasText = !!(applicant.notes?.trim() || applicant.requirements?.trim());

  // one per field, highest first, for "Fill in all High"
  const high = suggestions.filter((s) => s.confidence >= 0.8)
    .filter((s, i, list) => list.findIndex((x) => x.field === s.field) === i);
  const applyAll = () => save(Object.assign({}, ...high.map((s) => s.patch)),
    `Filled in from their notes: ${high.map((s) => `${s.field}: ${s.value}`).join('; ')}`);

  if (!hasText && flags.length === 0) return null;

  return (
    <div className="mt-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <Icon name="sparkle" size={16} className="text-[var(--accent)]" />
        <span className="text-[15px] font-semibold text-[var(--ink)]">Found in their notes</span>
        <Help topic="readNotes" />
        <span className="text-[13px] text-[var(--ink-muted)]">{suggestions.length ? `${suggestions.length} to check` : ''}</span>
        {high.length > 1 && (
          <button type="button" onClick={applyAll} disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
            <Icon name="check" size={14} /> Fill in all High ({high.length})
          </button>
        )}
      </div>

      {suggestions.length === 0 && flags.length === 0 ? (
        <p className="m-0 px-4 py-3 text-[13px] text-[var(--ink-muted)]">Nothing new to fill in from their notes.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {flags.map((f) => <FlagRow key={f.id} f={f} busy={busy} onFix={() => f.fix && save(f.fix.patch, f.fix.label === 'Move it to their notes' ? 'Area moved from the Council field to their notes' : f.fix.label)} onHide={() => hide(f.id)} />)}
          {suggestions.map((s) => <SuggestionRow key={s.id} s={s} busy={busy} onUse={() => save(s.patch, `${s.field} set to ${s.value} (read from their notes)`)} onHide={() => hide(s.id)} />)}
        </ul>
      )}

      {reading.understood.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--line)] px-4 py-2.5 text-[13px] text-[var(--ink-muted)]">
          Property matching already reads:
          {reading.understood.map((u) => <span key={u} className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[12px] text-[var(--chip-fg)]">{u}</span>)}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ s, busy, onUse, onHide }: { s: Suggestion; busy: boolean; onUse: () => void; onHide: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] text-[var(--ink-muted)]">{s.field}</span>
          <span className="text-[15px] font-semibold text-[var(--ink)]">{s.value}</span>
          {s.current && <span className="text-[12px] text-[var(--ink-muted)]">(now {s.current})</span>}
          <Accuracy c={s.confidence} />
        </div>
        <Quote e={s.evidence} />
        {s.note && <div className="mt-0.5 text-[12px] text-[var(--note-fg)]">{s.note}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onHide} className="rounded px-2 py-1 text-[13px] text-[var(--ink-muted)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]">Not right</button>
        <button type="button" onClick={onUse} disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)] px-2.5 py-1 text-[13px] font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-soft)] disabled:opacity-50">
          <Icon name="check" size={13} /> Use this
        </button>
      </div>
    </li>
  );
}

function FlagRow({ f, busy, onFix, onHide }: { f: Flag; busy: boolean; onFix: () => void; onHide: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-[var(--line)] bg-[var(--note-bg)] px-4 py-3 last:border-b-0">
      <Icon name="alert" size={16} className="mt-0.5 text-[var(--note-fg)]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[15px] text-[var(--ink)]">{f.text} <Accuracy c={f.confidence} /></div>
        {f.evidence && <Quote e={f.evidence} />}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={onHide} className="rounded px-2 py-1 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Hide</button>
        {f.fix && (
          <button type="button" onClick={onFix} disabled={busy}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-50">
            {f.fix.label}
          </button>
        )}
      </div>
    </li>
  );
}

/** Accuracy rating: percentage, word and a small bar. */
function Accuracy({ c }: { c: number }) {
  const pct = Math.round(c * 100);
  const word = confidenceWord(c);
  const colour = word === 'High' ? 'var(--accent)' : word === 'Medium' ? 'color-mix(in srgb, var(--accent) 45%, var(--paper-2))' : 'var(--ink-faint)';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[12px] text-[var(--ink-muted)]" title={`Accuracy: ${pct}% (${word.toLowerCase()})`}>
      <span className="relative h-1.5 w-8 overflow-hidden rounded-full bg-[var(--paper-2)]">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </span>
      {pct}% {word}
    </span>
  );
}

function Quote({ e }: { e: Evidence }) {
  return (
    <div className="mt-1 text-[13px] leading-relaxed text-[var(--ink-muted)]">
      “{e.before}<mark className="rounded-sm bg-[var(--accent-soft)] px-0.5 text-[var(--ink)]">{e.match}</mark>{e.after}”
    </div>
  );
}

// ── Form pieces ────────────────────────────────────────────────────

function Section({ icon, title, children, border = '', last = false }: { icon: IconName; title: string; children: ReactNode; border?: string; last?: boolean }) {
  return (
    <section className={`flex flex-col gap-1 p-5 ${last ? '' : 'border-b border-[var(--line)]'} ${border} border-[var(--line)]`}>
      <h4 className="m-0 mb-1 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        <Icon name={icon} size={14} /> {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3">
      <span className="shrink-0 text-[15px] text-[var(--ink)]">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

/** A text or number box that saves when you leave it or press Enter. */
function Box({ label, value, onSave, placeholder, mono = false, type = 'text', prefix, wide = false }: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string; mono?: boolean; type?: 'text' | 'number'; prefix?: string; wide?: boolean;
}) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) { setWas(value); setV(value); }
  return (
    <label className={`flex min-h-[44px] items-center justify-between gap-3 ${wide ? 'flex-wrap' : ''}`}>
      <span className="shrink-0 text-[15px] text-[var(--ink)]">{label}</span>
      <span className={`flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-[var(--accent)] ${wide ? 'min-w-[240px] flex-1' : 'w-[220px]'}`}>
        {prefix && <span className="pl-2.5 font-mono text-[15px] text-[var(--ink-muted)]">{prefix}</span>}
        <input value={v} type={type} min={type === 'number' ? 0 : undefined} placeholder={placeholder} aria-label={label}
          onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }}
          className={`h-9 w-full min-w-0 bg-transparent px-2.5 text-[15px] text-[var(--ink)] outline-none ${mono ? 'font-mono' : ''}`} />
      </span>
    </label>
  );
}

function Area({ label, value, onSave, placeholder, rows = 3 }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; rows?: number }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) { setWas(value); setV(value); }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-[var(--ink-muted)]">{label}</span>
      <textarea value={v} rows={rows} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)}
        className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-2.5 text-[15px] leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
    </label>
  );
}

function Choice({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-[220px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/** Yes / No / Not known. */
function YesNo({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const opts: Array<[boolean | null, string]> = [[true, 'Yes'], [false, 'No'], [null, 'Not known']];
  return (
    <div className="inline-flex rounded-md border border-[var(--line-strong)] p-0.5">
      {opts.map(([v, label]) => {
        const on = (value ?? null) === v;
        return (
          <button key={label} type="button" onClick={() => !on && onChange(v)} aria-pressed={on}
            className={`rounded px-2.5 py-1 text-[13px] font-medium transition-colors ${
              on ? (v === true ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--ink)] text-[var(--surface)]') : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

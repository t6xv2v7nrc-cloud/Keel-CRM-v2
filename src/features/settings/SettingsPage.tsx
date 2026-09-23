import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, CardHeader, Donut, Icon, PageHeader, useToast } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useApplicants, useSaveSettings, useSettings } from '../../lib/hooks';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { AppSettings } from '../../lib/settings';
import { computeTier, describeRules, TIER_META, URGENCY_LABEL } from '../../lib/tiering';
import type { Tier } from '../../lib/tiering';
import { isActive } from '../../lib/search';
import { money } from '../../lib/format';
import type { Applicant } from '../../lib/types';

/** A tier set by hand stays; everyone else follows the rules being edited
 *  (the same logic as effectiveTier, for rules not saved yet). */
function tierUnder(a: Applicant, s: AppSettings): Tier {
  const stored = a.tier === 1 || a.tier === 2 || a.tier === 3 ? a.tier : null;
  if (stored && (a.tier_locked || a.tier_locked === undefined)) return stored;
  return computeTier(a, s.tiers);
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** Rules shared by the whole CRM: triage, urgency, matching, calls. */
export function SettingsPage() {
  const { settings, ready, isLoading } = useSettings();
  const save = useSaveSettings();
  const { data: applicants = [] } = useApplicants();
  const { toast } = useToast();
  const [draft, setDraft] = useState<AppSettings>(settings);
  useEffect(() => { if (!isLoading) setDraft(settings); }, [settings, isLoading]);

  const dirty = !same(draft, settings);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const active = useMemo(() => applicants.filter(isActive), [applicants]);
  const tiersNow = useMemo(() => count(active.map((a) => tierUnder(a, settings))), [active, settings]);
  const tiersDraft = useMemo(() => count(active.map((a) => tierUnder(a, draft))), [active, draft]);
  const locked = active.filter((a) => a.tier_locked).length;
  const urgentDraft = active.filter((a) => draft.urgentLevels.includes(a.urgency ?? '')).length;
  const rules = describeRules(draft.tiers);

  const onSave = () => save.mutate(draft, {
    onSuccess: () => toast('Settings saved. Tiers, matches and call lists now use them on every device.', 'success'),
    onError: (e) => toast(`Could not save: ${(e as Error).message}`, 'danger'),
  });

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 p-6 pb-32">
      <PageHeader icon="sliders" title="Settings" sub="Rules used across triage, the pipeline, property matching and calls. Shared by every device." />

      {!ready && (
        <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
          <Icon name="alert" size={20} className="mt-0.5" />
          <div>
            <strong>Settings cannot be saved yet.</strong> In Supabase, open the SQL Editor, paste in{' '}
            <code className="font-mono text-[13px]">supabase/migrations/0005_calls_settings.sql</code> and click Run. The standard rules apply until then.
          </div>
        </div>
      )}

      {/* ── Triage ── */}
      <Card>
        <CardHeader icon="layers" title="Referral triage: tiers" />
        <div className="grid gap-6 p-5 md:grid-cols-[1fr_220px]">
          <div className="flex flex-col gap-5">
            <Rule tier={1} summary={rules.tier1} intro="Tier 1 when the client is all of these:">
              <Toggle on={draft.tiers.tier1.single} label="Single" onChange={(v) => set('tiers', { ...draft.tiers, tier1: { ...draft.tiers.tier1, single: v } })} />
              <Toggle on={draft.tiers.tier1.uc} label="On UC" onChange={(v) => set('tiers', { ...draft.tiers, tier1: { ...draft.tiers.tier1, uc: v } })} />
              <Toggle on={draft.tiers.tier1.pip} label="PIP" onChange={(v) => set('tiers', { ...draft.tiers, tier1: { ...draft.tiers.tier1, pip: v } })} />
              <Toggle on={draft.tiers.tier1.lcwra} label="LCWRA" onChange={(v) => set('tiers', { ...draft.tiers, tier1: { ...draft.tiers.tier1, lcwra: v } })} />
              <Toggle on={draft.tiers.tier1.councilRegistered} label="Council-registered" onChange={(v) => set('tiers', { ...draft.tiers, tier1: { ...draft.tiers.tier1, councilRegistered: v } })} />
            </Rule>
            <Rule tier={2} summary={rules.tier2} intro="Otherwise Tier 2 when the client is">
              <Toggle on={draft.tiers.tier2.councilRegistered} label="Council-registered" onChange={(v) => set('tiers', { ...draft.tiers, tier2: { ...draft.tiers.tier2, councilRegistered: v } })} />
              <span className="self-center text-[13px] text-[var(--ink-muted)]">and any of</span>
              <Toggle on={draft.tiers.tier2.uc} label="On UC" onChange={(v) => set('tiers', { ...draft.tiers, tier2: { ...draft.tiers.tier2, uc: v } })} />
              <Toggle on={draft.tiers.tier2.fullTime} label="Full-time work" onChange={(v) => set('tiers', { ...draft.tiers, tier2: { ...draft.tiers.tier2, fullTime: v } })} />
              <Toggle on={draft.tiers.tier2.partTime} label="Part-time work" onChange={(v) => set('tiers', { ...draft.tiers, tier2: { ...draft.tiers.tier2, partTime: v } })} />
              <Toggle on={draft.tiers.tier2.pip} label="PIP" onChange={(v) => set('tiers', { ...draft.tiers, tier2: { ...draft.tiers.tier2, pip: v } })} />
            </Rule>
            <p className="m-0 text-[13px] text-[var(--ink-muted)]">
              Everyone else is Tier 3. A tier you set by hand on a client stays as it is{locked ? ` (${locked} active ${locked === 1 ? 'client' : 'clients'})` : ''}.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-lg bg-[var(--surface-2)] p-4">
            <Donut size={128} thickness={16} centre={active.length} centreSub="active"
              slices={([1, 2, 3] as Tier[]).map((t) => ({ label: `Tier ${t}`, value: tiersDraft[t], color: TIER_COLOR[t] }))} />
            <ul className="m-0 w-full list-none p-0 text-[13px]">
              {([1, 2, 3] as Tier[]).map((t) => (
                <li key={t} className="flex items-center justify-between py-0.5">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TIER_COLOR[t] }} />{TIER_META[t].label}</span>
                  <span className="font-mono">
                    {tiersDraft[t]}
                    {tiersDraft[t] !== tiersNow[t] && <span className="text-[var(--accent-ink)]"> ({tiersDraft[t] > tiersNow[t] ? '+' : ''}{tiersDraft[t] - tiersNow[t]})</span>}
                  </span>
                </li>
              ))}
            </ul>
            <span className="text-center text-[12px] text-[var(--ink-muted)]">Preview with these rules</span>
          </div>
        </div>
      </Card>

      {/* ── Urgency ── */}
      <Card>
        <CardHeader icon="alert" title="Referral triage: urgency" sub={`${urgentDraft} active flagged`} />
        <div className="flex flex-col gap-3 p-5">
          <p className="m-0 text-[15px] text-[var(--ink-muted)]">Urgent clients are flagged, sorted first in the pipeline and call list, and ranked higher for properties.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(URGENCY_LABEL).filter(([k]) => k !== 'none').map(([k, label]) => (
              <Toggle key={k} on={draft.urgentLevels.includes(k)} label={label}
                onChange={(v) => set('urgentLevels', v ? [...draft.urgentLevels, k] : draft.urgentLevels.filter((x) => x !== k))} />
            ))}
          </div>
        </div>
      </Card>

      {/* ── Matching ── */}
      <Card>
        <CardHeader icon="building" title="Property matching" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="flag" title="Premium properties" text={`Anything over ${money(draft.premiumRent)} pcm is always offered to these clients, whatever their budget or area.`}>
            <NumberField label="Rent over" prefix="£" value={draft.premiumRent} min={0} step={50} onChange={(v) => set('premiumRent', v)} />
          </Row>
          <div className="flex flex-wrap gap-2 pl-11">
            <Toggle on={draft.premiumFor.pip} label="PIP (alone, or with UC or LCWRA)" onChange={(v) => set('premiumFor', { ...draft.premiumFor, pip: v })} />
            <Toggle on={draft.premiumFor.fullTime} label="Full-time work" onChange={(v) => set('premiumFor', { ...draft.premiumFor, fullTime: v })} />
            <Toggle on={draft.premiumFor.lcwra} label="LCWRA" onChange={(v) => set('premiumFor', { ...draft.premiumFor, lcwra: v })} />
            <Toggle on={draft.premiumFor.partTime} label="Part-time work" onChange={(v) => set('premiumFor', { ...draft.premiumFor, partTime: v })} />
          </div>
          <Row icon="sparkle" title="Show Possible matches" text="Possible matches are a looser fit (another area, or area not stated). Turn off to see only Good and Strong.">
            <Switch on={draft.showPossibleMatches} onChange={(v) => set('showPossibleMatches', v)} label="Show Possible matches" />
          </Row>
          <Row icon="trash" title="Old property lists" text="The Saved lists panel offers to purge lists older than this.">
            <NumberField label="Days" value={draft.purgeAfterDays} min={1} onChange={(v) => set('purgeAfterDays', v)} />
          </Row>
        </div>
      </Card>

      {/* ── Calls ── */}
      <Card>
        <CardHeader icon="phone" title="Calls" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="phoneMissed" title="After no answer" text="Suggested follow-up when a call is not answered, goes to voicemail or is busy.">
            <NumberField label="Days" value={draft.callAgainAfterNoAnswer} min={0} onChange={(v) => set('callAgainAfterNoAnswer', v)} />
          </Row>
          <Row icon="check" title="After a good call" text="Suggested follow-up when the client answers.">
            <NumberField label="Days" value={draft.callAgainAfterAnswered} min={0} onChange={(v) => set('callAgainAfterAnswered', v)} />
          </Row>
          <Row icon="user" title="First call for new clients" text="A new client not called within this many days of arriving shows as overdue on the Calls page.">
            <NumberField label="Days" value={draft.firstCallWithinDays} min={0} onChange={(v) => set('firstCallWithinDays', v)} />
          </Row>
        </div>
      </Card>

      {/* Save bar */}
      <div className={`${dirty ? 'sticky bottom-4 z-10 shadow-[var(--shadow-pop)]' : 'shadow-[var(--shadow-card)]'} flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 py-3`}>
        <span className="text-[15px] text-[var(--ink-muted)]">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDraft(DEFAULT_SETTINGS)} disabled={same(draft, DEFAULT_SETTINGS)}>Use standard rules</Button>
          {dirty && <Button onClick={() => setDraft(settings)}>Undo changes</Button>}
          <Button variant="primary" onClick={onSave} disabled={!dirty || !ready || save.isPending}>
            <Icon name="check" size={16} />{save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const TIER_COLOR: Record<Tier, string> = { 1: 'var(--accent)', 2: 'color-mix(in srgb, var(--accent) 45%, var(--paper-2))', 3: 'var(--ink-faint)' };

function count(tiers: Tier[]): Record<Tier, number> {
  const c: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const t of tiers) c[t] += 1;
  return c;
}

function Rule({ tier, intro, summary, children }: { tier: Tier; intro: string; summary: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded px-2 py-0.5 text-[13px] font-semibold" style={{ background: TIER_META[tier].bg, color: TIER_META[tier].fg }}>{TIER_META[tier].label}</span>
        <span className="text-[15px] text-[var(--ink)]">{intro}</span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
      <div className="text-[13px] text-[var(--ink-muted)]">In short: <strong className="font-medium text-[var(--ink)]">{summary}</strong></div>
    </div>
  );
}

/** A pill that is ticked or not. */
function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
        on ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
      <span className={`grid h-4 w-4 place-items-center rounded-full ${on ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'border border-[var(--line-strong)]'}`}>
        {on && <Icon name="check" size={11} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--paper-2)]'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-[var(--surface)] shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function Row({ icon, title, text, children }: { icon: IconName; title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name={icon} size={16} /></span>
      <div className="min-w-[220px] flex-1">
        <div className="text-[15px] font-medium text-[var(--ink)]">{title}</div>
        <div className="text-[13px] text-[var(--ink-muted)]">{text}</div>
      </div>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange, min, step = 1, prefix }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; prefix?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <span className="flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-[var(--accent)]">
        {prefix && <span className="pl-2.5 font-mono text-[15px] text-[var(--ink-muted)]">{prefix}</span>}
        <input type="number" value={value} min={min} step={step} aria-label={label}
          onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(Math.max(min ?? -Infinity, n)); }}
          className="h-10 w-24 bg-transparent px-2.5 font-mono text-[15px] text-[var(--ink)] outline-none" />
      </span>
    </label>
  );
}

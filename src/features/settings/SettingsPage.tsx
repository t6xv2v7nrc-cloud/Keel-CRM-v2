import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Button, Card, CardHeader, Help, Icon, PageHeader, useToast } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useApplicants, useCalls, useHandOver, usePeople, useSaveProfile, useSaveSettings, useSettings } from '../../lib/hooks';
import { DEFAULT_SETTINGS, myPart, teamPart } from '../../lib/settings';
import type { AppSettings } from '../../lib/settings';
import { URGENCY_LABEL } from '../../lib/tiering';
import { TierLogicEditor } from './TierLogicEditor';
import { LhaSettings } from './LhaSettings';
import { WhatsAppSettings } from './WhatsAppSettings';
import { isActive } from '../../lib/search';
import { addDays, isoDay } from '../../lib/calls';
import { money } from '../../lib/format';

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

type Tab = 'me' | 'team' | 'people';
const TABS: Array<{ key: Tab; label: string; icon: IconName; who: string }> = [
  { key: 'me', label: 'My settings', icon: 'user', who: 'Only you' },
  { key: 'team', label: 'Team settings', icon: 'users', who: 'Everyone' },
  { key: 'people', label: 'Team', icon: 'users', who: '' },
];

/** My settings (only me), team settings (everyone) and who is on the team. */
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'team' ? 'team' : params.get('tab') === 'people' ? 'people' : 'me';
  const { settings, ready, isLoading } = useSettings();
  const people = usePeople();
  const save = useSaveSettings();
  const saveProfile = useSaveProfile();
  const { toast } = useToast();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [name, setName] = useState('');
  useEffect(() => { if (!isLoading) setDraft(settings); }, [settings, isLoading]);
  useEffect(() => { setName(people.myName ?? ''); }, [people.myName]);

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const nameDirty = people.ready && name.trim() !== (people.myName ?? '') && name.trim() !== '';
  const myDirty = !same(myPart(draft), myPart(settings)) || nameDirty;
  const teamDirty = !same(teamPart(draft), teamPart(settings));

  const saveMine = async () => {
    try {
      if (!same(myPart(draft), myPart(settings))) await save.mutateAsync({ scope: 'me', value: draft });
      if (nameDirty) await saveProfile.mutateAsync(name);
      toast('Your settings are saved. They only change Keel for you.', 'success');
    } catch (e) { toast(`Could not save: ${(e as Error).message}`, 'danger'); }
  };
  const saveTeam = () => save.mutate({ scope: 'team', value: draft }, {
    onSuccess: () => toast('Team settings saved. Tiers, urgent flags and matches now use them for everyone.', 'success'),
    onError: (e) => toast(`Could not save: ${(e as Error).message}`, 'danger'),
  });

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 p-6 pb-32">
      <PageHeader icon="sliders" title="Settings" sub="Your own preferences, the rules you both work to, and who is on the team." />

      {!ready && (
        <UpdateNote file="0005_calls_settings.sql">Settings cannot be saved yet. The standard rules apply until then.</UpdateNote>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="tablist">
        {TABS.map((t) => {
          const on = t.key === tab;
          const dirty = t.key === 'me' ? myDirty : t.key === 'team' ? teamDirty : false;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => setParams(t.key === 'me' ? {} : { tab: t.key }, { replace: true })}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[15px] transition-colors ${
                on ? 'bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
              <Icon name={t.icon} size={16} />
              {t.label}
              {t.who && <span className="hidden rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--chip-fg)] sm:inline">{t.who}</span>}
              {dirty && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" title="Unsaved changes" />}
            </button>
          );
        })}
      </div>

      {tab === 'me' && (
        <MySettingsTab draft={draft} set={set} name={name} setName={setName} teamReady={people.ready}
          email={people.members.find((m) => m.id === people.meId)?.email ?? null} />
      )}
      {tab === 'team' && <TeamSettingsTab draft={draft} set={set} saved={settings} canEdit={people.canEditTeam} ownerName={people.ownerName} rolesReady={people.rolesReady} />}
      {tab === 'people' && <PeopleTab />}

      {(tab === 'me' || (tab === 'team' && people.canEditTeam)) && (
        <SaveBar
          dirty={tab === 'me' ? myDirty : teamDirty}
          who={tab === 'me' ? 'only you' : 'everyone'}
          saving={save.isPending || saveProfile.isPending}
          disabled={!ready}
          onUndo={() => { setDraft(settings); setName(people.myName ?? ''); }}
          onStandard={tab === 'team' ? () => setDraft({ ...draft, ...teamPart(DEFAULT_SETTINGS) }) : () => setDraft({ ...draft, ...myPart(DEFAULT_SETTINGS) })}
          standardLabel={tab === 'team' ? 'Use standard rules' : 'Use standard settings'}
          isStandard={tab === 'team' ? same(teamPart(draft), teamPart(DEFAULT_SETTINGS)) : same(myPart(draft), myPart(DEFAULT_SETTINGS))}
          onSave={tab === 'me' ? saveMine : saveTeam}
          saveLabel={tab === 'me' ? 'Save my settings' : 'Save team settings'}
        />
      )}
    </div>
  );
}

// ── My settings ────────────────────────────────────────────────────

const START_PAGES: Array<[AppSettings['startPage'], string]> = [
  ['/', 'Home'], ['/calls', 'Calls'], ['/pipeline', 'Pipeline'], ['/bin', 'The Bin'], ['/properties', 'Properties'],
];

function MySettingsTab({ draft, set, name, setName, teamReady, email }: {
  draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
  name: string; setName: (v: string) => void; teamReady: boolean; email: string | null;
}) {
  return (
    <>
      <WhoNote icon="user">These only change Keel for you. Your co-worker has their own.</WhoNote>
      <Card>
        <CardHeader icon="user" title="You" help="mySettings" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="pencil" title="Your name" text={`Shown to your co-worker next to calls and changes you make${email ? ` (signed in as ${email})` : ''}.`}>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!teamReady} placeholder="e.g. Ridwan" aria-label="Your name"
              className="h-10 w-48 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50" />
          </Row>
          {!teamReady && <UpdateNote file="0006_team.sql">Names, assigning clients and "who did what" need a one-off database update.</UpdateNote>}
          <Row icon="home" title="Start page" text="The page Keel opens on when you sign in.">
            <select value={draft.startPage} onChange={(e) => set('startPage', e.target.value as AppSettings['startPage'])} aria-label="Start page"
              className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
              {START_PAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Row>
        </div>
      </Card>

      <Card>
        <CardHeader icon="phone" title="Your calls" help="logCall" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="users" title="Calls page shows first" text="Everyone's clients, or only the ones assigned to you. You can switch on the Calls page at any time.">
            <Segmented value={draft.callsView} onChange={(v) => set('callsView', v)} options={[['everyone', 'Everyone'], ['mine', 'Only mine']]} />
          </Row>
          <Row icon="phoneMissed" title="Call again after no answer" text="Suggested follow-up when a call is not answered, goes to voicemail or is busy.">
            <NumberField label="Days" value={draft.callAgainAfterNoAnswer} min={0} onChange={(v) => set('callAgainAfterNoAnswer', v)} />
          </Row>
          <Row icon="check" title="Call again after a good call" text="Suggested follow-up when the client answers.">
            <NumberField label="Days" value={draft.callAgainAfterAnswered} min={0} onChange={(v) => set('callAgainAfterAnswered', v)} />
          </Row>
        </div>
      </Card>

      <Card>
        <CardHeader icon="building" title="Your property matches" help="matchStrength" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="sparkle" title="Show Possible matches" text="Possible matches are a looser fit (another area, or area not stated). Turn off to see only Good and Strong.">
            <Switch on={draft.showPossibleMatches} onChange={(v) => set('showPossibleMatches', v)} label="Show Possible matches" />
          </Row>
        </div>
      </Card>

      <p className="m-0 flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
        <Icon name="moon" size={14} /> Light or dark mode is set on each device with the moon button at the top.
      </p>
    </>
  );
}

// ── Team settings ──────────────────────────────────────────────────

function TeamSettingsTab({ draft, set, saved, canEdit, ownerName, rolesReady }: {
  draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void; saved: AppSettings;
  canEdit: boolean; ownerName: string | null; rolesReady: boolean;
}) {
  const { data: applicants = [] } = useApplicants();
  const active = useMemo(() => applicants.filter(isActive), [applicants]);
  const urgentDraft = active.filter((a) => draft.urgentLevels.includes(a.urgency ?? '')).length;

  return (
    <fieldset disabled={!canEdit} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
      {canEdit ? (
        <WhoNote icon="users">
          These rules apply to everyone. Changing them updates tiers, urgent flags and matches for all of you straight away.
          {rolesReady ? ' Only you, as the owner, can change them.' : ''}
        </WhoNote>
      ) : (
        <WhoNote icon="key">Only {ownerName ?? 'the owner'} can change team settings. You can see them here, and set your own preferences under My settings.</WhoNote>
      )}
      {!rolesReady && <UpdateNote file="0007_owner.sql">Right now anyone signed in can change team settings. To make them yours alone, run a one-off database update.</UpdateNote>}

      <Card>
        <CardHeader icon="layers" title="Referral triage: tier logic" help="tiers" />
        <div className="flex flex-col gap-4 p-5">
          <p className="m-0 text-[15px] text-[var(--ink-muted)]">
            Tiers are checked from the top. A client gets the first tier whose conditions they meet; the last tier is everyone else.
            Add, rename, reorder or remove tiers as the business changes.
          </p>
          <TierLogicEditor logic={draft.tierLogic} saved={saved.tierLogic} onChange={(l) => set('tierLogic', l)} active={active} />
          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name="pencil" size={16} /></span>
            <div className="min-w-[220px] flex-1">
              <div className="text-[15px] font-medium text-[var(--ink)]">Co-workers can set a tier by hand</div>
              <div className="text-[13px] text-[var(--ink-muted)]">When off, only the owner can override a client's tier on the client page.</div>
            </div>
            <Switch on={draft.membersCanSetTier} onChange={(v) => set('membersCanSetTier', v)} label="Co-workers can set a tier by hand" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon="alert" title="Referral triage: urgency" sub={`${urgentDraft} active flagged`} help="urgent" />
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

      <Card>
        <CardHeader icon="building" title="Property matching" help="matchStrength" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="flag" title="Premium properties" text={`Anything over ${money(draft.premiumRent)} pcm is always offered to these clients, whatever their budget or area.`}>
            <NumberField label="Rent over" prefix="£" value={draft.premiumRent} min={0} step={50} onChange={(v) => set('premiumRent', v)} />
          </Row>
          <div className="flex flex-wrap gap-2 pl-12">
            <Toggle on={draft.premiumFor.pip} label="PIP (alone, or with UC or LCWRA)" onChange={(v) => set('premiumFor', { ...draft.premiumFor, pip: v })} />
            <Toggle on={draft.premiumFor.fullTime} label="Full-time work" onChange={(v) => set('premiumFor', { ...draft.premiumFor, fullTime: v })} />
            <Toggle on={draft.premiumFor.lcwra} label="LCWRA" onChange={(v) => set('premiumFor', { ...draft.premiumFor, lcwra: v })} />
            <Toggle on={draft.premiumFor.partTime} label="Part-time work" onChange={(v) => set('premiumFor', { ...draft.premiumFor, partTime: v })} />
          </div>
          <Row icon="trash" title="Old property lists" text="The Saved lists panel offers to purge lists older than this.">
            <NumberField label="Days" value={draft.purgeAfterDays} min={1} onChange={(v) => set('purgeAfterDays', v)} />
          </Row>
        </div>
      </Card>

      <LhaSettings draft={draft} set={set} />

      <WhatsAppSettings draft={draft} set={set} />

      <Card>
        <CardHeader icon="phone" title="Calls" help="calls" />
        <div className="flex flex-col gap-5 p-5">
          <Row icon="user" title="First call for new clients" text="A new client not called within this many days of arriving shows as overdue on the Calls page for both of you.">
            <NumberField label="Days" value={draft.firstCallWithinDays} min={0} onChange={(v) => set('firstCallWithinDays', v)} />
          </Row>
          <p className="m-0 pl-12 text-[13px] text-[var(--ink-muted)]">How long to wait before calling again is a personal setting, under My settings.</p>
        </div>
      </Card>
    </fieldset>
  );
}

// ── Team ───────────────────────────────────────────────────────────

function PeopleTab() {
  const people = usePeople();
  const { data: applicants = [] } = useApplicants();
  const { calls } = useCalls();
  const weekStart = addDays(-6);
  const stats = (id: string) => ({
    clients: applicants.filter((a) => a.assigned_to === id && isActive(a)).length,
    calls: calls.filter((c) => c.created_by === id && isoDay(new Date(c.created_at)) >= weekStart).length,
  });
  const unassigned = applicants.filter((a) => isActive(a) && !a.assigned_to).length;

  return (
    <>
      {!people.ready && <UpdateNote file="0006_team.sql">The team list, names and assigning clients need a one-off database update.</UpdateNote>}

      <Card>
        <CardHeader icon="users" title="Who can sign in" sub={String(people.members.length)} help="team" />
        {people.members.length === 0 ? (
          <p className="m-0 p-5 text-[15px] text-[var(--ink-muted)]">Nobody yet. Each person appears here the first time they sign in after the update.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {people.members.map((m) => {
              const s = stats(m.id);
              const name = people.nameOf(m.id) ?? 'Someone';
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-b-0">
                  <Avatar name={name} size={40} accent={m.id === people.meId} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[15px] font-medium text-[var(--ink)]">
                      {name}
                      {m.id === people.meId && <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)]">You</span>}
                      {m.role === 'owner' && <span className="inline-flex items-center gap-1 rounded bg-[var(--ink)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--surface)]"><Icon name="key" size={11} />Owner</span>}
                    </div>
                    <div className="truncate text-[13px] text-[var(--ink-muted)]">{m.email}</div>
                  </div>
                  {people.isOwner && m.id !== people.meId && (
                    <HandOver toId={m.id} toName={name} meId={people.meId!} />
                  )}
                  <div className="flex gap-5 text-center">
                    <div><div className="font-mono text-[18px] font-semibold text-[var(--ink)]">{s.clients}</div><div className="text-[12px] text-[var(--ink-muted)]">clients</div></div>
                    <div><div className="font-mono text-[18px] font-semibold text-[var(--ink)]">{s.calls}</div><div className="text-[12px] text-[var(--ink-muted)]">calls this week</div></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {people.ready && (
          <div className="border-t border-[var(--line)] px-5 py-3 text-[13px] text-[var(--ink-muted)]">
            {unassigned} active {unassigned === 1 ? 'client is' : 'clients are'} not assigned to anyone yet.
          </div>
        )}
      </Card>

      <Card>
        <CardHeader icon="plus" title="Adding a co-worker">
          <Help title="Why invite only?">
            <p className="m-0">Keel holds clients' personal details, so only people you invite should be able to sign in. The sign-in page no longer creates new accounts.</p>
          </Help>
        </CardHeader>
        <ol className="m-0 flex list-none flex-col gap-3 p-5">
          {[
            'Open your Supabase project and go to Authentication, then Users.',
            'Choose Invite user and enter your co-worker\'s email. They get an email with a sign-in link.',
            'Once in, they can set a password from the round account button at the top right, and their name under My settings.',
            'In Authentication, then Sign In / Providers, turn off "Allow new users to sign up" so nobody else can create an account.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-[var(--ink)]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[13px] font-semibold text-[var(--accent-ink)]">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────

function WhoNote({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[15px] text-[var(--ink)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]"><Icon name={icon} size={16} /></span>
      {children}
    </div>
  );
}

function UpdateNote({ file, children }: { file: string; children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
      <Icon name="alert" size={20} className="mt-0.5" />
      <div>
        {children} In Supabase, open the SQL Editor, paste in <code className="font-mono text-[13px]">supabase/migrations/{file}</code> and click Run.
      </div>
    </div>
  );
}

function SaveBar({ dirty, who, saving, disabled, onUndo, onStandard, standardLabel, isStandard, onSave, saveLabel }: {
  dirty: boolean; who: string; saving: boolean; disabled: boolean; onUndo: () => void; onStandard: () => void;
  standardLabel: string; isStandard: boolean; onSave: () => void; saveLabel: string;
}) {
  return (
    <div className={`${dirty ? 'sticky bottom-4 z-10 shadow-[var(--shadow-pop)]' : 'shadow-[var(--shadow-card)]'} flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-5 py-3`}>
      <span className="text-[15px] text-[var(--ink-muted)]">{dirty ? `Unsaved changes. Saving affects ${who}.` : 'All changes saved.'}</span>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onStandard} disabled={isStandard}>{standardLabel}</Button>
        {dirty && <Button onClick={onUndo}>Undo changes</Button>}
        <Button variant="primary" onClick={onSave} disabled={!dirty || disabled || saving}>
          <Icon name="check" size={16} />{saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
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

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="inline-flex rounded-md border border-[var(--line-strong)] p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={v === value}
          className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${v === value ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
          {l}
        </button>
      ))}
    </div>
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

/** The owner hands control of team settings to someone else. */
function HandOver({ toId, toName, meId }: { toId: string; toName: string; meId: string }) {
  const hand = useHandOver();
  const { toast } = useToast();
  const go = () => {
    if (!window.confirm(`Make ${toName} the owner? They will control team settings (tier logic, urgency, matching rules) and you will become a member.`)) return;
    hand.mutate({ toId, meId }, {
      onSuccess: () => toast(`${toName} is now the owner`, 'success'),
      onError: (e) => toast(`Could not hand over: ${(e as Error).message}`, 'danger'),
    });
  };
  return (
    <button type="button" onClick={go} disabled={hand.isPending}
      className="rounded-md border border-[var(--line-strong)] px-2.5 py-1 text-[12px] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]">
      Make owner
    </button>
  );
}

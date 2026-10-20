import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Icon, PageHeader } from '../../components/ui';
import { useOfficers, useOutlook, usePeople, useProperties, useSettings } from '../../lib/hooks';
import { lhaVerified } from '../../lib/lha';
import { missingBusiness } from '../../lib/business';
import { pushState } from '../../lib/push';
import { gettingStarted, TIPS, WHATS_NEW } from '../../lib/guide';
import type { TipId } from '../../lib/guide';
import { fullDate } from '../../lib/format';

// what each person has seen or put away, kept on this device
const read = (key: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]); } catch { return new Set(); } };
const write = (key: string, set: Set<string>) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* fine */ } };
const TIPS_KEY = 'keel.tips.seen';
const NEW_KEY = 'keel.whatsnew.seen';
const GUIDE_KEY = 'keel.guide.hidden';

/** Show the Getting started list again (from the account menu). */
export function showGettingStarted() { try { localStorage.removeItem(GUIDE_KEY); } catch { /* fine */ } }

// ── Getting started (Home) ─────────────────────────────────────────

/** The setting-up steps, ticking themselves off from what Keel holds. Goes once all are done, or when put away. */
export function GettingStarted() {
  const people = usePeople();
  const { settings } = useSettings();
  const { data: properties = [], isLoading } = useProperties();
  const { officers } = useOfficers();
  const { configured, account } = useOutlook();
  const [pushOn, setPushOn] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return false; } });
  useEffect(() => { pushState().then((s) => setPushOn(s.kind === 'on'), () => {}); }, []);
  if (hidden || isLoading) return null;
  const steps = gettingStarted({
    myName: people.myName, lhaFromGovUk: lhaVerified(), businessMissing: missingBusiness(settings.business).length, properties: properties.length,
    officers: officers.length, outlookSetUp: configured, outlookConnected: !!account, pushOn, people: people.members.length,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <Card fold="home.gettingstarted">
      <CardHeader icon="flag" title="Getting started" sub={`${done} of ${steps.length} done`}>
        <button type="button" onClick={() => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* fine */ } setHidden(true); }}
          className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Put this away</button>
      </CardHeader>
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--paper-2)]" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Steps done">
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
          {steps.map((s) => {
            const isNext = s === next;
            const notMine = s.owner && !people.canEditTeam && !s.done;
            return (
              <li key={s.id}>
                <Link to={s.href} className={`flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-[var(--surface-2)] ${isNext ? 'bg-[var(--accent-soft)]' : ''}`}>
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${s.done ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : isNext ? 'border-[var(--accent)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-transparent'}`}>
                    <Icon name="check" size={13} strokeWidth={3} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[14px] font-medium ${s.done ? 'text-[var(--ink-muted)] line-through decoration-[var(--line-strong)]' : 'text-[var(--ink)]'}`}>{s.title}</span>
                    {!s.done && <span className="block text-[13px] leading-snug text-[var(--ink-muted)]">{notMine ? `${people.ownerName ?? 'The owner'} does this, in Team settings. ` : ''}{s.why}</span>}
                  </span>
                  {isNext && <Icon name="arrowRight" size={15} className="ml-auto mt-1 text-[var(--accent-ink)]" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

// ── What's new ─────────────────────────────────────────────────────

/** On Home while there is something new this person has not seen: the newest few, and Got it. */
export function WhatsNewCard() {
  const [seen, setSeen] = useState(() => read(NEW_KEY));
  const unseen = WHATS_NEW.filter((n) => !seen.has(n.id));
  if (!unseen.length) return null;
  const gotIt = () => { const all = new Set(WHATS_NEW.map((n) => n.id)); write(NEW_KEY, all); setSeen(all); };
  return (
    <Card>
      <CardHeader icon="gift" title="What's new in Keel" sub={`${unseen.length} ${unseen.length === 1 ? 'change' : 'changes'}`}>
        <Link to="/whats-new" className="text-[13px] text-[var(--link)] hover:underline">See them all</Link>
        <button type="button" onClick={gotIt} className="rounded-md border border-[var(--line-strong)] px-3 py-1 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">Got it</button>
      </CardHeader>
      <ul className="keel-stagger m-0 grid list-none gap-3 p-5 sm:grid-cols-3">
        {unseen.slice(0, 3).map((n) => (
          <li key={n.id} className="flex flex-col gap-1 rounded-lg bg-[var(--surface-2)] p-3">
            <span className="text-[14px] font-semibold text-[var(--ink)]">{n.title}</span>
            <span className="text-[13px] leading-snug text-[var(--ink-muted)]">{n.body}</span>
            {n.href && <Link to={n.href} className="mt-auto pt-1 text-[13px] font-medium text-[var(--link)] hover:underline">Show me</Link>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Everything new, newest first (from the account menu). Opening it counts as seen. */
export function WhatsNewPage() {
  useEffect(() => write(NEW_KEY, new Set(WHATS_NEW.map((n) => n.id))), []);
  const days = [...new Set(WHATS_NEW.map((n) => n.date))];
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5 p-4 pb-24 sm:p-6">
      <PageHeader icon="gift" title="What's new" sub="Changes to Keel, newest first" />
      {days.map((d) => (
        <section key={d} className="flex flex-col gap-3">
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{fullDate(d)}</h2>
          <ul className="keel-stagger m-0 flex list-none flex-col gap-3 p-0">
            {WHATS_NEW.filter((n) => n.date === d).map((n) => (
              <li key={n.id}>
                <Card className="flex flex-col gap-1.5 p-4">
                  <span className="text-[16px] font-semibold text-[var(--ink)]">{n.title}</span>
                  <span className="text-[14px] text-[var(--ink-muted)]">{n.body}</span>
                  {(n.where || n.href) && (
                    <span className="flex flex-wrap items-center gap-x-3 text-[13px]">
                      {n.where && <span className="text-[var(--ink-muted)]">Where: {n.where}</span>}
                      {n.href && <Link to={n.href} className="font-medium text-[var(--link)] hover:underline">Show me</Link>}
                    </span>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ── Tips ───────────────────────────────────────────────────────────

/** What to know first on a page, shown until Got it (then never again on this device). */
export function Tip({ id }: { id: TipId }) {
  const [seen, setSeen] = useState(() => read(TIPS_KEY).has(id));
  if (seen) return null;
  const gotIt = () => { const s = read(TIPS_KEY); s.add(id); write(TIPS_KEY, s); setSeen(true); };
  return (
    <div role="note" className="keel-rise flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)]">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--note-bg)] text-[var(--note-fg)]"><Icon name="bulb" size={15} /></span>
      <p className="m-0 min-w-0 flex-1 text-[14px] leading-snug text-[var(--ink)]"><strong className="font-semibold">Tip: </strong>{TIPS[id]}</p>
      <button type="button" onClick={gotIt} className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-[var(--link)] hover:bg-[var(--surface-2)]">Got it</button>
    </div>
  );
}

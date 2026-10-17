import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { useCouncilSchemes, useProperties, useUpdateTriage } from '../../lib/hooks';
import { useFold } from '../../lib/collapse';
import { profileOf, RATE_TYPE_WORDS } from '../../lib/clientProfile';
import type { Known, Source } from '../../lib/clientProfile';
import { sizeWords } from '../../lib/lha';
import { money } from '../../lib/format';
import { HOUSEHOLD_LABEL } from '../../lib/tiering';
import type { Applicant } from '../../lib/types';

const SOURCE_WORDS: Record<Source, string> = { recorded: 'recorded', read: 'read from their message', 'worked out': 'worked out', 'not known': 'not known' };

/** Everything known or worked out about a client, and where they can be placed: the client's profile. */
export function ProfileCard({ applicant: a }: { applicant: Applicant }) {
  const { data: properties = [] } = useProperties();
  const { schemes } = useCouncilSchemes();
  const triage = useUpdateTriage();
  const { toast } = useToast();
  const fold = useFold('client.profile');
  const p = useMemo(() => profileOf(a, { properties, schemes }), [a, properties, schemes]);

  const fillIn = () => {
    const patch = Object.assign({}, ...p.sureAnswers.map((s) => s.patch)) as Partial<Applicant>;
    const note = `Filled in from their notes: ${p.sureAnswers.map((s) => `${s.field} ${s.value}`).join(', ')}`;
    triage.mutate({ applicant: a, patch, note }, {
      onSuccess: () => toast(note, 'success'),
      onError: (e) => toast(`Could not save: ${(e as Error).message}`, 'danger'),
    });
  };
  const fit = p.places.reduce((s, x) => s + x.fits, 0);
  const sub = [
    p.household.value ? HOUSEHOLD_LABEL[p.household.value] : null,
    p.size.value ? `${sizeWords(p.size.value)} rate` : null,
    fit ? `${fit} ${fit === 1 ? 'property fits' : 'properties fit'}` : null,
    p.toAsk.length ? `${p.toAsk.length} to ask` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card>
      <CardHeader icon="sparkle" title="Profile" sub={sub || undefined} help="profile" open={fold.open} onToggle={fold.toggle} />
      {fold.open && (
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="m-0 text-[15px] leading-relaxed text-[var(--ink)]">{p.summary}</p>

          {p.sureAnswers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
              <Icon name="sparkle" size={15} />
              <span className="min-w-0 flex-1 basis-[220px]">From their notes: {p.sureAnswers.map((s) => `${s.field.toLowerCase()} ${s.value.toLowerCase()}`).join(', ')}.</span>
              <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={triage.isPending} onClick={fillIn}>Fill {p.sureAnswers.length === 1 ? 'it' : 'them'} in</Button>
            </div>
          )}

          <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label="Household" known={p.household} value={p.household.value ? HOUSEHOLD_LABEL[p.household.value] : null} />
            <Fact label="Age" known={p.age} value={p.age.value != null ? `${p.age.value}` : p.ageBand.value ? (p.ageBand.value === 'under_35' ? 'Under 35' : '35 or over') : null}
              extra={p.age.value != null ? (p.age.value < 35 ? 'under 35' : '35 or over') : undefined} />
            <Fact label="Paid at" known={p.size} value={p.size.value ? `The ${sizeWords(p.size.value)} rate` : null}
              extra={p.rateType.value ? RATE_TYPE_WORDS[p.rateType.value] : p.size.why} />
            <Fact label="Benefits" known={{ value: 1, how: 'recorded' }} hideSource
              value={[p.benefits.uc ? 'UC' : p.benefits.uc === false ? 'Not on UC' : 'UC not known', p.benefits.pip ? 'PIP' : null, p.benefits.lcwra ? 'LCWRA' : null,
                p.benefits.working ? 'working' : null, p.benefits.rentCap != null ? `on UC alone, so up to ${money(p.benefits.rentCap)}` : null].filter(Boolean).join(', ')} />
            <Fact label="Wants" known={{ value: 1, how: 'read' }} hideSource
              value={[p.wants.beds, p.wants.areas.length ? p.wants.areas.slice(0, 4).join(', ') : p.wants.anywhere ? 'anywhere' : null,
                p.wants.selfContained ? 'nothing shared' : null, p.wants.stepFree ? 'step-free' : null].filter(Boolean).join(' · ') || null} />
            <Fact label="Council" known={{ value: 1, how: 'recorded' }} hideSource
              value={[p.council.name ?? 'Not known', p.council.route === 'housing officer' ? 'via a housing officer' : null].filter(Boolean).join(', ')}
              extra={p.council.incentive ?? undefined} />
          </dl>

          {p.exemptions.length > 0 && p.ageBand.value !== '35_plus' && (
            <p className="m-0 text-[13px]" style={{ color: 'var(--note-fg)' }}>
              May be exempt from the shared rate: {p.exemptions.join('; ')}. Check before relying on it.
            </p>
          )}

          <Block title="Where to place them">
            {p.places.length === 0 ? (
              <p className="m-0 text-[14px] text-[var(--ink-muted)]">No LHA area to suggest yet: add where they can live, or properties in their areas.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {p.places.map((x) => (
                  <li key={x.brma} className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                    <span className="font-medium text-[var(--ink)]">{x.focus ? '★ ' : ''}{x.brma}</span>
                    {x.rate != null && <span className="font-mono text-[13px] text-[var(--ink-muted)]">LHA {money(x.rate)}</span>}
                    <span className={x.fits ? 'text-[var(--accent-ink)]' : 'text-[var(--ink-muted)]'}>
                      {x.fits ? `${x.fits} ${x.fits === 1 ? 'property fits' : 'properties fit'}` : 'nothing in stock fits yet'}
                    </span>
                    {x.best && <span className="min-w-0 text-[13px] text-[var(--ink-muted)]">cheapest {x.best.address.split(',')[0]} at {money(x.best.rent)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {p.toAsk.length > 0 && (
            <Block title="Ask next">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {p.toAsk.map((q) => (
                  <li key={q.what} className="text-[14px] text-[var(--ink)]">
                    <Icon name="chat" size={13} className="mr-1.5 inline text-[var(--ink-muted)]" />{q.what}<span className="text-[var(--ink-muted)]">: {q.why}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      )}
    </Card>
  );
}

function Fact<T>({ label, known, value, extra, hideSource = false }: { label: string; known: Known<T>; value: string | null; extra?: string; hideSource?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt>
      <dd className="m-0 text-[15px] text-[var(--ink)]">
        {value ?? <span className="text-[var(--ink-muted)]">Not known</span>}
        {extra && <span className="text-[13px] text-[var(--ink-muted)]"> · {extra}</span>}
        {!hideSource && value && known.how !== 'recorded' && (
          <span className="text-[12px] text-[var(--ink-muted)]" title={known.why}> ({SOURCE_WORDS[known.how]}{known.why ? `: ${known.why}` : ''})</span>
        )}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-[var(--line)] pt-3">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{title}</div>
      {children}
    </div>
  );
}

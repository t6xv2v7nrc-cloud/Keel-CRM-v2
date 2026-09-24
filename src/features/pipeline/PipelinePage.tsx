import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApplicants, useCalls, useMoveStage, useDeleteApplicant, usePeople } from '../../lib/hooks';
import { Avatar, Card, Help, Icon, PageHeader, TierBadge, UrgentChip, useToast } from '../../components/ui';
import { callState, dayLabel, lastCallMap, OUTCOME_LABEL, todayIso } from '../../lib/calls';
import type { CallState } from '../../lib/calls';
import { APPLICANT_STAGES } from '../../types/extraction';
import type { ApplicantStage } from '../../types/extraction';
import type { Applicant, Call } from '../../lib/types';
import { money, timeAgo } from '../../lib/format';
import { HOUSEHOLD_LABEL, URGENCY_LABEL, WORK_STATUS_LABEL } from '../../lib/tiering';
import {
  applyFilters, areaOf, BENEFITS, benefitsOf, DEFAULT_FILTERS, effectiveTier, filtersFromParams,
  filtersToParams, householdOf, isActive, isUrgent, parseQuery, previewText, searchText, sortApplicants,
} from '../../lib/search';
import type { BenefitKey, PipelineFilters, SortKey } from '../../lib/search';

const STAGE_LABEL: Record<ApplicantStage, string> = {
  lead: 'Lead', referred: 'Referred', viewing: 'Viewing', offer: 'Offer',
  placed: 'Placed', fee_invoiced: 'Fee invoiced', fee_paid: 'Fee paid', lost: 'Lost',
};

// Fee stages are no longer used; clients left at one still show it in their row.
const PICKABLE_STAGES: ApplicantStage[] = APPLICANT_STAGES.filter((s) => s !== 'fee_invoiced' && s !== 'fee_paid');

const CALLS_LABEL: Record<PipelineFilters['calls'], string> = {
  any: 'Any', due: 'Due a call now', never: 'Never called', scheduled: 'Call booked',
};

const TYPE_SHORT: Record<string, string> = { single: 'Single', couple: 'Couple', family: 'Family', other: 'Other' };

const SORT_KEYS: SortKey[] = ['tier', 'name', 'household', 'benefits', 'area', 'budget', 'stage', 'updated'];

function sortFromParams(p: URLSearchParams): { key: SortKey; dir: 1 | -1 } {
  const k = p.get('sort') as SortKey | null;
  return { key: k && SORT_KEYS.includes(k) ? k : 'tier', dir: p.get('dir') === 'desc' ? -1 : 1 };
}

function sortToParams(s: { key: SortKey; dir: 1 | -1 }, p: URLSearchParams): URLSearchParams {
  if (s.key !== 'tier') p.set('sort', s.key);
  if (s.dir === -1) p.set('dir', 'desc');
  return p;
}

/** Pipeline table with combined search + filters. Filters live in the URL so a
 *  search like "UC clients wanting North Finchley" survives refresh and can be
 *  bookmarked. Stage changes from the row dropdown log an activity. */
export function PipelinePage() {
  const { data: applicants = [], isLoading } = useApplicants();
  const { calls } = useCalls();
  const last = useMemo(() => lastCallMap(calls), [calls]);
  const people = usePeople();
  const moveStage = useMoveStage();
  const deleteApplicant = useDeleteApplicant();
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Filters + sort ──
  // React state is the source of truth (so rapid changes never overwrite each
  // other); it is mirrored into the URL so a search survives refresh and can
  // be bookmarked, and a URL change from outside (back button, a dashboard
  // link) is adopted.
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<PipelineFilters>(() => filtersFromParams(params));
  const [sort, setSort] = useState(() => sortFromParams(params));
  const written = useRef(params.toString());

  useEffect(() => {
    const s = params.toString();
    if (s === written.current) return;
    written.current = s;
    setFilters(filtersFromParams(params));
    setSort(sortFromParams(params));
  }, [params]);

  useEffect(() => {
    const next = sortToParams(sort, filtersToParams(filters));
    const s = next.toString();
    if (s === written.current) return;
    written.current = s;
    setParams(next, { replace: true });
  }, [filters, sort, setParams]);

  const { key: sortKey, dir } = sort;
  const update = (patch: Partial<PipelineFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const clearAll = () => setFilters(DEFAULT_FILTERS);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  // ── Results ──
  const textIndex = useMemo(() => new Map(applicants.map((a) => [a.id, searchText(a)])), [applicants]);
  const terms = useMemo(() => parseQuery(filters.q), [filters.q]);
  const rows = useMemo(() => {
    const today = todayIso();
    const byCalls = (a: Applicant) => {
      if (filters.calls === 'any') return true;
      const st = callState(a, last.get(a.id));
      if (filters.calls === 'never') return !last.has(a.id);
      if (filters.calls === 'scheduled') return st.kind === 'scheduled';
      return st.kind === 'due' || (st.kind === 'first' && st.date <= today);
    };
    const byOwner = (a: Applicant) => filters.owner === 'any' ? true
      : filters.owner === 'none' ? !a.assigned_to
      : a.assigned_to === (filters.owner === 'me' ? people.meId : filters.owner);
    return sortApplicants(applyFilters(applicants, filters, (a) => textIndex.get(a.id) ?? '').filter(byCalls).filter(byOwner), sortKey, dir);
  }, [applicants, filters, textIndex, sortKey, dir, last, people.meId]);

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of applicants) m.set(a.stage, (m.get(a.stage) ?? 0) + 1);
    return m;
  }, [applicants]);
  const activeCount = applicants.filter(isActive).length;
  const scopeCount = filters.stage === 'active' ? activeCount
    : filters.stage === 'all' ? applicants.length
    : stageCounts.get(filters.stage) ?? 0;
  const scopeLabel = filters.stage === 'active' ? 'active clients'
    : filters.stage === 'all' ? 'clients'
    : `at ${STAGE_LABEL[filters.stage].toLowerCase()}`;

  // Removable pills describing the current search. Each removal works on the
  // latest state, so clearing several quickly never brings one back.
  type Pill = { label: string; remove: (f: PipelineFilters) => PipelineFilters };
  const pills: Pill[] = [];
  if (filters.q) pills.push({ label: `Search: ${filters.q}`, remove: (f) => ({ ...f, q: '' }) });
  if (filters.stage !== 'active') pills.push({ label: filters.stage === 'all' ? 'All stages' : STAGE_LABEL[filters.stage], remove: (f) => ({ ...f, stage: 'active' }) });
  if (filters.tier !== 'any') pills.push({ label: `Tier ${filters.tier}`, remove: (f) => ({ ...f, tier: 'any' }) });
  if (filters.household !== 'any') pills.push({ label: filters.household === 'unknown' ? 'Client type not set' : HOUSEHOLD_LABEL[filters.household], remove: (f) => ({ ...f, household: 'any' }) });
  if (filters.work !== 'any') pills.push({ label: WORK_STATUS_LABEL[filters.work], remove: (f) => ({ ...f, work: 'any' }) });
  if (filters.councilReg !== 'any') pills.push({ label: filters.councilReg === 'yes' ? 'Council-registered' : 'Not council-registered', remove: (f) => ({ ...f, councilReg: 'any' }) });
  if (filters.urgency !== 'any') pills.push({ label: filters.urgency === 'urgent' ? 'Urgent' : URGENCY_LABEL[filters.urgency], remove: (f) => ({ ...f, urgency: 'any' }) });
  if (filters.owner !== 'any') pills.push({
    label: filters.owner === 'me' ? 'Assigned to me' : filters.owner === 'none' ? 'Not assigned' : `Assigned to ${people.nameOf(filters.owner) ?? 'someone'}`,
    remove: (f) => ({ ...f, owner: 'any' }),
  });
  if (filters.calls !== 'any') pills.push({ label: CALLS_LABEL[filters.calls], remove: (f) => ({ ...f, calls: 'any' }) });
  for (const b of filters.benefits) {
    pills.push({ label: BENEFITS.find((x) => x.key === b)?.label ?? b, remove: (f) => ({ ...f, benefits: f.benefits.filter((x) => x !== b) }) });
  }

  const toggleBenefit = (key: BenefitKey) =>
    setFilters((f) => ({ ...f, benefits: f.benefits.includes(key) ? f.benefits.filter((b) => b !== key) : [...f.benefits, key] }));

  // ── Row actions ──
  const changeStage = (a: Applicant, to: ApplicantStage) => {
    if (to === a.stage) return;
    moveStage.mutate(
      { id: a.id, from: a.stage, to },
      { onSuccess: () => toast(`${a.full_name.split(' ')[0]} → ${STAGE_LABEL[to]}`, 'success') },
    );
  };

  const removeApplicant = (a: Applicant) => {
    if (!window.confirm(`Delete ${a.full_name}? This removes their record, activity and any placement. This cannot be undone.`)) return;
    deleteApplicant.mutate(a.id, {
      onSuccess: () => toast(`Deleted ${a.full_name}`, 'success'),
      onError: (e) => toast(`Delete failed: ${(e as Error).message}`, 'danger'),
    });
  };

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-4 p-6 pb-24">
      <PageHeader icon="list" title="Pipeline" help="pipeline" sub={`${activeCount} active of ${applicants.length} clients`} />

      {/* Search + filters */}
      <Card className="flex flex-col gap-4 p-4">
        <label className="relative flex flex-col gap-1">
          <span className="sr-only">Search</span>
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-[13px] text-[var(--ink-muted)]" />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder='Search name, phone, area or notes. Use quotes for a phrase, e.g. "north finchley"'
            className="min-h-[44px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] pl-10 pr-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Stage" value={filters.stage} onChange={(v) => update({ stage: v as PipelineFilters['stage'] })}
            options={[
              ['active', `Active (${activeCount})`],
              ['all', `All (${applicants.length})`],
              ...PICKABLE_STAGES.map((s): [string, string] => [s, `${STAGE_LABEL[s]} (${stageCounts.get(s) ?? 0})`]),
            ]} />
          <FilterSelect label="Tier" value={filters.tier} onChange={(v) => update({ tier: v as PipelineFilters['tier'] })}
            options={[['any', 'Any'], ['1', 'Tier 1'], ['2', 'Tier 2'], ['3', 'Tier 3']]} />
          <FilterSelect label="Client type" value={filters.household} onChange={(v) => update({ household: v as PipelineFilters['household'] })}
            options={[['any', 'Any'], ['single', 'Single'], ['couple', 'Couple'], ['family', 'Family with children'], ['other', 'Other'], ['unknown', 'Not set']]} />
          <FilterSelect label="Work" value={filters.work} onChange={(v) => update({ work: v as PipelineFilters['work'] })}
            options={[['any', 'Any'], ['not_working', 'Not working'], ['part_time', 'Part time'], ['full_time', 'Full time']]} />
          <FilterSelect label="Council-registered" value={filters.councilReg} onChange={(v) => update({ councilReg: v as PipelineFilters['councilReg'] })}
            options={[['any', 'Any'], ['yes', 'Yes'], ['no', 'No']]} />
          <FilterSelect label="Urgency" value={filters.urgency} onChange={(v) => update({ urgency: v as PipelineFilters['urgency'] })}
            options={[
              ['any', 'Any'], ['urgent', 'Urgent (per Settings)'], ['homeless_tonight', 'Homeless tonight'],
              ['at_risk_56', 'At risk within 56 days'], ['temp_accommodation', 'Temporary accommodation'], ['overcrowding', 'Overcrowded or unsafe'],
            ]} />
          {people.ready && people.members.length > 0 && (
            <FilterSelect label="Assigned" value={filters.owner} onChange={(v) => update({ owner: v })}
              options={[['any', 'Anyone'], ['me', 'Me'], ['none', 'Not assigned'],
                ...people.members.filter((m) => m.id !== people.meId).map((m): [string, string] => [m.id, people.nameOf(m.id) ?? 'Someone'])]} />
          )}
          <FilterSelect label="Calls" value={filters.calls} onChange={(v) => update({ calls: v as PipelineFilters['calls'] })}
            options={Object.entries(CALLS_LABEL) as Array<[string, string]>} />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">Receives</span>
            <div className="flex gap-1.5">
              {BENEFITS.map((b) => {
                const on = filters.benefits.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleBenefit(b.key)}
                    aria-pressed={on}
                    className="min-h-[40px] rounded-md border px-3 text-[13px] font-medium transition-colors"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--line-strong)',
                      background: on ? 'var(--accent)' : 'var(--surface)',
                      color: on ? 'var(--on-accent)' : 'var(--ink-muted)',
                    }}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* Result summary */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]" aria-live="polite">
        <span className="text-[var(--ink-muted)]">
          Showing <strong className="text-[var(--ink)]">{rows.length}</strong> of {scopeCount} {scopeLabel}
        </span>
        {pills.map((p) => (
          <button
            key={p.label}
            onClick={() => setFilters(p.remove)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-[var(--accent-ink)] hover:bg-[var(--surface)]"
            aria-label={`Remove filter ${p.label}`}
          >
            {p.label} <Icon name="x" size={12} />
          </button>
        ))}
        {pills.length > 0 && (
          <button onClick={clearAll} className="text-[var(--link)] hover:underline">Clear all</button>
        )}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1140px] border-collapse text-[15px]">
          <thead>
            <tr className="bg-[var(--surface-2)] text-left text-[13px] text-[var(--ink-muted)]">
              <Th k="tier" sortKey={sortKey} dir={dir} onSort={toggleSort}>Tier</Th>
              <Th k="name" sortKey={sortKey} dir={dir} onSort={toggleSort}>Client</Th>
              <Th k="household" sortKey={sortKey} dir={dir} onSort={toggleSort}>Type</Th>
              <Th k="benefits" sortKey={sortKey} dir={dir} onSort={toggleSort}>Benefits</Th>
              <Th k="area" sortKey={sortKey} dir={dir} onSort={toggleSort}>Area</Th>
              <Th k="budget" sortKey={sortKey} dir={dir} onSort={toggleSort} right>Budget</Th>
              <th className="px-3 py-2 font-medium"><span className="inline-flex items-center gap-1.5">Calls <Help topic="pipelineCalls" /></span></th>
              <Th k="stage" sortKey={sortKey} dir={dir} onSort={toggleSort}>Stage</Th>
              <Th k="updated" sortKey={sortKey} dir={dir} onSort={toggleSort} right>Updated</Th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const preview = previewText(a, terms);
              const household = householdOf(a);
              const benefits = benefitsOf(a);
              return (
                <tr key={a.id} className="border-t border-[var(--line)] align-top hover:bg-[var(--surface-2)]">
                  <td className="px-5 py-3">
                    <TierBadge tier={effectiveTier(a)} />
                    {isUrgent(a) && <div className="mt-1.5"><UrgentChip /></div>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[380px] gap-3">
                      <Avatar name={a.full_name} size={34} accent={effectiveTier(a) === 1} />
                      <div className="min-w-0">
                        <button onClick={() => navigate(`/applicants/${a.id}`)} className="text-left font-medium text-[var(--ink)] hover:underline">
                          <Highlight text={a.full_name} terms={terms} />
                        </button>
                        {a.phone && <div className="font-mono text-[13px] text-[var(--ink-muted)]">{a.phone}</div>}
                        {a.assigned_to && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-[var(--ink-muted)]">
                            <Icon name="user" size={12} />{people.whoOf(a.assigned_to) === 'you' ? 'You' : people.nameOf(a.assigned_to)}
                          </div>
                        )}
                        {preview && (
                          <div className="mt-1 truncate text-[13px] text-[var(--ink-muted)]" title={a.notes || a.requirements || ''}>
                            <Highlight text={preview} terms={terms} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[var(--ink-muted)]">{household ? TYPE_SHORT[household] : '—'}</td>
                  <td className="px-3 py-3">
                    {benefits.length === 0 ? (
                      <span className="text-[var(--ink-muted)]">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {benefits.map((b) => (
                          <span key={b.key} className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[13px] font-medium text-[var(--chip-fg)]">
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[var(--ink-muted)]">{areaOf(a) || '—'}</td>
                  <td className="px-3 py-3 text-right font-mono text-[var(--ink)]">{a.budget_pcm ? money(a.budget_pcm) : '—'}</td>
                  <td className="px-3 py-3"><CallCell state={callState(a, last.get(a.id))} lastOutcome={last.get(a.id)?.outcome} lastAt={last.get(a.id)?.created_at} /></td>
                  <td className="px-3 py-3">
                    <select
                      value={a.stage}
                      onChange={(e) => changeStage(a, e.target.value as ApplicantStage)}
                      aria-label={`Stage for ${a.full_name}`}
                      className="min-h-[36px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]"
                    >
                      {(PICKABLE_STAGES.includes(a.stage) ? PICKABLE_STAGES : [...PICKABLE_STAGES, a.stage]).map((s) => (
                        <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] text-[var(--ink-muted)]">{timeAgo(a.updated_at)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => removeApplicant(a)}
                      aria-label={`Delete ${a.full_name}`}
                      title="Delete client"
                      className="rounded p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-center text-[var(--ink-muted)]">
                  No clients match this search.{' '}
                  {pills.length > 0 && <button onClick={clearAll} className="text-[var(--link)] hover:underline">Clear all filters</button>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>;
}) {
  const changed = value !== options[0][0];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[40px] rounded-md border bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]"
        style={{ borderColor: changed ? 'var(--accent)' : 'var(--line-strong)', boxShadow: changed ? '0 0 0 3px var(--accent-soft)' : undefined }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Th({ k, sortKey, dir, onSort, right, children }: {
  k: SortKey; sortKey: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; right?: boolean; children: React.ReactNode;
}) {
  const active = k === sortKey;
  return (
    <th className={`px-3 py-2 font-medium first:pl-5 ${right ? 'text-right' : ''}`} aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-[var(--ink)] ${active ? 'text-[var(--ink)]' : ''}`}>
        {children}
        {active && <span aria-hidden>{dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Marks the searched words inside a piece of text. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const words = [...new Set(terms.flatMap((t) => t.split(' ')))].filter((w) => w.length > 1);
  if (words.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escapeRe).join('|')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i} className="rounded-sm bg-[var(--accent-soft)] px-0.5 text-[var(--ink)]">{p}</mark> : p,
      )}
    </>
  );
}

/** Last call and next call for a pipeline row. */
function CallCell({ state, lastOutcome, lastAt }: { state: CallState; lastOutcome?: Call['outcome']; lastAt?: string }) {
  const today = todayIso();
  const next = state.kind === 'due' || state.kind === 'scheduled' ? state.date : null;
  const dueNow = state.kind === 'due' || (state.kind === 'first' && state.date <= today);
  return (
    <div className="flex min-w-[130px] flex-col gap-0.5 text-[13px]">
      {state.kind === 'first' ? (
        <span className={`inline-flex items-center gap-1 ${dueNow ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>
          <Icon name="phoneOut" size={13} /> Not called yet
        </span>
      ) : next ? (
        <span className={`inline-flex items-center gap-1 ${dueNow ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--ink)]'}`}>
          <Icon name="calendar" size={13} /> {next < today ? `Overdue, ${dayLabel(next).toLowerCase()}` : dayLabel(next)}
        </span>
      ) : null}
      {lastOutcome && lastAt && (
        <span className="text-[var(--ink-muted)]">{OUTCOME_LABEL[lastOutcome]}, {timeAgo(lastAt)}</span>
      )}
      {!lastOutcome && state.kind === 'none' && <span className="text-[var(--ink-muted)]">·</span>}
    </div>
  );
}

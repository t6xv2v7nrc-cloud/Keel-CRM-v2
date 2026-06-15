import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApplicants, useMoveStage } from '../../lib/hooks';
import { Card, useToast } from '../../components/ui';
import { APPLICANT_STAGES } from '../../types/extraction';
import type { ApplicantStage } from '../../types/extraction';
import type { Applicant } from '../../lib/types';
import { money, timeAgo } from '../../lib/format';

const STAGE_LABEL: Record<ApplicantStage, string> = {
  lead: 'Lead', referred: 'Referred', viewing: 'Viewing', offer: 'Offer',
  placed: 'Placed', fee_invoiced: 'Fee invoiced', fee_paid: 'Fee paid', lost: 'Lost',
};

type SortKey = 'name' | 'borough' | 'budget' | 'stage' | 'updated';

/** Pipeline as a sortable, filterable table (§8.2, tabular variant).
 *  Change a row's stage from the inline dropdown; each change logs activity. */
export function PipelinePage() {
  const { data: applicants = [], isLoading } = useApplicants();
  const moveStage = useMoveStage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<ApplicantStage | 'all' | 'active'>('active');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated', dir: -1 });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of applicants) m.set(a.stage, (m.get(a.stage) ?? 0) + 1);
    return m;
  }, [applicants]);

  const rows = useMemo(() => {
    let r = applicants;
    if (filter === 'active') r = r.filter((a) => a.stage !== 'lost' && a.stage !== 'fee_paid');
    else if (filter !== 'all') r = r.filter((a) => a.stage === filter);

    const stageIdx = (s: ApplicantStage) => APPLICANT_STAGES.indexOf(s);
    const cmp = (a: Applicant, b: Applicant): number => {
      switch (sort.key) {
        case 'name': return a.full_name.localeCompare(b.full_name);
        case 'borough': return (a.referring_borough ?? '').localeCompare(b.referring_borough ?? '');
        case 'budget': return (a.budget_pcm ?? 0) - (b.budget_pcm ?? 0);
        case 'stage': return stageIdx(a.stage) - stageIdx(b.stage);
        case 'updated': return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
    };
    return [...r].sort((a, b) => cmp(a, b) * sort.dir);
  }, [applicants, filter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  const changeStage = (a: Applicant, to: ApplicantStage) => {
    if (to === a.stage) return;
    moveStage.mutate(
      { id: a.id, from: a.stage, to },
      { onSuccess: () => toast(`${a.full_name.split(' ')[0]} → ${STAGE_LABEL[to]}`, 'success') },
    );
  };

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-4 p-6 pb-24">
      <header>
        <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Pipeline</h1>
        <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">{applicants.length} applicants</p>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'active'} onClick={() => setFilter('active')}>
          Active <Count n={applicants.filter((a) => a.stage !== 'lost' && a.stage !== 'fee_paid').length} />
        </FilterChip>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All <Count n={applicants.length} />
        </FilterChip>
        {APPLICANT_STAGES.map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {STAGE_LABEL[s]} <Count n={counts.get(s) ?? 0} />
          </FilterChip>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-[var(--ink-muted)]">
              <Th onClick={() => toggleSort('name')} active={sort.key === 'name'} dir={sort.dir}>Name</Th>
              <Th onClick={() => toggleSort('borough')} active={sort.key === 'borough'} dir={sort.dir}>Borough</Th>
              <th className="px-3 py-2 font-medium">Benefit</th>
              <Th onClick={() => toggleSort('budget')} active={sort.key === 'budget'} dir={sort.dir} right>Budget</Th>
              <Th onClick={() => toggleSort('stage')} active={sort.key === 'stage'} dir={sort.dir}>Stage</Th>
              <Th onClick={() => toggleSort('updated')} active={sort.key === 'updated'} dir={sort.dir} right>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-[var(--line)] hover:bg-[var(--paper)]">
                <td className="px-5 py-3">
                  <button onClick={() => navigate(`/applicants/${a.id}`)} className="text-left text-[var(--ink)] hover:underline">
                    {a.full_name}
                  </button>
                  {a.phone && <div className="font-mono text-[13px] text-[var(--ink-muted)]">{a.phone}</div>}
                </td>
                <td className="px-3 py-3 text-[var(--ink-muted)]">{a.referring_borough ?? '—'}</td>
                <td className="px-3 py-3 text-[var(--ink-muted)]">{a.benefit_type ?? '—'}</td>
                <td className="px-3 py-3 text-right font-mono text-[var(--ink)]">{a.budget_pcm ? money(a.budget_pcm) : '—'}</td>
                <td className="px-3 py-3">
                  <select
                    value={a.stage}
                    onChange={(e) => changeStage(a, e.target.value as ApplicantStage)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Stage for ${a.full_name}`}
                    className="min-h-[36px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]"
                  >
                    {APPLICANT_STAGES.map((s) => (
                      <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3 text-right font-mono text-[13px] text-[var(--ink-muted)]">{timeAgo(a.updated_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--ink-muted)]">No applicants in this view.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Th({ children, onClick, active, dir, right }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: 1 | -1; right?: boolean }) {
  return (
    <th className={`px-3 py-2 font-medium first:pl-5 last:pr-5 ${right ? 'text-right' : ''}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--ink)]">
        {children}
        {active && <span aria-hidden>{dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-[13px] transition-colors"
      style={{
        borderColor: active ? 'var(--hull)' : 'var(--line-strong)',
        background: active ? 'var(--hull)' : 'transparent',
        color: active ? '#fff' : 'var(--ink-muted)',
      }}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="font-mono opacity-70">{n}</span>;
}

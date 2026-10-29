import { useMemo, useState } from 'react';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { useApplicants, useApplyBackfill } from '../../lib/hooks';
import { backfillPlan, backfillText, FILL_LABEL } from '../../lib/autoFill';
import { copyText } from '../../lib/clipboard';

/** The one-off "Fill in from their notes" (brief A9): every client not lost, with each empty answer their own words
 *  give, shown in full (client, field, old to new, the words) before anything is written. Apply writes exactly these. */
export function BackfillCard() {
  const { data: applicants = [] } = useApplicants();
  const apply = useApplyBackfill();
  const { toast } = useToast();
  const rows = useMemo(() => backfillPlan(applicants), [applicants]);
  const [shown, setShown] = useState(20);
  const changes = rows.reduce((n, r) => n + r.fills.length, 0);
  const copy = async () => {
    const ok = await copyText(backfillText(rows));
    toast(ok ? 'Copied the list of changes' : 'Could not copy', ok ? 'success' : 'danger');
  };
  const run = () => {
    if (!window.confirm(`Fill in ${changes} ${changes === 1 ? 'answer' : 'answers'} for ${rows.length} ${rows.length === 1 ? 'client' : 'clients'}? Only empty answers are filled, and each change goes on the client's timeline.`)) return;
    apply.mutate({ rows, applicants }, {
      onSuccess: (r) => toast(r.failed.length ? `Filled in ${r.done}. ${r.failed.length} could not be saved: ${r.failed[0]}` : `Filled in ${r.done} ${r.done === 1 ? 'client' : 'clients'}`, r.failed.length ? 'danger' : 'success'),
      onError: (e) => toast(`Could not fill them in: ${(e as Error).message}`, 'danger'),
    });
  };

  return (
    <Card fold="settings.backfill" startsFolded>
      <CardHeader icon="sparkle" title="Fill in from their notes" help="backfill"
        sub={rows.length ? `${changes} empty ${changes === 1 ? 'answer' : 'answers'} for ${rows.length} ${rows.length === 1 ? 'client' : 'clients'}` : 'Nothing to fill in'} />
      <div className="flex flex-col gap-3 p-5">
        <p className="m-0 text-[15px] text-[var(--ink-muted)]">
          Who is moving in, their age band and the bedrooms they need, read from each client's own words. Only empty answers are
          filled; nothing typed is changed. Check the list, then fill them in. Lost clients are left out.
        </p>
        {rows.length === 0 ? (
          <p className="m-0 text-[14px] text-[var(--ink-muted)]">Every answer their notes give is already filled in.</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col p-0">
              {rows.slice(0, shown).map((r) => (
                <li key={r.id} className="flex flex-col gap-1 border-b border-[var(--line)] py-2 last:border-b-0">
                  <span className="text-[15px] font-medium text-[var(--ink)]">{r.name}</span>
                  {r.fills.map((f) => (
                    <span key={f.field} className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-[var(--ink-muted)]">
                      <span className="text-[var(--ink)]">{FILL_LABEL[f.field]}</span>
                      <span>{f.from === null || f.from === '' ? 'empty' : String(f.from)} <Icon name="arrowRight" size={12} className="inline" /> <strong className="text-[var(--ink)]">{f.words}</strong></span>
                      {f.source && <span className="min-w-0 break-words italic">“{f.source}”</span>}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            {rows.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + 40)} className="self-start text-[13px] font-medium text-[var(--link)] hover:underline">
                Show {Math.min(40, rows.length - shown)} more of {rows.length - shown}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" busy={apply.isPending} disabled={apply.isPending} onClick={run}>
                <Icon name="check" size={16} />Fill in {changes} {changes === 1 ? 'answer' : 'answers'}
              </Button>
              <Button onClick={copy}><Icon name="file" size={16} />Copy the list</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

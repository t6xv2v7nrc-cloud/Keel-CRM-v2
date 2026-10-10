import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useDeals, useProviders, useReceivables, useRequests, useSettings } from '../../lib/hooks';
import { morningDigest } from '../../lib/digest';
import type { DigestKey } from '../../lib/digest';
import { copyText } from '../../lib/clipboard';
import { waLink } from '../../lib/whatsapp';
import type { Applicant } from '../../lib/types';

const ICON: Record<DigestKey, IconName> = {
  viewings: 'calendar', steps: 'flag', providers: 'send', money: 'pound', movein: 'list', cold: 'clock', stuck: 'alert',
};
const small = 'min-h-0 px-3 py-1.5 text-[13px]';

/** Home: today in a few lines, to copy or send to your own WhatsApp. */
export function MorningSummary({ applicants }: { applicants: Applicant[] }) {
  const { deals } = useDeals();
  const { receivables } = useReceivables();
  const { requests } = useRequests();
  const { providers } = useProviders();
  const { settings } = useSettings();
  const { toast } = useToast();
  const checklist = settings.moveInChecklist;
  const digest = useMemo(
    () => morningDigest({ applicants, deals, receivables, requests, providers, checklist }),
    [applicants, deals, receivables, requests, providers, checklist],
  );

  const copy = async () => {
    if (await copyText(digest.text)) toast('Summary copied', 'success');
    else toast('Could not copy. Use Send to WhatsApp instead.', 'danger');
  };

  return (
    <Card>
      <CardHeader icon="sun" title="Today" sub={digest.lines.length ? String(digest.lines.length) : undefined} help="summary">
        <Button className={small} onClick={copy}><Icon name="file" size={14} />Copy</Button>
        <a href={waLink(null, digest.text)} target="_blank" rel="noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
          <Icon name="chat" size={14} />Send to WhatsApp
        </a>
      </CardHeader>
      {digest.lines.length === 0 ? (
        <p className="m-0 px-5 py-4 text-[15px] text-[var(--ink-muted)]">Nothing due today: no viewings, next steps, chases or money waiting.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-3">
          {digest.lines.map((l) => {
            const inner = (
              <>
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--ink-muted)]"><Icon name={ICON[l.key]} size={14} /></span>
                <span className="min-w-0 flex-1 text-[15px] text-[var(--ink)]">{l.text}</span>
              </>
            );
            return (
              <li key={l.key}>
                {l.to
                  ? <Link to={l.to} className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)]">{inner}</Link>
                  : <div className="flex items-start gap-3 px-2 py-1.5">{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

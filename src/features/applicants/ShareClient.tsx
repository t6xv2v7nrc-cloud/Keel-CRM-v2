import { useState } from 'react';
import { Button, Help, Icon, UpdateNote, useToast } from '../../components/ui';
import { useLogShare, usePeople, useUpdateTriage } from '../../lib/hooks';
import { clientShareText } from '../../lib/shareClient';
import { copyText } from '../../lib/clipboard';
import { waLink } from '../../lib/whatsapp';
import type { Applicant } from '../../lib/types';

const action = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 text-[14px] font-medium text-[var(--accent-ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]';

/** Send a client's details to a landlord or agent: first name, household, benefits and what they want, never their surname, phone or anything medical. */
export function ShareClient({ applicant, onClose }: { applicant: Applicant; onClose: () => void }) {
  const { myName } = usePeople();
  const log = useLogShare();
  const triage = useUpdateTriage();
  const { toast } = useToast();
  const [text, setText] = useState(() => clientShareText(applicant, myName));
  const first = applicant.full_name.split(' ')[0];
  const columnMissing = applicant.share_with_landlords === undefined; // before 0010 the agreement cannot be recorded
  const agreed = applicant.share_with_landlords === true;
  const sent = (how: string) => log.mutate({ applicant, how }, { onSuccess: () => toast(`${first}'s details shared (${how})`, 'success') });

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold text-[var(--ink)]">Share {first} with a landlord or agent</span>
        <Help topic="shareClient" />
        <button type="button" onClick={onClose} aria-label="Close sharing" className="ml-auto grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]">
          <Icon name="x" size={16} />
        </button>
      </div>

      {columnMissing ? (
        <UpdateNote title="Recording that a client agreed to share needs a one-off database update." file="0010_providers_requests.sql" />
      ) : !agreed && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-[var(--note-bg)] px-3 py-2 text-[14px] text-[var(--note-fg)]">
          <span className="min-w-0 flex-1 basis-[220px]">{first} has not agreed to their details going to landlords yet. Ask them first.</span>
          <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={triage.isPending}
            onClick={() => triage.mutate({ applicant, patch: { share_with_landlords: true }, note: 'Agreed their details can be sent to landlords' }, {
              onSuccess: () => toast(`Recorded: ${first} agreed`, 'success'),
              onError: (e) => toast((e as Error).message, 'danger'),
            })}>
            {first} agreed: record it
          </Button>
        </div>
      )}

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} aria-label="Message"
        className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[15px] leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
      <p className="m-0 text-[12px] text-[var(--ink-muted)]">First name only: no surname, phone number or anything medical. Change anything before sending.</p>

      <div className="flex flex-wrap items-center gap-2">
        {agreed ? (
          <>
            <a href={waLink(null, text)} target="_blank" rel="noreferrer" className={action} onClick={() => sent('WhatsApp')}>
              <Icon name="chat" size={16} />Send on WhatsApp
            </a>
            <a href={`mailto:?subject=${encodeURIComponent(`Client looking: ${first}`)}&body=${encodeURIComponent(text)}`} className={action} onClick={() => sent('email')}>
              <Icon name="mail" size={16} />Email
            </a>
            <button type="button" className={action} onClick={async () => {
              if (await copyText(text)) sent('copied'); else toast('Could not copy. Use WhatsApp or Email instead.', 'danger');
            }}>
              <Icon name="file" size={16} />Copy
            </button>
          </>
        ) : (
          <span className="text-[13px] text-[var(--ink-muted)]">Sending opens once {first} has agreed.</span>
        )}
      </div>
    </div>
  );
}

import { Icon } from '../../components/ui';
import { useLogWhatsApp, usePeople } from '../../lib/hooks';
import type { SentOnWhatsApp } from '../../lib/hooks';
import { timeAgo } from '../../lib/format';
import { clientMessage, firstName, propertiesText, waLink, waNumber } from '../../lib/whatsapp';
import type { PropertyForMessage } from '../../lib/whatsapp';
import type { Applicant } from '../../lib/types';

/**
 * Opens WhatsApp with the property details typed in. With a client: a chat
 * with them, in the team's wording, and a note on their timeline. Without:
 * WhatsApp asks who to send it to.
 */
export function WhatsAppLink({ to, properties, label, icon = false }: {
  to?: Pick<Applicant, 'id' | 'full_name' | 'phone'>;
  properties: PropertyForMessage[];
  label?: string;
  icon?: boolean;
}) {
  const { myName } = usePeople();
  const log = useLogWhatsApp();
  if (properties.length === 0) return null;
  const number = to ? waNumber(to.phone) : null;
  const text = to ? clientMessage(to.full_name, properties, myName) : propertiesText(properties);
  const what = properties.length === 1 ? 'this property' : `these ${properties.length} properties`;
  const title = !to ? `Send ${what} to anyone on WhatsApp`
    : number ? `Send ${what} to ${firstName(to.full_name)} on WhatsApp`
    : `No mobile number saved for ${firstName(to.full_name)}: WhatsApp will ask who to send it to`;
  const text_ = label ?? (to ? 'WhatsApp' : 'Share');

  return (
    <a href={waLink(number, text)} target="_blank" rel="noreferrer" title={title} aria-label={title}
      onClick={() => { if (to) log.mutate({ applicantId: to.id, properties }); }}
      className={icon
        ? 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--line)] px-2 text-[13px] font-medium text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]'
        : 'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 text-[13px] font-medium text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]'}>
      <Icon name={to ? 'chat' : 'share'} size={16} />
      {icon ? <span className="hidden sm:inline">{text_}</span> : text_}
    </a>
  );
}

/** "Sent 2d ago by Ridwan": so two people do not send the same client the same property. */
export function SentTag({ sent }: { sent: SentOnWhatsApp | undefined }) {
  const { whoOf } = usePeople();
  if (!sent) return null;
  const who = whoOf(sent.actor);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-[var(--accent-ink)]" title={`Sent on WhatsApp ${new Date(sent.at).toLocaleString('en-GB')}`}>
      <Icon name="check" size={12} strokeWidth={2.4} /> Sent {timeAgo(sent.at)}{who ? ` by ${who}` : ''}
    </span>
  );
}

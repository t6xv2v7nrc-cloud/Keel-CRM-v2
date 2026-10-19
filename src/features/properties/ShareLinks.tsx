import { Icon, useToast } from '../../components/ui';
import { useClientNote, useLogOfficerMatches, useLogShare, useOfficers, usePeople, useProviders } from '../../lib/hooks';
import { checksFor, sendBlockers } from '../../lib/propertyChecks';
import { fromHousingOfficer } from '../../lib/money';
import { providerFor } from '../../lib/requests';
import { noteActivity } from '../../lib/contacts';
import { shortAddress } from '../../lib/progress';
import { landlordShareBlocked, landlordShareText, officerMatchesText, officerWhatsApp, recommendText } from '../../lib/shareWhatsApp';
import { waLink, waNumber } from '../../lib/whatsapp';
import type { RuledMatch } from '../../lib/matchRules';
import type { Applicant, Property } from '../../lib/types';

const button = 'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 text-[13px] font-medium text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]';
const iconButton = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--line)] px-2 text-[13px] font-medium text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]';
const off = 'cursor-not-allowed opacity-40';
const first = (name: string) => name.trim().split(/\s+/)[0];

/** On a client's Suitable properties: the properties shown, to the housing officer who referred them, on WhatsApp.
 *  Anything marked not ready is left out. The send is noted and the properties tracked as sent. */
export function OfficerMatchesLink({ applicant, items }: { applicant: Applicant; items: Array<{ property: Property; match: RuledMatch }> }) {
  const { officers } = useOfficers();
  const { myName } = usePeople();
  const log = useLogOfficerMatches();
  if (!fromHousingOfficer(applicant)) return null;
  const ready = items.filter(({ property }) => sendBlockers(checksFor(property)).length === 0);
  if (!ready.length) return null;
  const to = officerWhatsApp(applicant, officers);
  // say how many when some of those shown are held back
  const label = ready.length === items.length ? `Send to ${first(to.name)}` : `Send ${ready.length} to ${first(to.name)}`;
  if (to.blocked) return <span className={`${button} ${off}`} title={to.blocked} aria-disabled><Icon name="chat" size={16} />{label}</span>;
  const what = ready.length === 1 ? 'this property' : `these ${ready.length} properties`;
  return (
    <a href={waLink(to.number, officerMatchesText(applicant, ready, myName))} target="_blank" rel="noreferrer"
      title={to.note ?? `Send ${what} to ${to.name} on WhatsApp, with the LHA they are paid and why each fits`}
      onClick={() => log.mutate({ applicant, properties: ready.map((x) => x.property), officer: to.name })} className={button}>
      <Icon name="chat" size={16} />{label}
    </a>
  );
}

/** On a housed client's page: ask them, on WhatsApp, to forward Keel to friends who need a home. Counts as contact. */
export function RecommendKeelLink({ applicant }: { applicant: Applicant }) {
  const { myName } = usePeople();
  const note = useClientNote();
  const { toast } = useToast();
  const number = waNumber(applicant.phone);
  const name = first(applicant.full_name);
  return (
    <a href={waLink(number, recommendText(applicant, myName))} target="_blank" rel="noreferrer"
      title={number ? `Ask ${name} on WhatsApp to recommend Keel to friends` : `No mobile number saved for ${name}: WhatsApp will ask who to send it to`}
      onClick={() => note.mutate({ applicantId: applicant.id, ...noteActivity('whatsapp', 'Asked them to recommend Keel to friends who need a home') }, {
        onError: (e) => toast((e as Error).message, 'danger'),
      })}
      className={button}>
      <Icon name="share" size={16} />Ask {name} to recommend Keel
    </a>
  );
}

/** On a property's best clients: this client, for this property, to its provider on WhatsApp ("Salam ..."), once the
 *  client agreed to their details going to landlords. Noted on their timeline as shared, not as contact. */
export function LandlordShareLink({ applicant, property }: { applicant: Applicant; property: Property }) {
  const { providers } = useProviders();
  const { myName } = usePeople();
  const log = useLogShare();
  const provider = providerFor(property, providers);
  const blocked = landlordShareBlocked(applicant);
  const who = provider?.name ?? 'the landlord or agent';
  const label = <span className="hidden sm:inline">Landlord</span>;
  if (blocked) return <span className={`${iconButton} ${off}`} title={blocked} aria-disabled><Icon name="share" size={15} />{label}</span>;
  const number = waNumber(provider?.whatsapp ?? null);
  const title = number ? `Share ${first(applicant.full_name)} with ${who} for ${shortAddress(property.address_line)} on WhatsApp`
    : `No WhatsApp number for ${who}: WhatsApp will ask who to send it to`;
  return (
    <a href={waLink(number, landlordShareText(applicant, property, provider, myName))} target="_blank" rel="noreferrer" title={title} aria-label={title}
      onClick={() => log.mutate({ applicant, how: `WhatsApp to ${who} for ${shortAddress(property.address_line)}` })} className={iconButton}>
      <Icon name="share" size={15} />{label}
    </a>
  );
}

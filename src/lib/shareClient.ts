// Sharing a client with a landlord or agent who might have something for them: a short
// description to send on WhatsApp, by email, or to copy.
//
// Privacy, as for requests to providers: first name, household and benefits, plus what they
// are looking for (size, areas, budget). Never a surname, phone number, email or anything
// medical. Sending it needs the client's agreement (applicants.share_with_landlords).

import type { Applicant } from './types';
import { benefitWords, firstNameOf, householdWords } from './requests';
import { clientNeeds } from './propertyMatch';
import { canonicalBorough } from './london';
import { money } from './format';
import { isUrgent } from './search';

const sizeWanted = (min: number, max: number) =>
  min === max ? (min === 0 ? 'a studio' : `a ${min} bed`) : min === 0 ? `a studio or ${max} bed` : `a ${min} to ${max} bed`;
const orList = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** The client, in words a landlord or agent sees. */
export function clientShareText(a: Applicant, myName: string | null): string {
  const need = clientNeeds(a);
  const benefits = benefitWords(a);
  const council = canonicalBorough(a.council || a.referring_borough);
  const lines = [
    'Salam, I have a client who may suit one of your properties:',
    `• ${firstNameOf(a)}, ${householdWords(a)}`,
    benefits !== 'benefits not given' ? `• On ${benefits}` : null,
    need.beds ? `• Looking for ${sizeWanted(need.beds.min, need.beds.max)}${need.selfContained ? ', self-contained only' : ''}`
      : need.selfContained ? '• Self-contained only' : null,
    need.askNames.length ? `• In or near ${orList(need.askNames.slice(0, 4))}` : null,
    a.budget_pcm ? `• Budget up to ${money(a.budget_pcm)} pcm` : null,
    council ? `• Council: ${council}` : null,
    isUrgent(a) ? '• Ready to move quickly' : null,
    '',
    'Let me know if you have anything that would suit.',
    `Thanks, ${myName ? `${myName}, ` : ''}Keel Lettings`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

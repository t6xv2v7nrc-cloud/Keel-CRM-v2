// Awaiting reply (brief C1): clients who messaged Keel, or were handed over by the WhatsApp AI, and have heard nothing
// back. Their message is when it arrived in the Bin (applicants.last_inbound_at, 0037; before 0037, when they first got
// in touch); Keel's reply is the newest of a contact note, a call, a WhatsApp send (activities) or last_contact_at.
// Anyone still waiting after 24 hours is shown in red. Messages older than Team settings `responses.watchDays` (14) are
// not chased, nor are clients on ice, housed or lost.

import type { Applicant } from './types';
import { isActive, isIced } from './search';
import { activeSettings } from './settings';

export const REPLY_WITHIN_HOURS = 24;

export interface Awaiting {
  applicant: Applicant;
  /** when their message arrived */
  since: string;
  /** hours they have waited */
  hours: number;
  /** waited 24 hours or more: shown in red */
  late: boolean;
}

/** When the client last messaged Keel: recorded (0037), else when they first got in touch. */
export const lastInboundOf = (a: Applicant): string | null => a.last_inbound_at ?? ('last_inbound_at' in a ? null : a.created_at);

/** Everyone still waiting for Keel to reply, longest waiting first. `lastContactOf` gives the newest contact on their
 *  timeline (useLastContacts); last_contact_at counts too. */
export function awaitingReply(applicants: Applicant[], lastContactOf: (id: string) => string | null = () => null, now = new Date()): Awaiting[] {
  const watch = activeSettings().responses.watchDays * 86_400_000;
  const out: Awaiting[] = [];
  for (const a of applicants) {
    if (!isActive(a) || isIced(a, now)) continue;
    const since = lastInboundOf(a);
    if (!since) continue;
    const at = Date.parse(since);
    if (!Number.isFinite(at) || now.getTime() - at > watch || at > now.getTime() + 60_000) continue;
    const replies = [a.last_contact_at, lastContactOf(a.id)].filter((x): x is string => !!x).map(Date.parse).filter(Number.isFinite);
    if (replies.some((r) => r >= at)) continue;
    const hours = Math.max(0, Math.floor((now.getTime() - at) / 3_600_000));
    out.push({ applicant: a, since, hours, late: hours >= REPLY_WITHIN_HOURS });
  }
  return out.sort((x, y) => y.hours - x.hours);
}

/** "Waiting 30 hours", "Waiting 2 days", "Messaged 3 hours ago". */
export function waitWords(w: Pick<Awaiting, 'hours' | 'late'>): string {
  if (!w.late) return w.hours < 1 ? 'Messaged just now' : `Messaged ${w.hours} ${w.hours === 1 ? 'hour' : 'hours'} ago`;
  return w.hours < 48 ? `Waiting ${w.hours} hours` : `Waiting ${Math.floor(w.hours / 24)} days`;
}

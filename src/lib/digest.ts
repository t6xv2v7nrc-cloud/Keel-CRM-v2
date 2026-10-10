// The morning summary: today in a few lines, to read on Home or send to your own WhatsApp.
// Viewings today, next steps due, providers to chase, money overdue or due this week, first rents to
// check, move-in checks still open, and clients who have stopped moving. First names and short
// addresses only: it may be sent through WhatsApp.

import type { Applicant, Deal, Provider, ProviderRequest, Receivable } from './types';
import { activeSettings } from './settings';
import { isoDay } from './calls';
import { clockTime, longDay, money } from './format';
import { checklistProgress, coldDays, shortAddress, stuckDays } from './progress';
import { isActive } from './search';
import { totals } from './money';
import { awaitingProviders, firstNameOf } from './requests';

export type DigestKey = 'viewings' | 'steps' | 'providers' | 'money' | 'movein' | 'cold' | 'stuck';
export interface DigestLine { key: DigestKey; text: string; to?: string }
export interface Digest { title: string; lines: DigestLine[]; text: string }

export interface DigestInput {
  applicants: Applicant[];
  deals: Deal[];
  receivables: Receivable[];
  requests: ProviderRequest[];
  providers: Provider[];
  /** The move-in checklist (Team settings); the saved one when left out. */
  checklist?: string[];
  now?: Date;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Ivo, Ana and Ben", or "Ivo, Ana, Ben and 2 more" */
function list(items: string[], show = 3): string {
  const shown = items.slice(0, show);
  const more = items.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown.join('');
}

/** A next step short enough for one line: "chase documents from the housing…" */
function brief(step: string, max = 32): string {
  const s = `${step.charAt(0).toLowerCase()}${step.slice(1)}`.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 12 ? cut.lastIndexOf(' ') : max).replace(/[,.;:]$/, '')}…`;
}

export function morningDigest({ applicants, deals, receivables, requests, providers, checklist, now = new Date() }: DigestInput): Digest {
  const today = isoDay(now);
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const first = (id: string) => { const a = byId.get(id); return a ? firstNameOf(a) : 'someone'; };
  const lines: DigestLine[] = [];

  // Viewings today, in time order
  const viewings = deals
    .filter((d) => d.status === 'viewing' && d.viewing_at && isoDay(new Date(d.viewing_at)) === today)
    .sort((a, b) => a.viewing_at!.localeCompare(b.viewing_at!));
  if (viewings.length) {
    lines.push({ key: 'viewings', text: `${plural(viewings.length, 'viewing')} today: ${viewings.map((d) => `${clockTime(d.viewing_at!)} ${first(d.applicant_id)} at ${shortAddress(d.address)}`).join('; ')}` });
  }

  // Next steps due today or overdue
  const due = applicants.filter((a) => isActive(a) && a.next_call_at && a.next_call_at <= today)
    .sort((a, b) => a.next_call_at!.localeCompare(b.next_call_at!));
  if (due.length) {
    const overdue = due.filter((a) => a.next_call_at! < today).length;
    const who = due.map((a) => (a.next_step ? `${firstNameOf(a)} (${brief(a.next_step)})` : firstNameOf(a)));
    lines.push({ key: 'steps', to: '/pipeline?calls=due', text: `${plural(due.length, 'next step')} due${overdue ? `, ${overdue} overdue` : ''}: ${list(who)}` });
  }

  // Providers who owe an answer
  const chase = awaitingProviders(requests, now).filter((x) => x.overdue);
  if (chase.length) {
    const nameOf = new Map(providers.map((p) => [p.id, p.name]));
    const who = chase.map(({ request: r }) => `${(r.provider_id && nameOf.get(r.provider_id)) || 'a provider'} (${shortAddress(r.property_address)})`);
    lines.push({ key: 'providers', text: `${plural(chase.length, 'provider')} to chase: ${list(who)}` });
  }

  // Money
  const t = totals(receivables, today);
  const money_ = [
    t.overdueCount ? `${money(t.overdue)} overdue (${t.overdueCount})` : null,
    t.soonCount ? `${money(t.soon)} due this week (${t.soonCount})` : null,
    t.checkRent ? `${plural(t.checkRent, 'first rent')} to check` : null,
  ].filter(Boolean);
  if (money_.length) lines.push({ key: 'money', to: '/finances', text: `Finances: ${money_.join(', ')}` });

  // Move-ins with checks still to do: accepted, or moved in within the last fortnight
  const items = checklist ?? activeSettings().moveInChecklist;
  const fortnight = isoDay(new Date(now.getTime() - 14 * 86_400_000));
  const open = deals
    .filter((d) => d.status === 'accepted' || (d.status === 'moved_in' && (d.move_in_on ?? '') >= fortnight))
    .map((d) => ({ d, p: checklistProgress(d, items) }))
    .filter(({ p }) => p.total > 0 && p.done < p.total);
  if (open.length) {
    lines.push({ key: 'movein', text: `Move-in checks open: ${list(open.map(({ d, p }) => `${first(d.applicant_id)}, ${shortAddress(d.address)} (${p.done} of ${p.total})`))}` });
  }

  // Stopped moving
  const cold = applicants.filter((a) => isActive(a) && coldDays(a, deals, now) !== null);
  const coldIds = new Set(cold.map((a) => a.id));
  const stuck = applicants.filter((a) => !coldIds.has(a.id) && stuckDays(a, deals, now) !== null);
  if (stuck.length) lines.push({ key: 'stuck', to: '/pipeline?progress=stuck', text: `${plural(stuck.length, 'client')} stuck: ${list(stuck.map(firstNameOf))}` });
  if (cold.length) lines.push({ key: 'cold', to: '/pipeline?progress=cold', text: `${plural(cold.length, 'lead')} gone cold, ready to move to Lost` });

  const title = `Keel, ${longDay(now)}`;
  const body = lines.length ? lines.map((l) => `• ${l.text}`).join('\n') : 'Nothing due today.';
  return { title, lines, text: `${title}\n${body}` };
}

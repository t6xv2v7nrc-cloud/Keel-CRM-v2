// Notes on a client, and when each was last contacted. A note says how you
// spoke (a call, WhatsApp, a text, an email, in person) or is just a note. It
// is kept on the client's timeline (activities: kind "contact", or "note" when
// nobody was spoken to), so it needs no database change. Calls logged on the
// Calls page and properties sent on WhatsApp count as contact too.

import type { Activity, Call } from './types';

export type Channel = 'call' | 'whatsapp' | 'text' | 'email' | 'in_person' | 'note';

export const CHANNELS: ReadonlyArray<{ key: Channel; label: string }> = [
  { key: 'call', label: 'Call' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'text', label: 'Text' },
  { key: 'email', label: 'Email' },
  { key: 'in_person', label: 'In person' },
  { key: 'note', label: 'Just a note' },
];
export const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label])) as Record<Channel, string>;

/** Activity kinds that mean the client was spoken to or sent something. */
export const CONTACT_KINDS = ['contact', 'call', 'whatsapp'] as const;
export const NOTE_KINDS = ['contact', 'note'] as const;

/** The activity row for a note: "WhatsApp: Talked about Thursday's viewing". */
export function noteActivity(channel: Channel, text: string): { kind: 'contact' | 'note'; body: string } {
  const t = text.trim();
  return channel === 'note' ? { kind: 'note', body: t } : { kind: 'contact', body: `${CHANNEL_LABEL[channel]}: ${t}` };
}

/** A note or contact read back from its activity row; null if the row is neither. */
export function readNote(act: Pick<Activity, 'kind' | 'body'>): { channel: Channel; text: string } | null {
  if (act.kind === 'note') return { channel: 'note', text: act.body };
  if (act.kind === 'call') return { channel: 'call', text: act.body };
  if (act.kind === 'whatsapp') return { channel: 'whatsapp', text: act.body };
  if (act.kind !== 'contact') return null;
  for (const c of CHANNELS) {
    if (c.key !== 'note' && act.body.startsWith(`${c.label}: `)) return { channel: c.key, text: act.body.slice(c.label.length + 2) };
  }
  return { channel: 'call', text: act.body };
}

export interface LastContact { at: string; channel: Channel; text: string; actor: string | null }

/**
 * When each client was last contacted, and how: the newest of their contact
 * notes, calls and WhatsApp sends. Plain notes (nobody spoken to) do not count.
 */
export function lastContacts(activities: Array<Pick<Activity, 'entity_type' | 'entity_id' | 'kind' | 'body' | 'created_at'> & { actor?: string | null }>,
  calls: Array<Pick<Call, 'applicant_id' | 'created_at' | 'notes'> & { created_by?: string | null }> = []): Map<string, LastContact> {
  const out = new Map<string, LastContact>();
  const offer = (id: string, c: LastContact) => {
    const had = out.get(id);
    if (!had || c.at > had.at) out.set(id, c);
  };
  for (const a of activities) {
    if (a.entity_type !== 'applicant' || !(CONTACT_KINDS as readonly string[]).includes(a.kind)) continue;
    const n = readNote(a);
    if (n) offer(a.entity_id, { at: a.created_at, channel: n.channel, text: n.text, actor: a.actor ?? null });
  }
  for (const c of calls) offer(c.applicant_id, { at: c.created_at, channel: 'call', text: c.notes ?? 'Call', actor: c.created_by ?? null });
  return out;
}

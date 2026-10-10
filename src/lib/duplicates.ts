// Clients who look like the same person entered twice: the same phone or email (almost certainly the same
// person), or the same name (likely, but two people can share a name, so it is shown as a question).

import type { Applicant } from './types';
import { toE164 } from './format';
import { STAGE_ORDER } from './progress';

export interface DuplicateGroup {
  key: string;
  clients: Applicant[];
  /** "same phone", "same email", "same name" */
  reasons: string[];
  /** Phone or email match: almost certainly the same person. */
  sure: boolean;
  /** The record to keep: furthest along, then the one with more filled in, then the oldest. */
  keep: Applicant;
}

const phoneKey = (p: string | null) => (p ? toE164(p) ?? p.replace(/\D/g, '') : '') || null;
const emailKey = (e: string | null) => e?.trim().toLowerCase() || null;
const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ') || null;
const stageRank = (a: Applicant) => (a.stage === 'lost' ? -1 : STAGE_ORDER.indexOf(a.stage));
const filled = (a: Applicant) => Object.values(a).filter((v) => v !== null && v !== '' && v !== undefined).length;

/** More clients than this on one phone, email or name means a shared contact (or a common name), not a duplicate. */
export const MAX_SHARED = 3;

/** The record to keep out of a group of duplicates. */
export function keeperOf(clients: Applicant[]): Applicant {
  return [...clients].sort((a, b) => stageRank(b) - stageRank(a) || filled(b) - filled(a) || a.created_at.localeCompare(b.created_at))[0];
}

/** Groups of clients who look like the same person, the surest first. */
export function duplicateGroups(applicants: Applicant[]): DuplicateGroup[] {
  // join records that share a phone, an email or a (word-order-free) name
  const parent = new Map<string, string>();
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const why = new Map<string, Set<string>>(); // pair key -> reasons
  const firstBy = new Map<string, string>();
  const note = (k: string, id: string, reason: string) => {
    const other = firstBy.get(k);
    if (!other) { firstBy.set(k, id); return; }
    join(other, id);
    const pair = [other, id].sort().join('|');
    why.set(pair, (why.get(pair) ?? new Set()).add(reason));
  };
  const keysOf = (a: Applicant): [string, string][] => {
    const out: [string, string][] = [];
    const p = phoneKey(a.phone); if (p && p.length >= 10) out.push([`p:${p}`, 'same phone']);
    const e = emailKey(a.email); if (e) out.push([`e:${e}`, 'same email']);
    const n = nameKey(a.full_name); if (n && n.includes(' ')) out.push([`n:${n}`, 'same name']);
    return out;
  };
  // a phone or email on more than a few clients is a shared one (a support worker's, an office line), not one person
  const uses = new Map<string, number>();
  for (const a of applicants) for (const [k] of keysOf(a)) uses.set(k, (uses.get(k) ?? 0) + 1);
  for (const a of applicants) {
    for (const [k, reason] of keysOf(a)) if ((uses.get(k) ?? 0) <= MAX_SHARED) note(k, a.id, reason);
  }
  const groups = new Map<string, Applicant[]>();
  for (const a of applicants) {
    const r = find(a.id);
    groups.set(r, [...(groups.get(r) ?? []), a]);
  }
  const out: DuplicateGroup[] = [];
  for (const [root, clients] of groups) {
    if (clients.length < 2) continue;
    const ids = new Set(clients.map((c) => c.id));
    const reasons = new Set<string>();
    for (const [pair, rs] of why) { const [x, y] = pair.split('|'); if (ids.has(x) && ids.has(y)) rs.forEach((r) => reasons.add(r)); }
    const list = [...reasons].sort();
    out.push({ key: root, clients, reasons: list, sure: list.some((r) => r !== 'same name'), keep: keeperOf(clients) });
  }
  return out.sort((a, b) => Number(b.sure) - Number(a.sure) || a.keep.full_name.localeCompare(b.keep.full_name));
}

// ── "Not the same person" ──────────────────────────────────────────

const KEY = 'keel.notDuplicates.v1';
export const groupId = (g: Pick<DuplicateGroup, 'clients'>) => g.clients.map((c) => c.id).sort().join('|');

/** Groups someone has said are different people, on this device. */
export function dismissedGroups(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function dismissGroup(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([...dismissedGroups(), id])); } catch { /* private window: it simply shows again */ }
}

/** Duplicate groups still to look at: those nobody has said are different people. */
export const openGroups = (applicants: Applicant[], dismissed = dismissedGroups()) =>
  duplicateGroups(applicants).filter((g) => !dismissed.has(groupId(g)));

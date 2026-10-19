// Housing officers on the map: grouped by the council they work for, each council placed at the middle of its
// postcode districts (or, for a council outside the districts Keel knows, found by its name on postcodes.io;
// geo.ts does the placing). Officers on the officer list (Councils) carry their send status from the one mailing
// list rule; officers only named on clients show as not on the list, placed by their email's council or their
// client's.

import type { Applicant } from './types';
import type { OfficerRecord, OfficerStatus } from './councils';
import { boroughOf, focusRank, mailingList, recordFor, statusOf, STATUS_WORDS } from './councils';
import { officersFrom } from './officers';
import { nominationsFrom } from './mailer';
import { canonicalBorough, districtsOfBorough, LONDON_BOROUGHS } from './london';
import { councilOf } from './search';
import { todayIso } from './calls';

export interface MappedOfficer {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** on the officer list (Councils), or only named on clients */
  listed: boolean;
  status: OfficerStatus | null;
  /** on the mailing list: property emails can go to them */
  sendable: boolean;
  /** how they stand, in words: "Can be emailed", "Left", "Not on the officer list" */
  words: string;
  clients: number;
  active: number;
  lastSent: string | null;
}

export interface OfficerPlace {
  /** the council: a borough name where Keel knows it ("Harrow"), else as written ("Watford") */
  council: string;
  /** what places it: its postcode districts, else a place name to look up */
  districts: string[];
  query: string;
  london: boolean;
  focus: 0 | 1 | 2;
  officers: MappedOfficer[];
  sendable: number;
}

/** "Watford Borough Council" is Watford, "London Borough of Harrow" is Harrow, "Royal Borough of Windsor and Maidenhead"
 *  is Windsor and Maidenhead. */
export function councilPlaceName(council: string): string {
  return council
    .replace(/\b(?:london|royal|metropolitan)?\s*borough\s+of\b|\bcity\s+and\s+county\s+of\b|\bdistrict\s+of\b|\bcounty\s+of\b/gi, ' ')
    .replace(/\b(?:borough|district|city|county|metropolitan|unitary|town)?\s*council\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The council an officer works for: a known borough, else the council as recorded, else none. */
function councilFor(x: { council?: string | null; borough?: string | null }): string | null {
  const b = boroughOf(x);
  if (b) return b;
  const raw = (x.council ?? x.borough ?? '').trim();
  return raw ? councilPlaceName(raw) || null : null;
}

/** Every housing officer, by council, ready to place on the map; and those with no council to place them by. */
export function officerPlaces(records: OfficerRecord[], applicants: Applicant[], today = todayIso()): { places: OfficerPlace[]; unplaced: MappedOfficer[] } {
  const list = mailingList(records, { today, nominatedFromClients: nominationsFrom(applicants) });
  const sendable = new Set(list.to.map(({ officer }) => String(officer.id)));
  const leftWhy = new Map(list.left.map(({ officer, why }) => [String(officer.id), why]));
  const byId = new Map(applicants.map((a) => [a.id, a]));

  // their clients: joined to the list by email or phone; the rest are officers only named on clients
  const counts = new Map<string, { clients: number; active: number }>();
  const extra: Array<{ officer: MappedOfficer; council: string | null }> = [];
  for (const o of officersFrom(applicants)) {
    const rec = recordFor({ email: o.email, phone: o.phone }, records);
    if (rec) {
      const c = counts.get(String(rec.id)) ?? { clients: 0, active: 0 };
      counts.set(String(rec.id), { clients: c.clients + o.clients.length, active: c.active + o.active });
      continue;
    }
    const firstClient = o.clients.map((c) => byId.get(c.id)).find((a) => a && councilOf(a));
    extra.push({
      council: canonicalBorough(o.org) ?? (firstClient ? councilOf(firstClient) : null),
      officer: {
        key: `client:${o.key}`, name: o.name ?? o.email ?? 'An officer', email: o.email, phone: o.phone, listed: false, status: null,
        sendable: false, words: 'Not on the officer list', clients: o.clients.length, active: o.active, lastSent: null,
      },
    });
  }

  const listed = records.map((r) => {
    const id = String(r.id);
    const c = counts.get(id) ?? { clients: 0, active: 0 };
    const status = statusOf(r, today);
    const can = sendable.has(id);
    return {
      council: councilFor(r),
      officer: {
        key: id, name: r.name?.trim() || r.email || 'An officer', email: r.send_to_mailbox?.trim() || r.email?.trim() || null, phone: r.phone?.trim() || null,
        listed: true, status, sendable: can,
        words: can ? 'Can be emailed' : status !== 'active' ? STATUS_WORDS[status] : leftWhy.get(id) ?? 'Not emailed',
        clients: c.clients, active: c.active, lastSent: r.last_sent_at ?? null,
      } satisfies MappedOfficer,
    };
  });

  const groups = new Map<string, MappedOfficer[]>();
  const unplaced: MappedOfficer[] = [];
  for (const { council, officer } of [...listed, ...extra]) {
    if (!council) { unplaced.push(officer); continue; }
    groups.set(council, [...(groups.get(council) ?? []), officer]);
  }
  const places = [...groups].map(([council, officers]): OfficerPlace => ({
    council,
    districts: districtsOfBorough(council),
    query: council,
    london: LONDON_BOROUGHS.has(council),
    focus: focusRank(council),
    officers: officers.sort((x, y) => Number(y.sendable) - Number(x.sendable) || Number(y.listed) - Number(x.listed) || x.name.localeCompare(y.name)),
    sendable: officers.filter((o) => o.sendable).length,
  })).sort((a, b) => a.focus - b.focus || a.council.localeCompare(b.council));
  return { places, unplaced };
}

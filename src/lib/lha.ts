// Local Housing Allowance: how a property's rent compares with the LHA rate
// for its size in its Broad Rental Market Area (BRMA).
//
// Size rules (house rules): studios and en-suite rooms count as 1 bed; other
// rooms are judged against the shared accommodation rate; LHA stops at 4 bed.
//
// Which BRMA a property is in, best first:
//   1. set by hand on the property (properties.lha_area)
//   2. a team correction for its postcode district (Team settings)
//   3. an estimate from its postcode district, then its borough
// The estimates below are a best guess: BRMA boundaries follow postcode
// sectors, not districts or boroughs, so check anything that matters on the
// VOA's LHA Direct and correct it (it is remembered).

import { LHA_RATES, LHA_YEAR } from '../data/lha-rates';
import { POSTCODE_PLACES } from '../data/postcode-places';
import { activeSettings } from './settings';
import { boroughFromDistrict, canonicalBorough, districtOf } from './london';

export const LHA_DIRECT_URL = 'https://lha-direct.voa.gov.uk/search.aspx';

export type LhaSize = 'shared' | 1 | 2 | 3 | 4;
export const sizeWords = (s: LhaSize) => (s === 'shared' ? 'shared room' : `${s} bed`);

export interface LhaTable { year: string; rates: Record<string, number[]> }

/** The rates in use: a year loaded in Team settings, or the built-in one. */
export const lhaTable = (): LhaTable => activeSettings().lhaRates ?? { year: LHA_YEAR, rates: LHA_RATES };
export const brmaNames = () => Object.keys(lhaTable().rates).sort((a, b) => a.localeCompare(b));

// Keel works London and the home counties, so lists show those first; the rest of England is one click away.
const LONDON_BRMAS = new Set([
  'Central London', 'Inner East London', 'Inner North London', 'Inner South East London', 'Inner South West London', 'Inner West London',
  'North West London', 'Outer East London', 'Outer North East London', 'Outer North London', 'Outer South East London',
  'Outer South London', 'Outer South West London', 'Outer West London',
]);
const HOME_COUNTIES_BRMAS = new Set([
  'Ashford', 'Aylesbury', 'Bedford', 'Blackwater Valley', 'Canterbury', 'Chelmsford', 'Chilterns', 'Colchester', 'Crawley and Reigate',
  'Dover-Shepway', 'East Thames Valley', 'Guildford', 'Harlow and Stortford', 'High Weald', 'Luton', 'Maidstone', 'Medway and Swale',
  'Milton Keynes', 'Newbury', 'North West Kent', 'Reading', 'South East Herts', 'South West Essex', 'South West Herts', 'Southend',
  'Stevenage and North Herts', 'Thanet', 'Walton',
]);

/** Areas grouped for a picker: London, the home counties, and (when asked for) the rest of England.
 *  An area already chosen elsewhere always shows, so a saved choice never looks blank. */
export function brmaGroups(showAll: boolean, keep?: string | null): Array<[string, string[]]> {
  const names = brmaNames();
  const london = names.filter((n) => LONDON_BRMAS.has(n));
  const home = names.filter((n) => HOME_COUNTIES_BRMAS.has(n));
  const rest = names.filter((n) => !LONDON_BRMAS.has(n) && !HOME_COUNTIES_BRMAS.has(n));
  const groups: Array<[string, string[]]> = [['London', london], ['Home counties', home]];
  if (showAll) groups.push(['Rest of England', rest]);
  else if (keep && rest.includes(keep)) groups.push(['Elsewhere', [keep]]);
  return groups.filter(([, xs]) => xs.length > 0);
}

export function rateFor(brma: string, size: LhaSize): number | null {
  const r = lhaTable().rates[brma];
  if (!r) return null;
  const v = size === 'shared' ? r[0] : r[size];
  return typeof v === 'number' ? v : null;
}

// ── Which BRMA ─────────────────────────────────────────────────────

const group = (brma: string, districts: string) => districts.split(/\s+/).filter(Boolean).map((d) => [d, brma] as const);

/** Estimated BRMA by postcode district (London and the edges we see in stock lists). */
const DISTRICT_BRMA: Record<string, string> = Object.fromEntries([
  ...group('Central London', 'WC1 WC2 EC1 EC2 EC3 EC4 W1 W2 W8 W9 W11 SW1 SW3 SW5 SW7 SW10 NW1 NW8 SE1 SE11'),
  // NW2, NW6, NW10 and NW11: stock lists price studios there at £1,436 to £1,439.97, the Inner North London 1 bed rate
  ...group('Inner North London', 'N1 N2 N4 N5 N6 N7 N8 N10 N16 N19 NW2 NW3 NW5 NW6 NW10 NW11'),
  ...group('Outer North London', 'N3 N9 N11 N12 N13 N14 N15 N17 N18 N20 N21 N22 EN1 EN2 EN3 EN4 EN5'),
  ...group('North West London', 'NW4 NW7 NW9 HA0 HA1 HA2 HA3 HA5 HA7 HA8 HA9'),
  ...group('Inner East London', 'E1 E2 E3 E5 E6 E7 E8 E9 E12 E13 E14 E15 E16 E20'),
  ...group('Outer North East London', 'E4 E10 E11 E17 E18 IG1 IG2 IG3 IG4 IG5 IG6 IG7 IG8'),
  ...group('Outer East London', 'IG11 RM1 RM2 RM3 RM5 RM6 RM7 RM8 RM9 RM10 RM11 RM12 RM13 RM14'),
  ...group('Inner South East London', 'SE3 SE4 SE5 SE6 SE7 SE8 SE10 SE13 SE14 SE15 SE16 SE17 SE21 SE22 SE23 SE24 SE26 SE27'),
  ...group('Outer South East London', 'SE2 SE9 SE12 SE18 SE20 SE28 BR1 BR2 BR3 BR4 BR5 BR6 BR7 DA5 DA6 DA7 DA8 DA14 DA15 DA16 DA17 DA18'),
  ...group('Inner South West London', 'SW2 SW4 SW6 SW8 SW9 SW11 SW12 SW15 SW16 SW17 SW18 SW19'),
  ...group('Outer South West London', 'SW13 SW14 SW20 KT1 KT2 KT3 KT4 KT5 KT6 KT9 TW1 TW2 TW9 TW10 TW11 TW12'),
  ...group('Outer South London', 'CR0 CR2 CR4 CR5 CR7 CR8 SE19 SE25 SM1 SM2 SM3 SM4 SM5 SM6'),
  ...group('Inner West London', 'W3 W4 W5 W6 W10 W12 W14'),
  ...group('Outer West London', 'W7 W13 UB1 UB2 UB3 UB4 UB5 UB6 UB7 UB8 UB9 UB10 UB11 TW3 TW4 TW5 TW6 TW7 TW8 TW13 TW14 HA4 HA6'),
  // Home counties: rougher estimates, as these areas follow council boundaries that districts cross
  ...group('South West Herts', 'WD3 WD4 WD5 WD6 WD7 WD17 WD18 WD19 WD23 WD24 WD25 HP1 HP2 HP3 HP4 HP23 AL1 AL2 AL3 AL4 AL5 EN6'),
  ...group('South East Herts', 'EN7 EN8 EN10 EN11 SG12 SG13 SG14 AL6 AL7 AL8 AL9 AL10'),
  ...group('Stevenage and North Herts', 'SG1 SG2 SG4 SG5 SG6 SG7 SG8'),
  ...group('Harlow and Stortford', 'CM17 CM18 CM19 CM20 CM21 CM22 CM23'),
  ...group('Luton', 'LU1 LU2 LU3 LU4 LU5 LU6 LU7'),
  ...group('Bedford', 'MK40 MK41 MK42'),
  ...group('Chelmsford', 'CM1 CM2 CM3 CM4 CM9'),
  ...group('South West Essex', 'RM15 RM16 RM17 RM18 RM19 RM20 SS13 SS14 SS15 SS16 SS17 CM11 CM12 CM13 CM14 CM15'),
  ...group('Southend', 'SS0 SS1 SS2 SS3 SS4 SS5 SS6 SS7 SS8 SS9 SS11 SS12'),
  ...group('Colchester', 'CO1 CO2 CO3 CO4 CO15 CO16'),
  ...group('North West Kent', 'DA1 DA2 DA3 DA4 DA9 DA10 DA11 DA12 DA13 BR8 TN13 TN14 TN15'),
  ...group('Medway and Swale', 'ME1 ME2 ME3 ME4 ME5 ME7 ME8 ME10 ME12 ME13'),
  ...group('Maidstone', 'ME14 ME15 ME16 ME19 ME20'),
  ...group('High Weald', 'TN1 TN2 TN4 TN9 TN10'),
  ...group('Ashford', 'TN23 TN24'),
  ...group('Canterbury', 'CT1 CT2 CT5 CT6'),
  ...group('Thanet', 'CT9 CT10 CT11'),
  ...group('Dover-Shepway', 'CT16 CT17 CT19 CT20'),
  ...group('Walton', 'KT7 KT8 KT10 KT11 KT12 KT13 KT14 KT15 KT16 KT17 KT18 KT19 KT21 KT22 KT23 TW15 TW16 TW17 TW18 TW19 TW20'),
  ...group('Guildford', 'GU1 GU2 GU4 GU7 GU21 GU22 KT24'),
  ...group('Blackwater Valley', 'GU9 GU11 GU14 GU15'),
  ...group('Crawley and Reigate', 'RH1 RH2 RH6 RH10 RH11 RH12 RH13 SM7 KT20'),
  ...group('East Thames Valley', 'SL0 SL1 SL2 SL3 SL4 SL5 SL6'),
  ...group('Reading', 'RG1 RG2 RG4 RG5 RG6 RG10 RG30 RG31 RG40 RG41'),
  ...group('Newbury', 'RG14'),
  ...group('Chilterns', 'HP5 HP6 HP7 HP9 HP10 HP11 HP12 HP13 SL7 SL9'),
  ...group('Aylesbury', 'HP19 HP20 HP21'),
  ...group('Milton Keynes', 'MK1 MK2 MK3 MK6 MK9'),
]);

/** Fallback by borough when there is no postcode. */
const BOROUGH_BRMA: Record<string, string> = {
  Barnet: 'Outer North London', Enfield: 'Outer North London', Haringey: 'Outer North London',
  Camden: 'Inner North London', Islington: 'Inner North London',
  Hackney: 'Inner East London', 'Tower Hamlets': 'Inner East London', Newham: 'Inner East London',
  'Waltham Forest': 'Outer North East London', Redbridge: 'Outer North East London',
  'Barking & Dagenham': 'Outer East London', Havering: 'Outer East London',
  Brent: 'North West London', Harrow: 'North West London',
  Ealing: 'Outer West London', Hillingdon: 'Outer West London', Hounslow: 'Outer West London',
  'Hammersmith & Fulham': 'Inner West London',
  'Kensington & Chelsea': 'Central London', Westminster: 'Central London', 'City of London': 'Central London',
  Lambeth: 'Inner South West London', Wandsworth: 'Inner South West London',
  Southwark: 'Inner South East London', Lewisham: 'Inner South East London',
  Greenwich: 'Outer South East London', Bexley: 'Outer South East London', Bromley: 'Outer South East London',
  Croydon: 'Outer South London', Sutton: 'Outer South London',
  Merton: 'Outer South West London', 'Kingston upon Thames': 'Outer South West London', 'Richmond upon Thames': 'Outer South West London',
  Reading: 'Reading', Slough: 'East Thames Valley', Thurrock: 'South West Essex', Norwich: 'Central Norfolk and Norwich',
};

export interface PropertyForLha {
  address_line: string;
  postcode: string | null;
  borough: string | null;
  property_type: string | null;
  bedrooms: number | null;
  rent_pcm: number | null;
  rent_text: string | null;
  lha_area?: string | null;
}

export interface LhaArea {
  brma: string;
  /** set: chosen on the property; team: a team correction; estimated: our guess */
  how: 'set' | 'team' | 'estimated';
  /** what the estimate or correction was based on: "N17" or "Haringey" */
  basis: string | null;
}

export function lhaAreaFor(p: PropertyForLha): LhaArea | null {
  const known = lhaTable().rates;
  if (p.lha_area && known[p.lha_area]) return { brma: p.lha_area, how: 'set', basis: null };
  return areaFor(districtOf(p.postcode ?? '') ?? districtOf(p.address_line), p.borough);
}

/** A postcode district's area: a team correction, then our estimate, then the borough's. */
function areaFor(district: string | null, boroughText: string | null): LhaArea | null {
  const known = lhaTable().rates;
  const team = activeSettings().lhaAreaOverrides ?? {};
  if (district && team[district] && known[team[district]]) return { brma: team[district], how: 'team', basis: district };
  if (district && DISTRICT_BRMA[district] && known[DISTRICT_BRMA[district]]) return { brma: DISTRICT_BRMA[district], how: 'estimated', basis: district };
  const borough = canonicalBorough(boroughText) ?? boroughFromDistrict(district);
  if (borough && team[borough] && known[team[borough]]) return { brma: team[borough], how: 'team', basis: borough };
  if (borough && BOROUGH_BRMA[borough] && known[BOROUGH_BRMA[borough]]) return { brma: BOROUGH_BRMA[borough], how: 'estimated', basis: borough };
  return null;
}

// ── Postcode lookup ────────────────────────────────────────────────

/** "nw11", "NW11 9LJ", "ha87ab", "SW1A 1AA" → the district Keel keys on ("NW11", "HA8", "SW1"). */
export function parseDistrict(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const full = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/.exec(s);
  const d = full ? full[1] : /^[A-Z]{1,2}\d[A-Z\d]?$/.test(s) ? s : null;
  return d ? d.replace(/^([A-Z]+\d)[A-Z]$/, '$1') : null;
}

export interface PostcodeLookup {
  district: string;
  /** the places people know it by: "Golders Green, Hampstead Garden Suburb" */
  places: string | null;
  borough: string | null;
  area: LhaArea | null;
}

/** Where a postcode is and which LHA area it is in (as Keel would judge a property there). */
export function lookupPostcode(input: string): PostcodeLookup | null {
  const district = parseDistrict(input);
  if (!district) return null;
  return { district, places: POSTCODE_PLACES[district] ?? null, borough: boroughFromDistrict(district), area: areaFor(district, null) };
}

/** Districts whose places match some text: "golders" → NW11. */
export function searchPlaces(text: string, limit = 6): PostcodeLookup[] {
  const t = text.trim().toLowerCase();
  if (t.length < 3 || parseDistrict(t)) return [];
  const starts = new RegExp(`(^|[ ,(])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return Object.entries(POSTCODE_PLACES)
    .filter(([, places]) => starts.test(places.toLowerCase()))
    .slice(0, limit)
    .map(([district]) => lookupPostcode(district)!)
    .filter(Boolean);
}

/** "Estimated from NW11", "Team setting for NW11", "Set by hand". */
export const areaSource = (a: LhaArea) =>
  a.how === 'set' ? 'set by hand' : a.how === 'team' ? `team setting for ${a.basis}` : `estimated from ${a.basis}`;

/** The postcode district a team correction would apply to. */
export const districtFor = (p: PropertyForLha) => districtOf(p.postcode ?? '') ?? districtOf(p.address_line);

// ── Which size ─────────────────────────────────────────────────────

/** Studios and en-suite rooms count as 1 bed; other rooms as a shared room; 4 bed at most. */
export function lhaSizeOf(p: Pick<PropertyForLha, 'property_type' | 'bedrooms'>): LhaSize | null {
  const t = (p.property_type ?? '').toLowerCase();
  if (/\b(studio|bedsit)\b/.test(t)) return 1;
  if (/\b(room|hmo)\b/.test(t) && !/bed/.test(t)) return /en[- ]?suite/.test(t) ? 1 : 'shared';
  const m = /(\d)\s*-?\s*bed/.exec(t);
  const beds = p.bedrooms ?? (m ? Number(m[1]) : null);
  if (beds === null) return null;
  return beds <= 1 ? 1 : (Math.min(4, beds) as LhaSize);
}

/** A rent written as an LHA rate ("1-Bed LHA", "Shared LHA", "LHA rate"), in pounds. */
function rentFromLhaText(text: string | null, brma: string, ownSize: LhaSize | null): number | null {
  if (!text || !/lha/i.test(text)) return null;
  if (/shared/i.test(text)) return rateFor(brma, 'shared');
  const m = /(\d)-?\s*bed/i.exec(text);
  if (m) return rateFor(brma, Math.min(4, Math.max(1, Number(m[1]))) as LhaSize);
  return ownSize ? rateFor(brma, ownSize) : null;
}

// ── The comparison ─────────────────────────────────────────────────

export interface LhaCheck {
  area: LhaArea;
  size: LhaSize;
  /** LHA rate for this size in this area, pcm */
  rate: number;
  /** rent pcm (worked out from "1-Bed LHA" style rents too), or null if not known */
  rent: number | null;
  /** rent minus rate: positive means over LHA */
  diff: number | null;
  status: 'under' | 'at' | 'over' | 'unknown';
}

const pounds = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/** How the rent compares with LHA for this property, or null if the area or size is not known. */
export function lhaCheck(p: PropertyForLha): LhaCheck | null {
  const area = lhaAreaFor(p);
  const size = lhaSizeOf(p);
  if (!area || !size) return null;
  const rate = rateFor(area.brma, size);
  if (rate === null) return null;
  const rent = p.rent_pcm ?? rentFromLhaText(p.rent_text, area.brma, size);
  if (rent === null) return { area, size, rate, rent: null, diff: null, status: 'unknown' };
  const diff = Math.round((rent - rate) * 100) / 100;
  return { area, size, rate, rent, diff, status: Math.abs(diff) < 1 ? 'at' : diff < 0 ? 'under' : 'over' };
}

/** "£36 over LHA", "£120 under LHA", "At LHA". */
export function lhaWords(c: LhaCheck): string {
  if (c.status === 'unknown' || c.diff === null) return `LHA ${pounds(c.rate)}`;
  if (c.status === 'at') return 'At LHA';
  return `${pounds(Math.abs(c.diff))} ${c.status === 'over' ? 'over' : 'under'} LHA`;
}

/** What rate a client is entitled to: singles and couples 1 bed, families by bedrooms needed.
 *  (Keel does not know ages, so the under-35 shared rate is not applied.) */
export function clientLhaSize(household: string | null, bedsNeeded: number | null): LhaSize | null {
  if (household === 'single' || household === 'couple') return 1;
  if (household === 'family') return Math.min(4, Math.max(2, bedsNeeded ?? 2)) as LhaSize;
  return null;
}

// ── Loading a new year's rates ─────────────────────────────────────

/** Reads a rates CSV in the published layout: area name, then shared, 1, 2, 3 and 4 bed monthly rates. */
export function parseLhaCsv(text: string): LhaTable {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new Error('The file looks empty.');
  const cells = (line: string) => {
    const out: string[] = []; let cur = ''; let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const header = cells(lines[0]).join(' ');
  const year = /(\d{4})\s*(?:to|-|\/)\s*(\d{2,4})/.exec(header)?.[0].replace(/\s*(?:-|\/)\s*/, ' to ') ?? 'uploaded rates';
  const rates: Record<string, number[]> = {};
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const nums = c.slice(1, 6).map((x) => Number(x.replace(/[^\d.]/g, '')));
    if (!c[0] || nums.length < 5 || nums.some((n) => !Number.isFinite(n) || n <= 0)) continue;
    rates[c[0]] = nums;
  }
  const count = Object.keys(rates).length;
  if (count < 10) throw new Error('Could not find the rates. The file needs one area per row: name, shared, 1 bed, 2 bed, 3 bed, 4 bed.');
  return { year, rates };
}

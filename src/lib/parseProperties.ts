// Turns a pasted list of available properties into structured rows.
// Handles the formats partner stock lists arrive in:
//   • one property per line: "Flat 2, 14 Bruce Grove, N17 6RA - Studio - £950 pcm bills inc"
//   • blocks: an address line then detail lines, blocks separated by blank lines
//   • rows copied from a spreadsheet (tab separated, with or without a header row)
//   • shared notes ("They are all en-suite rooms", "Rent is 1-bed LHA") applied to
//     every property that does not state its own value
//   • multi-unit lines ("Units 1 & 2", "Flats 1-3") expanded into one row each
//   • lines marked let / taken / under offer, or crossed out (~~), are skipped

import {
  areasIn, boroughFromDistrict, boroughOfArea, canonicalBorough, districtOf, POSTCODE_RE, titleCase,
} from './london';

export interface ParsedProperty {
  address_line: string;
  postcode: string | null;       // full postcode, or just the district ("N12") when that is all we have
  area: string | null;           // locality, e.g. "North Finchley"
  borough: string | null;
  property_type: string | null;  // label: "Studio", "En-suite Room", "1-Bed Flat"
  bedrooms: number | null;       // 0 for studios and rooms
  rent_pcm: number | null;
  rent_text: string | null;      // as stated: "1-Bed LHA", "£220 pw", "£950 pcm"
  bills: string | null;
  furnished: string | null;
  available_from: string | null; // YYYY-MM-DD
  notes: string;                 // the original text, plus any shared notes
  warnings: string[];
}

export interface ParseResult {
  properties: ParsedProperty[];
  sharedNotes: string[];
  skipped: string[];             // lines left out because they were let / taken / crossed out
}

// ── Field detectors ────────────────────────────────────────────────

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = (s: string) => NUM_WORDS[s.toLowerCase()] ?? Number(s);

interface Detected {
  type?: { label: string; bedrooms: number };
  rent?: { pcm: number | null; text: string; assumedWeekly?: boolean };
  bills?: string;
  furnished?: string;
  available?: string;
}

function detectType(t: string): Detected['type'] {
  // "2 bed", "two-bedroom" — but not when it is describing an LHA rent ("1-bed LHA", "LHA rate for 1 bed")
  const bedRe = /\b(\d|one|two|three|four|five)\s*[- ]?\s*(?:bed(?:room)?s?|br)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = bedRe.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 25), m.index);
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14);
    if (/^\s*(?:rate\s*)?lha\b/i.test(after) || /\blha\b[^,.;\n–-]{0,20}$/i.test(before)) continue;
    const n = num(m[1]);
    const kind = /\bhouse\b/i.test(t) ? 'House' : /\bmaisonette\b/i.test(t) ? 'Maisonette' : 'Flat';
    return { label: `${n}-Bed ${kind}`, bedrooms: n };
  }
  const ensuite = /\ben[- ]?suite\b/i.test(t);
  if (/\bself[- ]contained\s+studio\b/i.test(t)) return { label: 'Self-Contained Studio', bedrooms: 0 };
  if (/\bstudios?\b|\bbedsits?\b/i.test(t)) return { label: ensuite ? 'En-suite Studio' : 'Studio', bedrooms: 0 };
  if (/\bhmo\b/i.test(t)) return { label: ensuite ? 'En-suite HMO Room' : 'HMO Room', bedrooms: 0 };
  const withoutOtherRooms = t.replace(/\b(living|sitting|bath|shower|utility|box|dining|reception|store)\s*rooms?\b/gi, '');
  if (/\brooms?\b/i.test(withoutOtherRooms)) return { label: ensuite ? 'En-suite Room' : 'Room', bedrooms: 0 };
  return undefined;
}

function detectRent(t: string): Detected['rent'] {
  if (/\blha\b/i.test(t)) {
    const size = t.match(/\b(\d|one|two|three|four|shared|room)\s*[- ]?\s*bed(?:room)?\s*(?:rate\s*)?lha\b/i)
      ?? t.match(/\blha\b[^.\n]{0,24}?\b(\d|one|two|three|four|shared|room)\s*[- ]?\s*bed/i);
    const uncapped = /uncapped/i.test(t) ? ' (Uncapped)' : '';
    if (size) {
      const s = size[1].toLowerCase();
      return { pcm: null, text: `${s === 'shared' || s === 'room' ? 'Shared' : `${num(s)}-Bed`} LHA${uncapped}` };
    }
    return { pcm: null, text: `LHA rate${uncapped}` };
  }
  const m = t.match(/£\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(pcm|p\.c\.m\.?|pm|per\s+month|a\s+month|monthly|pw|p\.w\.?|per\s+week|a\s+week|weekly)?/i)
    ?? t.match(/\brent\s*[:=-]?\s*(\d{3,4})()\s*(pcm|pw)?\b/i);
  if (!m) return undefined;
  const value = Number(m[1].replace(/,/g, '')) + (m[2] ? Number(`0.${m[2]}`) : 0);
  const period = (m[3] ?? '').toLowerCase();
  const weekly = /w/.test(period) || (!period && value < 450); // a bare "£220" for a room is a weekly figure
  const shown = `£${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
  return {
    pcm: Math.round(weekly ? (value * 52) / 12 : value),
    text: weekly ? `${shown} pw` : `${shown} pcm`,
    assumedWeekly: weekly && !period,
  };
}

function detectBills(t: string): string | undefined {
  if (/\bexc(?:l|luding|\.)?\s*(?:of\s*)?(?:council\s*tax|bills|electric)|\bbills\s*(?:not\s*included|excluded|extra|on\s*top)/i.test(t)) {
    return /council\s*tax/i.test(t) && /electric/i.test(t) ? 'Exc. Council Tax & Electricity' : 'Excluded';
  }
  if (/\belectric(?:ity)?\s*(?:inc|included)\b/i.test(t)) return 'Electric Included';
  if (/\b(?:all\s*)?bills\s*(?:inc|incl|included|inclusive)\b|\binc(?:l|luding|lusive)?\.?\s*(?:of\s*)?(?:all\s*)?bills\b|\bbills\s*all\s*included\b/i.test(t)) return 'All Included';
  return undefined;
}

function detectFurnished(t: string): string | undefined {
  if (/\bpart(?:ly|ially)?[- ]?furnished\b/i.test(t)) return 'Part furnished';
  if (/\bunfurnished\b/i.test(t)) return 'Unfurnished';
  if (/\bfurnished\b/i.test(t)) return 'Furnished';
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function detectAvailable(t: string, today: Date): string | undefined {
  if (/\bavailable\s*(?:now|immediately|asap|today)\b|\bready\s*now\b/i.test(t)) return iso(today);
  const w = t.match(/\b(?:available|avail\.?|from|move[- ]?in)\s*(?:from\s*)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{4})?/i);
  if (w) {
    const month = MONTHS.indexOf(w[2].toLowerCase());
    let year = w[3] ? Number(w[3]) : today.getFullYear();
    if (!w[3] && month < today.getMonth() - 1) year += 1; // "1st Feb" said in November means next year
    return iso(new Date(year, month, Number(w[1])));
  }
  const d = t.match(/\b(?:available|avail\.?|from)\s*(?:from\s*)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/i);
  if (d) return iso(new Date(Number(d[3].length === 2 ? `20${d[3]}` : d[3]), Number(d[2]) - 1, Number(d[1]))); // UK: day/month/year
  return undefined;
}

const detect = (t: string, today: Date): Detected => ({
  type: detectType(t), rent: detectRent(t), bills: detectBills(t),
  furnished: detectFurnished(t), available: detectAvailable(t, today),
});

const hasDetail = (d: Detected) => Boolean(d.type || d.rent || d.bills || d.furnished || d.available);

// ── Address ────────────────────────────────────────────────────────

const STREET_RE = /\b(road|rd|street|st|avenue|ave|lane|ln|close|court|ct|gardens|gdns|way|drive|dr|grove|place|pl|crescent|cres|hill|park|terrace|walk|rise|green|mews|square|sq|parade|house|row|gate|vale|view|wharf|yard|broadway|highway|approach|chase|market|embankment|estate|mansions|lodge|towers?)\b/i;
const UNIT_PREFIX_RE = /^(flat|unit|room|apartment|apt|studio)\s+(?:\d+[a-z]?|[a-z]\d*)\b/i;
const HOUSE_NUMBER_RE = /^\d+[a-z]?\b/i;

/** Pieces of a line, split on commas, spaced dashes, pipes, bullets and tabs. */
const pieces = (line: string) =>
  line.split(/\s*(?:,|\s[-–—]\s|\||•|\t)\s*/).map((p) => p.trim()).filter(Boolean);

const cleanLead = (s: string) => s.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s+/, '').trim();

function isListingLine(line: string, d: Detected): boolean {
  if (POSTCODE_RE.test(line)) return true;
  const first = pieces(line)[0] ?? '';
  if (UNIT_PREFIX_RE.test(first)) return true;
  if (HOUSE_NUMBER_RE.test(first) && STREET_RE.test(first)) return true;
  if (GLOBAL_RE.test(line)) return false; // "They are all studios in N17" is a shared note
  if (districtOf(line) && (d.type || d.rent)) return true; // masked listing: "1 bed flat - Edmonton N9 - £1,350"
  return areasIn(line).length > 0 && Boolean(d.type && d.rent); // "Studio in Tottenham, £950"
}

const LET_RE = /(?:^|[\s(\-–])(?:now\s+let|been\s+let|already\s+let|let\s+agreed|taken|gone|under\s+offer|no\s+longer\s+available|unavailable)\b|\(\s*let\s*\)|[-–]\s*let\s*$|^\s*let\s*[-–:]/i;
const STRUCK_RE = /^\s*~~.*~~\s*$/;

/** "Units 1 & 2, 5 High St" → ["Unit 1, 5 High St", "Unit 2, 5 High St"]. */
function expandUnits(line: string): string[] {
  const list = line.match(/\b(units?|flats?|rooms?|apartments?)\s+(\d+[a-z]?(?:\s*,\s*\d+[a-z]?)*\s*(?:&|and|\+)\s*\d+[a-z]?)\b/i);
  const range = line.match(/\b(units?|flats?|rooms?|apartments?)\s+(\d+)\s*(?:-|–|to)\s*(\d+)\b/i);
  let found: RegExpMatchArray | null = null;
  let units: string[] = [];
  if (list) {
    found = list;
    units = list[2].split(/\s*(?:,|&|and|\+)\s*/);
  } else if (range && Number(range[3]) > Number(range[2]) && Number(range[3]) - Number(range[2]) < 20) {
    found = range;
    for (let i = Number(range[2]); i <= Number(range[3]); i++) units.push(String(i));
  }
  if (!found || units.length < 2) return [line];
  const hit = found;
  const singular = titleCase(hit[1].toLowerCase().replace(/s$/, ''));
  return units.map((u) => line
    .replace(hit[0], `${singular} ${u}`)
    .replace(/^\s*\d+\s*(?:x\s*)?(?:studios|flats|rooms|units|apartments)\s+(?=(?:Unit|Flat|Room|Apartment)\b)/i, ''));
}

function parseAddress(line: string, today: Date) {
  const full = line.match(POSTCODE_RE);
  const district = districtOf(line);

  // Address = leading pieces up to the postcode, or up to the first piece that
  // is only detail (a type, a rent, bills...).
  const addr: string[] = [];
  for (const p of pieces(line)) {
    const pc = p.match(POSTCODE_RE);
    if (pc) { addr.push(p.slice(0, (pc.index ?? 0) + pc[0].length).trim()); break; }
    const detailOnly = hasDetail(detect(p, today)) && !STREET_RE.test(p) && !UNIT_PREFIX_RE.test(p)
      && !HOUSE_NUMBER_RE.test(p) && areasIn(p).length === 0;
    if (detailOnly) { if (addr.length) break; continue; }
    addr.push(p);
  }
  let address_line = (addr.join(', ') || pieces(line)[0] || line).replace(/\s+/g, ' ').trim();
  if (!STREET_RE.test(address_line)) {
    // masked listing with no street: keep the place, drop rent / type words
    address_line = address_line
      .replace(/£\s?[\d,.]+\s*(?:pcm|pw|p\/?m|per\s+(?:month|week))?/gi, '')
      .replace(/\b(?:\d|one|two|three)\s*[- ]?bed(?:room)?\s*(?:flat|house|maisonette)?\b|\b(?:en[- ]?suite\s+)?(?:studio|room)\b\s*(?:in|at)?/gi, '')
      .replace(/\s{2,}/g, ' ').replace(/^[\s,-]+|[\s,-]+$/g, '').trim() || address_line;
  }

  // Locality: the last piece that is not a street, unit or house number.
  const placePieces = addr
    .map((p) => p.replace(POSTCODE_RE, '').replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*$/i, '').trim())
    .filter((p) => p && !STREET_RE.test(p) && !UNIT_PREFIX_RE.test(p) && !HOUSE_NUMBER_RE.test(p));
  const placeText = placePieces.join(', ');
  const districtBorough = boroughFromDistrict(district);
  const borough = canonicalBorough(placeText) ?? districtBorough
    ?? (areasIn(placeText)[0] ? boroughOfArea(areasIn(placeText)[0]) : null);

  // Prefer a known neighbourhood name inside the piece ("Studio in Tottenham" → "Tottenham")
  const lastPlace = placePieces[placePieces.length - 1];
  const knownInLast = lastPlace ? areasIn(lastPlace)[0] : undefined;
  let area: string | null = knownInLast ? titleCase(knownInLast) : lastPlace ? titleCase(lastPlace.toLowerCase()) : null;
  if (!area) {
    // e.g. "14 Bruce Grove, N17": a known place in the street name counts only
    // if it sits in the same borough as the postcode ("Harrow Road, W9" does not).
    const named = areasIn(address_line).find((a) => boroughOfArea(a) === borough);
    area = named ? titleCase(named) : null;
  }
  return { address_line, postcode: full ? `${full[1]} ${full[2]}`.toUpperCase() : district, area, borough };
}

// ── Spreadsheet rows (tab separated) ───────────────────────────────

const HEADER_KEYS: Array<[RegExp, string]> = [
  [/post\s*code/i, 'postcode'], [/type/i, 'type'], [/^\s*(?:no\.?\s*of\s*)?beds?\s*$|bedrooms?/i, 'beds'],
  [/rent|price|pcm|lha/i, 'rent'], [/bills/i, 'bills'], [/borough|council/i, 'borough'],
  [/furnish/i, 'furnished'], [/avail|from|date/i, 'available'], [/note|comment|detail/i, 'notes'],
  [/area|locality|town/i, 'area'], [/address|property|location|street/i, 'address'],
];

function tableToLines(lines: string[]): string[] {
  const tabbed = lines.filter((l) => l.includes('\t'));
  const headerCells = tabbed[0].split('\t').map((c) => c.trim());
  const isHeader = !POSTCODE_RE.test(tabbed[0])
    && headerCells.filter((c) => HEADER_KEYS.some(([re]) => re.test(c))).length >= 2;
  const cols = isHeader ? headerCells.map((c) => HEADER_KEYS.find(([re]) => re.test(c))?.[1] ?? 'notes') : null;

  return lines.flatMap((l) => {
    if (!l.includes('\t')) return [l];
    if (isHeader && l === tabbed[0]) return [];
    const cells = l.split('\t').map((c) => c.trim());
    if (!cols) return [cells.filter(Boolean).join(', ')];
    const get = (k: string) => cells.filter((_, i) => cols[i] === k).filter(Boolean).join(' ');
    const beds = get('beds');
    const rent = get('rent');
    return [[
      [get('address'), get('area'), get('borough'), get('postcode')].filter(Boolean).join(', '),
      [/^\d+$/.test(beds) ? `${beds} bed` : beds, get('type')].filter(Boolean).join(' '),
      rent && !/£|lha/i.test(rent) ? `£${rent} pcm` : rent,
      get('bills') ? `bills ${get('bills')}` : '',
      get('furnished'),
      get('available') ? `available ${get('available')}` : '',
      get('notes'),
    ].filter(Boolean).join(' - ')];
  });
}

// ── Main ───────────────────────────────────────────────────────────

const GLOBAL_RE = /\b(all|every|each|they\s+are|these\s+are|both|whole\s+block|throughout)\b/i;

export function parsePropertyList(input: string, today = new Date()): ParseResult {
  let lines = input.replace(/\r/g, '').split('\n');
  if (lines.filter((l) => l.includes('\t')).length >= 2) lines = tableToLines(lines);

  const blocks: string[][] = [];
  const shared: string[] = [];
  const skipped: string[] = [];
  let group: string[][] = []; // blocks created by the latest listing line (several for "Units 1 & 2")
  let afterBlank = true;

  for (const raw of lines) {
    const line = cleanLead(raw);
    if (!line) { afterBlank = true; continue; }
    if (STRUCK_RE.test(line) || LET_RE.test(line)) {
      skipped.push(line.replace(/^~~|~~$/g, ''));
      group = [];
      afterBlank = true;
      continue;
    }
    if (isListingLine(line, detect(line, today))) {
      group = expandUnits(line).map((l) => [l]);
      blocks.push(...group);
      afterBlank = false;
    } else if (group.length && !afterBlank && !GLOBAL_RE.test(line)) {
      group.forEach((b) => b.push(line)); // detail line for the property (or every unit) above
    } else {
      shared.push(line);
    }
  }

  // Defaults from shared notes: the first value found for each field
  const defaults: Detected = {};
  for (const note of shared) {
    const d = detect(note, today);
    defaults.type ??= d.type; defaults.rent ??= d.rent; defaults.bills ??= d.bills;
    defaults.furnished ??= d.furnished; defaults.available ??= d.available;
  }

  const properties: ParsedProperty[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const text = b.join(' - ');
    const addr = parseAddress(b[0], today);
    const key = addr.address_line.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);

    const own = detect(text, today);
    const type = own.type ?? defaults.type;
    const rent = own.rent ?? defaults.rent;
    const warnings: string[] = [];
    if (!addr.postcode) warnings.push('No postcode');
    if (!addr.borough) warnings.push('Borough unknown');
    if (!rent) warnings.push('Rent not found');
    else if (rent.assumedWeekly) warnings.push('Rent read as per week');

    properties.push({
      ...addr,
      property_type: type?.label ?? null,
      bedrooms: type ? type.bedrooms : null,
      rent_pcm: rent?.pcm ?? null,
      rent_text: rent?.text ?? null,
      bills: own.bills ?? defaults.bills ?? null,
      furnished: own.furnished ?? defaults.furnished ?? null,
      available_from: own.available ?? defaults.available ?? null,
      notes: [text, shared.length ? `Shared notes: ${shared.join('; ')}` : ''].filter(Boolean).join('\n'),
      warnings,
    });
  }

  return { properties, sharedNotes: shared, skipped };
}

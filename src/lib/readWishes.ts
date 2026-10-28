// What else a client's own words say about the home they need (brief C2), for the client form and for enquiries
// coming in (parseEnquiry.ts, the Bin): when they must move by, how much they can top up the rent, who or what they
// need to live near and how far they will travel, whether it must be women only, and a garden or balcony.
// Each answer comes with the words it was read from. Nothing here writes: the Bin and the form decide.

import { districtOf } from './london';

export interface Wishes {
  move_by?: string;          // YYYY-MM-DD
  max_top_up?: number;       // pounds a month on top of their LHA
  anchor?: string;           // "my mum (I care for her)", "Northwick Park Hospital"
  anchor_postcode?: string;
  max_travel_mins?: number;
  female_only?: boolean;
  wants_outdoor?: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const negated = (text: string, at: number) => /\b(?:no|not|never|without|don['’]?t\s+(?:need|want|mind))\b[^.,;]{0,15}$/i.test(text.slice(Math.max(0, at - 25), at));

/** The next date on or after `today` for a day and month with no year. */
function nextDate(day: number, month: number, today: string): string | undefined {
  const [ty] = today.split('-').map(Number);
  for (const y of [ty, ty + 1]) {
    const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
    if (day < 1 || day > last) return undefined;
    const d = iso(y, month, day);
    if (d >= today) return d;
  }
  return undefined;
}

/** "move by 15 November", "need to move by 1/12", "before the end of November", "by 3rd Jan 2027". */
export function readMoveBy(text: string, today: string): { date: string; at: number; length: number } | null {
  const lead = String.raw`\b(?:move(?:\s+out)?|moving|out|leave|leaving|vacate|need\s+(?:somewhere|a\s+place|to\s+move))\b[^.\n]{0,30}?\b(?:by|before|on|from)\s+(?:the\s+)?`;
  const named = new RegExp(`${lead}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})[a-z]*\\.?(?:\\s+(\\d{4}))?`, 'i').exec(text);
  if (named) {
    const day = Number(named[1]); const month = MONTHS.indexOf(named[2].toLowerCase().slice(0, 3)) + 1;
    const date = named[3] ? iso(Number(named[3]), month, day) : nextDate(day, month, today);
    if (date) return { date, at: named.index, length: named[0].length };
  }
  const slashed = new RegExp(`${lead}(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?\\b`, 'i').exec(text);
  if (slashed) {
    const day = Number(slashed[1]); const month = Number(slashed[2]);
    const year = slashed[3] ? Number(slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3]) : null;
    const date = month >= 1 && month <= 12 ? (year ? iso(year, month, day) : nextDate(day, month, today)) : undefined;
    if (date) return { date, at: slashed.index, length: slashed[0].length };
  }
  const endOf = new RegExp(`${lead}end\\s+of\\s+(${MONTHS.join('|')})[a-z]*`, 'i').exec(text);
  if (endOf) {
    const month = MONTHS.indexOf(endOf[1].toLowerCase().slice(0, 3)) + 1;
    const [ty] = today.split('-').map(Number);
    for (const y of [ty, ty + 1]) {
      const d = iso(y, month, new Date(Date.UTC(y, month, 0)).getUTCDate());
      if (d >= today) return { date: d, at: endOf.index, length: endOf[0].length };
    }
  }
  return null;
}

const ANCHOR_THING = /\b(mum|mother|dad|father|parents?|family|sister|brother|nan|gran(?:dma|dad)?|grandparents?|aunt|uncle|carer|care\s+for|caring\s+for|school|schools|college|uni(?:versity)?|hospital|clinic|gp|surgery|dialysis|work|job|workplace|office|mosque|church|temple|nursery|children|kids)\b/i;

/** Everything readable from their words. `today` dates a "move by" with no year. */
export function readWishes(text: string, today: string): Wishes {
  const out: Wishes = {};
  if (!text.trim()) return out;

  const move = readMoveBy(text, today);
  if (move) out.move_by = move.date;

  // "can top up £100", "a £50 top up", "can pay £100 extra", "£150 on top", "up to £200 more"
  const top = /\btop[- ]?ups?\s+(?:of\s+|up\s+to\s+)?£\s?(\d{2,4})|£\s?(\d{2,4})\s*(?:a\s+month\s+|pcm\s+|pm\s+)?(?:top[- ]?up|extra|on\s+top|more)\b|\b(?:can|could|able\s+to)\s+(?:pay|add|afford|top\s+up)\s+(?:an?\s+)?(?:extra\s+)?(?:up\s+to\s+)?£\s?(\d{2,4})\s*(?:a\s+month\s+|pcm\s+)?(?:extra|more|on\s+top|top[- ]?up)?/i.exec(text);
  if (top && !negated(text, top.index)) {
    const v = Number(top[1] ?? top[2] ?? top[3]);
    if (v > 0 && v <= 1000) out.max_top_up = v;
  }
  if (/\b(?:can'?t|cannot|can\s+not|unable\s+to)\s+top[- ]?up\b|\bno\s+top[- ]?up\b/i.test(text)) out.max_top_up = 0;

  // "near my mum, I care for her", "close to Northwick Park Hospital", "near the children's school (HA2 0AB)"
  for (const m of text.matchAll(/\b(?:near|close\s+to|nearby|walking\s+distance\s+(?:of|to|from)|within\s+\d+\s*(?:mins?|minutes)\s+(?:of|from))\s+(?:to\s+)?(?:my\s+|our\s+|the\s+|their\s+|her\s+|his\s+)?([^.,;\n]{3,60})/gi)) {
    const what = m[1].trim();
    if (!ANCHOR_THING.test(what) || negated(text, m.index ?? 0)) continue;
    const words = what.replace(/\s+(?:as|because|so|and\s+i|and\s+we)\b.*$/i, '').trim();
    out.anchor = words.charAt(0).toUpperCase() + words.slice(1);
    const pc = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.exec(what) ?? /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.exec(text.slice(m.index ?? 0, (m.index ?? 0) + 120));
    if (pc && districtOf(pc[1])) out.anchor_postcode = pc[1].toUpperCase().replace(/\s*(\d[A-Z]{2})$/, ' $1');
    break;
  }

  // "within 30 minutes", "no more than 45 mins away", "a 20 min journey"
  const mins = /\b(?:within|no\s+more\s+than|max(?:imum)?(?:\s+of)?|under|up\s+to|less\s+than)\s+(\d{1,3})\s*(?:mins?|minutes)\b|\b(\d{1,3})\s*(?:mins?|minutes)\s+(?:max|maximum|journey|travel|away|commute)\b/i.exec(text);
  if (mins) {
    const v = Number(mins[1] ?? mins[2]);
    if (v >= 5 && v <= 180) out.max_travel_mins = v;
  }
  const hour = /\b(?:within|no\s+more\s+than|under|up\s+to)\s+(?:an?|one)\s+hour\b/i.exec(text);
  if (!out.max_travel_mins && hour) out.max_travel_mins = 60;

  const female = /\b(?:female|women|woman|ladies|girls)[- ]?only\b|\ball[- ](?:female|women)\b|\bonly\s+(?:with\s+)?(?:females|women|ladies)\b/i.exec(text);
  if (female && !negated(text, female.index)) out.female_only = true;

  const outdoor = /\b(?:garden|balcony|outdoor\s+space|outside\s+space|terrace|patio)\b/i.exec(text);
  if (outdoor && !negated(text, outdoor.index) && !/\bcommunal\s+garden\b/i.test(text.slice(outdoor.index - 12, outdoor.index + 8))) out.wants_outdoor = true;

  return out;
}

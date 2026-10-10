// Reads what a client wrote in their own words (notes and requirements) and
// suggests answers for the form: budget, household, benefits, work, council,
// registration, urgency and situation. Each suggestion carries an accuracy
// rating (how sure the reading is) and the exact words it came from, so a
// person decides. Nothing is changed until someone applies a suggestion.

import type { Applicant } from './types';
import { areasIn, boroughOfArea, canonicalBorough } from './london';
import { HOUSEHOLD_LABEL, URGENCY_LABEL, URGENCY_RANK, WORK_STATUS_LABEL } from './tiering';
import { clientNeeds } from './propertyMatch';

export interface Evidence { before: string; match: string; after: string }

export interface Suggestion {
  id: string;
  /** The form field, in words: "Budget". */
  field: string;
  /** What applying it changes. */
  patch: Partial<Applicant>;
  /** The value, in words: "£1,430 pcm". */
  value: string;
  /** 0 to 1: how sure the reading is. */
  confidence: number;
  evidence: Evidence;
  /** What the field says now, when the suggestion would change it. */
  current?: string;
  note?: string;
}

/** Something worth knowing that is not a form answer. */
export interface Flag {
  id: string;
  text: string;
  confidence: number;
  evidence?: Evidence;
  /** A fix that can be applied, with its button words. */
  fix?: { patch: Partial<Applicant>; label: string };
}

export interface NotesReading {
  suggestions: Suggestion[];
  flags: Flag[];
  /** What property matching already understands from the notes. */
  understood: string[];
}

export const confidenceWord = (c: number) => (c >= 0.8 ? 'High' : c >= 0.55 ? 'Medium' : 'Low');

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const num = (s: string) => WORD_NUM[s.toLowerCase()] ?? Number(s);
const clamp = (x: number) => Math.max(0.2, Math.min(0.95, x));
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

function evidence(text: string, index: number, length: number): Evidence {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + length + 45);
  const before = text.slice(start, index).replace(/^\S*\s/, start > 0 ? '' : '$&');
  const after = text.slice(index + length, end).replace(/\s\S*$/, end < text.length ? '' : '$&');
  return { before: (start > 0 ? '…' : '') + before, match: text.slice(index, index + length), after: after + (end < text.length ? '…' : '') };
}

/** The sentence around a position, for judging context. */
function sentenceAt(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('\n', index - 1), text.lastIndexOf('!', index - 1), text.lastIndexOf('?', index - 1));
  const ends = ['.', '\n', '!', '?'].map((c) => text.indexOf(c, index)).filter((i) => i !== -1);
  return text.slice(start + 1, ends.length ? Math.min(...ends) : text.length).toLowerCase();
}

/** "not", "no", "never"... shortly before a phrase. */
const negated = (text: string, index: number) => /\b(not|no|never|isn'?t|aren'?t|don'?t|doesn'?t|without|nor)\b[^.,;]{0,18}$/i.test(text.slice(Math.max(0, index - 30), index));

function* matches(text: string, re: RegExp) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) { yield m; if (m[0] === '') g.lastIndex += 1; }
}

type Candidate = Omit<Suggestion, 'id' | 'current'> & { key: string };

// ── Readers ────────────────────────────────────────────────────────

function readBudget(text: string, out: Candidate[]) {
  const MONEY = /£\s?(\d{1,3}(?:,\d{3})+|\d{2,5})(?:\.\d{1,2})?(?:\s*(pcm|p\.c\.m|per\s+(?:calendar\s+)?month|a\s+month|monthly|pm|pw|p\/w|per\s+week|a\s+week|weekly))?/gi;
  const BARE = /\b(?:budget|afford|pay)\b[^.£\d\n]{0,25}?(\d{3,4})\b(?:\s*(pcm|pw|a month|a week|per month|per week))?/gi;
  const seen = new Set<number>();
  for (const re of [MONEY, BARE]) {
    for (const m of matches(text, re)) {
      const amount = Number(m[1].replace(/,/g, ''));
      const period = (m[2] ?? '').toLowerCase();
      const weekly = /w/.test(period);
      const pcm = weekly ? Math.round((amount * 52) / 12) : amount;
      if (pcm < 250 || pcm > 6000 || seen.has(pcm)) continue;
      seen.add(pcm);
      const ctx = sentenceAt(text, m.index);
      let c = 0.55;
      if (/\b(budget|afford|can pay|pay up to|up to|max(imum)?|looking to pay|spend)\b/.test(ctx)) c += 0.3;
      if (/\b(rent|lha|housing (element|benefit)|rate)\b/.test(ctx)) c += 0.1;
      if (period) c += 0.05;
      if (/\b(deposit|arrears|debt|owe|fee|salary|earn|income|wage|council tax|bills?)\b/.test(ctx)) c -= 0.3;
      const combined = /\b(friend|partner|together|combined|total|between us|both)\b/.test(ctx);
      if (combined) c -= 0.1;
      out.push({
        key: 'budget', field: 'Budget', patch: { budget_pcm: pcm }, value: `${money(pcm)} pcm`, confidence: clamp(c),
        evidence: evidence(text, m.index, m[0].length),
        note: [weekly ? `${money(amount)} a week, worked out monthly` : '', combined ? 'Seems to be a combined amount with someone else' : ''].filter(Boolean).join('. ') || undefined,
      });
    }
  }
}

function readLha(text: string, out: Candidate[]) {
  const sized = /\b(\d|one|two|three|four|shared|room)\s*[- ]?bed(?:room)?\s*(?:rate\s*)?lha\b/i.exec(text);
  if (sized) {
    const s = sized[1].toLowerCase();
    const band = s === 'shared' || s === 'room' ? 'Shared room' : `${num(s)}-Bed`;
    out.push({ key: 'lha', field: 'LHA band', patch: { lha_band: band }, value: band, confidence: 0.85, evidence: evidence(text, sized.index, sized[0].length) });
    return;
  }
  const any = /\blha\b/i.exec(text);
  if (any) out.push({ key: 'lha', field: 'LHA band', patch: { lha_band: 'LHA rate' }, value: 'LHA rate', confidence: 0.6, evidence: evidence(text, any.index, any[0].length), note: 'Says LHA but not which band' });
}

// ── Household ──────────────────────────────────────────────────────
// Read as a whole: anyone else moving in decides it. A child (by count, by
// "my 13-year-old daughter", "my son and daughter", "single mum", a pregnancy)
// makes a family; a partner a couple; a friend or relative to share with,
// other. "For myself" only means single when nobody else is mentioned.

const CHILD = 'son|daughter|baby|child|boy|girl|toddler|newborn|little one|kid';
const CHILDREN = 'sons|daughters|babies|children|kids|boys|girls|twins|little ones';
const NOT_A_CHILD = '(?!\\s*(?:benefit|tax|maintenance|support|care|minder)\\b)(?!\'s father|\'s mother|\'s dad|\'s mum)';
const ageOf = (s: string): number | null => {
  const m = /(\d{1,2})\s*-?\s*(?:years?|yrs?|y\/o|yo)\b|\b(?:aged?|is)\s+(\d{1,2})\b/i.exec(s);
  if (m) return Number(m[1] ?? m[2]);
  return /\b\d{1,2}\s*-?\s*(?:months?|weeks?)\b/i.test(s) ? 0 : null;
};

export interface HouseholdReading {
  type: 'single' | 'couple' | 'family' | 'other';
  confidence: number;
  /** children moving in, when it can be told */
  children?: number;
  /** adults moving in, the client included, when it can be told */
  adults?: number;
  /** where in the text it was read from */
  at: number;
  length: number;
  note?: string;
}

/** Who is moving in, read from what the client wrote; null if it does not say. */
export function readHouseholdText(text: string): HouseholdReading | null {
  type Hit = { at: number; length: number };
  const kids: Array<Hit & { n: number | null }> = []; // n: how many, null if not said
  const grownUps: Hit[] = [];                         // adult children or relatives moving in
  // already read as part of an earlier hit (the two ranges overlap)
  const seen = (at: number, length: number) => [...kids, ...grownUps].some((h) => at < h.at + h.length && h.at < at + length);

  // "3 kids", "two young children"
  for (const m of text.matchAll(new RegExp(`\\b(\\d|one|two|three|four|five|six|seven)\\s+(?:young\\s+|little\\s+|small\\s+)?(${CHILDREN}|${CHILD})\\b${NOT_A_CHILD}`, 'gi'))) {
    if (negated(text, m.index)) continue;
    kids.push({ at: m.index, length: m[0].length, n: num(m[1]) });
  }
  // "my 13-year-old daughter", "my son and daughter", "and a baby", "with my kids"
  for (const m of text.matchAll(new RegExp(`\\b(my|our|and|with|plus)\\s+((?:[\\w'-]+\\s+){0,3}?)(${CHILD}|${CHILDREN})\\b${NOT_A_CHILD}`, 'gi'))) {
    if (seen(m.index, m[0].length) || negated(text, m.index)) continue;
    // "with kids" alone can be general ("good with kids"); "with my kids", "with a baby" cannot
    if (/^(with|plus)$/i.test(m[1]) && !/\b(my|our|a|an|the|\d+|one|two|three|four)\b/i.test(m[2])) continue;
    const plural = new RegExp(`^(${CHILDREN})$`, 'i').test(m[3]);
    const age = ageOf(m[2]) ?? ageOf(text.slice(m.index + m[0].length, m.index + m[0].length + 16));
    if (age !== null && age >= 18) { grownUps.push({ at: m.index, length: m[0].length }); continue; }
    kids.push({ at: m.index, length: m[0].length, n: m[3].toLowerCase() === 'twins' ? 2 : plural ? null : 1 });
  }
  // "a 5 year old", "my 8 month old"
  for (const m of text.matchAll(/\b(?:a|an|my|our)\s+(\d{1,2})\s*-?\s*(year|yr|month|week)s?\s*-?\s*old\b(?!\s+(?:property|flat|house|home|building|block))/gi)) {
    if (seen(m.index, m[0].length) || negated(text, m.index)) continue;
    if (/^(year|yr)$/i.test(m[2]) && Number(m[1]) >= 18) continue;
    kids.push({ at: m.index, length: m[0].length, n: 1 });
  }
  const singleParent = /\bsingle (mum|mother|dad|father|parent)\b/i.exec(text);
  const familyOf = /\bfamily of (\d|two|three|four|five|six|seven)\b/i.exec(text);
  const expecting = /\b(pregnant|expecting a baby|expecting my first|baby on the way|due in)\b/i.exec(text);
  const partner = /\b(me and my|with my|my|and my)\s+(partner|wife|husband|girlfriend|boyfriend|fianc[eé]e?|other half)\b|\bwe are a couple\b/i.exec(text);
  const sharer = /\b(me and my|with my|my|and my)\s+(friend|flatmate|housemate|sister|brother|mum|mother|dad|father|cousin|nan|gran|grandmother|grandfather|aunt|uncle)\b/i.exec(text);
  const sharing = !!sharer && !negated(text, sharer.index) && /\b(we|us|together|share|sharing|total|combined|both|live with|living with|for (me|myself) and)\b/i.test(text);
  const withPartner = !!partner && !negated(text, partner.index);

  if (kids.length || singleParent || familyOf || expecting) {
    const counted = kids.every((k) => k.n !== null) && kids.length > 0 ? kids.reduce((s, k) => s + (k.n ?? 0), 0) : undefined;
    const hits: Hit[] = [...kids, ...[singleParent, familyOf, expecting].flatMap((m) => (m ? [{ at: m.index, length: m[0].length }] : []))];
    const first = hits.sort((a, b) => a.at - b.at)[0];
    const adults = withPartner ? 2 : singleParent ? 1 : undefined;
    const familySize = familyOf ? num(familyOf[1]) : null;
    return {
      type: 'family', at: first.at, length: first.length,
      confidence: kids.length ? 0.9 : singleParent || familyOf ? 0.8 : 0.6,
      children: counted ?? (familySize && adults ? Math.max(0, familySize - adults) : undefined),
      adults: adults ?? (kids.length && !withPartner && !sharing ? 1 : undefined),
      note: !kids.length && expecting ? 'Expecting a baby' : undefined,
    };
  }
  if (withPartner) return { type: 'couple', confidence: 0.85, adults: 2, at: partner!.index, length: partner![0].length };
  if (sharing || grownUps.length) {
    const hit = sharer && sharing ? { at: sharer.index, length: sharer[0].length } : grownUps[0];
    return { type: 'other', confidence: 0.6, adults: 2, at: hit.at, length: hit.length,
      note: grownUps.length && !sharing ? 'An adult son or daughter moving in too' : 'Looking to live with someone who is not a partner' };
  }
  const single = /\b(i'?m|i am)\s+(single|on my own|alone)\b|\bjust (me|myself)\b|\bonly me\b|\bfor myself\b(?!\s+and\b)|\bi live alone\b|\bsingle (person|man|woman|male|female)\b/i.exec(text);
  if (single && !negated(text, single.index)) return { type: 'single', confidence: 0.8, adults: 1, at: single.index, length: single[0].length };
  // "Single, sofa surfing..." at the start of a sentence (not "single bed", "single mum"...)
  const bare = /(?:^|[.\n]\s*)(single)\b(?![- ](?:bed|room|parent|mum|mother|dad|father|glazing))/i.exec(text);
  if (bare) return { type: 'single', confidence: 0.65, at: bare.index + bare[0].length - bare[1].length, length: bare[1].length };
  return null;
}

function readHousehold(text: string, out: Candidate[]) {
  const h = readHouseholdText(text);
  if (!h) return;
  const ev = evidence(text, h.at, h.length);
  const value = h.type === 'other' && /not a partner/.test(h.note ?? '') ? `${HOUSEHOLD_LABEL.other} (sharing)` : HOUSEHOLD_LABEL[h.type];
  out.push({ key: 'household', field: 'Household', patch: { household_type: h.type }, value, confidence: h.confidence, evidence: ev, note: h.note });
  if (h.children !== undefined && h.children > 0) {
    out.push({ key: 'children', field: 'Children', patch: { children: h.children }, value: String(h.children), confidence: Math.min(0.85, h.confidence), evidence: ev });
  }
  if (h.adults !== undefined && h.adults > 1) {
    out.push({ key: 'adults', field: 'Adults', patch: { adults: h.adults }, value: String(h.adults), confidence: 0.75, evidence: ev });
  }
}

function readBenefits(text: string, a: Applicant, out: Candidate[]) {
  const yesNo = (key: string, field: string, re: RegExp, patchKey: 'on_uc' | 'pip' | 'lcwra', conf: number) => {
    const m = re.exec(text);
    if (!m) return;
    const no = negated(text, m.index);
    out.push({ key, field, patch: { [patchKey]: !no } as Partial<Applicant>, value: no ? 'No' : 'Yes', confidence: no ? conf - 0.15 : conf, evidence: evidence(text, m.index, m[0].length) });
  };
  yesNo('uc', 'On UC', /\buniversal credit\b|\b(?:on|claim(?:ing)?|receive|receiving|get|getting)\s+uc\b|\buc\b/i, 'on_uc', 0.9);
  yesNo('pip', 'PIP', /\bpip\b|\bpersonal independence payment\b/i, 'pip', 0.9);
  yesNo('lcwra', 'LCWRA', /\blcwra\b|\blimited capability for work(?: and work[- ]related activity)?\b/i, 'lcwra', 0.9);
  if (!out.some((c) => c.key === 'uc')) {
    const vague = /\b(on benefits|dss|claiming benefits)\b/i.exec(text);
    if (vague) out.push({ key: 'uc', field: 'On UC', patch: { on_uc: true }, value: 'Yes', confidence: 0.45, evidence: evidence(text, vague.index, vague[0].length), note: 'Says benefits, not which' });
  }
  const others: Array<[string, RegExp]> = [
    ['HB', /\bhousing benefit\b|\bhb\b/i], ['ESA', /\besa\b|\bemployment and support allowance\b/i], ['JSA', /\bjsa\b|\bjobseeker'?s allowance\b/i],
    ['DLA', /\bdla\b|\bdisability living allowance\b/i], ["Carer's allowance", /\bcarer'?s allowance\b/i], ['Child benefit', /\bchild benefit\b/i],
    ['Pension credit', /\bpension credit\b/i],
  ];
  const found = others.map(([label, re]) => ({ label, m: re.exec(text) })).filter((x) => x.m && !negated(text, x.m.index));
  const existing = (a.benefit_type ?? '').split(/[,;/]+/).map((x) => x.trim()).filter(Boolean);
  const add = found.filter((x) => !existing.some((e) => e.toLowerCase() === x.label.toLowerCase()));
  if (add.length) {
    const first = add[0].m!;
    out.push({ key: 'benefit_type', field: 'Other benefits', patch: { benefit_type: [...existing, ...add.map((x) => x.label)].join(', ') },
      value: add.map((x) => x.label).join(', '), confidence: 0.8, evidence: evidence(text, first.index, first[0].length) });
  }
}

function readWork(text: string, out: Candidate[]) {
  const push = (value: string, re: RegExp, conf: number, note?: string) => {
    const m = re.exec(text);
    if (!m || negated(text, m.index)) return false;
    out.push({ key: 'work', field: 'Work', patch: { work_status: value }, value: WORK_STATUS_LABEL[value], confidence: conf, evidence: evidence(text, m.index, m[0].length), note });
    return true;
  };
  if (push('not_working', /\b(unemployed|not (?:currently )?working|out of work|can'?t work|cannot work|unable to work|not able to work|off sick|signed off)\b/i, 0.85)) return;
  if (push('part_time', /\bpart[- ]?time\b/i, 0.85)) return;
  if (push('full_time', /\bfull[- ]?time\b/i, 0.85)) return;
  push('full_time', /\b(i work|i'?m working|i am working|employed|in work|my job|my employer|my salary|my wage)\b/i, 0.45, 'Says they work; full or part time is not clear');
}

function readRegistration(text: string, out: Candidate[]) {
  const no = /\bnot (?:yet )?(?:registered|on (?:the|any) (?:housing )?(?:register|list))\b/i.exec(text);
  if (no) { out.push({ key: 'registered', field: 'Council-registered', patch: { council_registered: false }, value: 'No', confidence: 0.8, evidence: evidence(text, no.index, no[0].length) }); return; }
  const yes = /\b(registered with (?:the )?(?:[a-z]+ )?council|on the (?:housing )?register|housing register|waiting list|bidding|homeless (?:application|duty|team|officer)|(?:my|a) housing officer|council (?:is|are) (?:helping|supporting)|(?:the )?council (?:have|has) (?:accepted|placed))\b/i.exec(text);
  if (yes) out.push({ key: 'registered', field: 'Council-registered', patch: { council_registered: true }, value: 'Yes', confidence: 0.75, evidence: evidence(text, yes.index, yes[0].length) });
}

function readCouncil(text: string, out: Candidate[]) {
  const tries: Array<[RegExp, number]> = [
    [/\b(?:registered with|under|with)\s+(?:the\s+)?(?:london borough of\s+|lb\s+)?([a-z][a-z &'-]{2,30}?)\s+(?:council|borough)\b/gi, 0.75],
    [/\b([a-z][a-z&'-]{2,20}(?:\s[a-z][a-z&'-]{2,20})?)\s+council\b/gi, 0.7],
    [/\b(?:borough of|i live in|living in|currently in|currently living in|staying in|based in)\s+([a-z][a-z &'-]{2,30})/gi, 0.5],
  ];
  for (const [re, conf] of tries) {
    for (const m of matches(text, re)) {
      const place = m[1].trim();
      const borough = canonicalBorough(place) ?? (areasIn(place)[0] ? boroughOfArea(areasIn(place)[0]) : null);
      if (!borough) continue;
      out.push({ key: 'council', field: 'Council', patch: { council: borough }, value: borough, confidence: conf, evidence: evidence(text, m.index, m[0].length) });
      return;
    }
  }
}

function readUrgency(text: string, out: Candidate[]) {
  const levels: Array<[string, RegExp, number]> = [
    ['homeless_tonight', /\b(homeless tonight|nowhere to (?:stay|sleep|go)(?: tonight)?|sleeping rough|rough sleeping|on the streets?|sleeping in (?:my|a) car)\b/i, 0.85],
    ['at_risk_56', /\b(evict(?:ed|ion)|section 21|s21|notice to (?:quit|leave)|possession order|bailiffs?|end of (?:my|the) tenancy|have to leave by|must leave by|come to the end of the time)\b/i, 0.75],
    ['temp_accommodation', /\b(temporary accommodation|emergency accommodation|hostel|b&b|bed and breakfast|refuge|supported (?:housing|accommodation))\b/i, 0.75],
    ['overcrowding', /\b(overcrowd(?:ed|ing)|damp|mould|mold|unsafe|disrepair|too small for us|sharing a (?:room|bed))\b/i, 0.6],
  ];
  const found = levels.map(([v, re, c]) => ({ v, c, m: re.exec(text) })).filter((x) => x.m && !negated(text, x.m.index));
  if (!found.length) return;
  const top = found.sort((x, y) => (URGENCY_RANK[y.v] ?? 0) - (URGENCY_RANK[x.v] ?? 0))[0];
  out.push({ key: 'urgency', field: 'Urgency', patch: { urgency: top.v }, value: URGENCY_LABEL[top.v], confidence: top.c, evidence: evidence(text, top.m!.index, top.m![0].length) });
}

function readSituation(text: string, out: Candidate[]) {
  const phrases: Array<[string, RegExp]> = [
    ['Sofa surfing', /\bsofa[- ]?surf(?:ing)?\b/i], ['Staying with friends', /\bstaying with (?:a )?friends?\b/i],
    ['Staying with family', /\b(?:staying|living) with (?:my )?(?:family|parents|mum|mother|dad|father|sister|brother)\b/i],
    ['Rough sleeping', /\b(?:sleeping rough|rough sleeping|on the streets?)\b/i], ['Hostel', /\bhostel\b/i],
    ['Temporary accommodation', /\b(?:temporary|emergency) accommodation\b/i], ['B&B', /\bb&b|bed and breakfast\b/i],
    ['Refuge', /\brefuge\b/i], ['Private rented, being evicted', /\b(?:section 21|evict(?:ed|ion)|notice to (?:quit|leave))\b/i],
    ['Homeless project', /\bhomeless project\b/i],
  ];
  const found = phrases.map(([label, re]) => ({ label, m: re.exec(text) })).filter((x) => x.m && !negated(text, x.m.index));
  if (!found.length) return;
  out.push({ key: 'situation', field: 'Situation', patch: { housing_situation: found.slice(0, 2).map((x) => x.label).join(', ') },
    value: found.slice(0, 2).map((x) => x.label).join(', '), confidence: 0.7, evidence: evidence(text, found[0].m!.index, found[0].m![0].length) });
}

function readFlags(text: string, a: Applicant, flags: Flag[]) {
  const pro = /\b(?:i am|i'?m|we are|we'?re)\s+(?:a |an |the )?(?:housing officer|support worker|case ?worker|key ?worker|outreach worker|social worker|letting agent|landlord|charity|organisation)\b|\bworking with a team\b|\bour team\b|\bon behalf of\b|\bmy clients?\b|\bour clients?\b|\bwe (?:support|help|work with|house)\b|\bteam that (?:are|is)\b|\bservice users?\b/i.exec(text);
  if (pro) flags.push({ id: 'professional', confidence: 0.7, evidence: evidence(text, pro.index, pro[0].length),
    text: 'This may be a professional (a housing team, support worker or agent) looking for homes for several people, not a tenant.' });
  const quick = /\b(asap|a\.s\.a\.p|urgent(?:ly)?|as soon as possible|quickly|immediately)\b/i.exec(text);
  if (quick) flags.push({ id: 'quick', confidence: 0.6, evidence: evidence(text, quick.index, quick[0].length), text: 'Wants to move quickly.' });
  const place = (a.council || a.referring_borough || '').trim();
  if (place && !canonicalBorough(place)) {
    flags.push({ id: 'council-text', confidence: 0.8,
      text: `The Council field says "${place}", which is not a council, so tiering and matching cannot use it.`,
      fix: { label: 'Move it to their notes', patch: { council: null, referring_borough: null, notes: [a.notes?.trim(), `Area: ${place}`].filter(Boolean).join('\n') } } });
  }
}

// ── Putting it together ────────────────────────────────────────────

const currentWords = (a: Applicant, key: string): string | null => {
  switch (key) {
    case 'budget': return a.budget_pcm ? `${money(a.budget_pcm)} pcm` : null;
    case 'lha': return a.lha_band || null;
    case 'household': return a.household_type ? HOUSEHOLD_LABEL[a.household_type] ?? a.household_type : null;
    case 'children': return a.children ? String(a.children) : null;
    case 'adults': return a.adults && a.adults > 1 ? String(a.adults) : null;
    case 'uc': return a.on_uc == null ? null : a.on_uc ? 'Yes' : 'No';
    case 'pip': return a.pip == null ? null : a.pip ? 'Yes' : 'No';
    case 'lcwra': return a.lcwra == null ? null : a.lcwra ? 'Yes' : 'No';
    case 'benefit_type': return a.benefit_type || null;
    case 'work': return a.work_status ? WORK_STATUS_LABEL[a.work_status] : null;
    case 'registered': return a.council_registered == null ? null : a.council_registered ? 'Yes' : 'No';
    case 'council': return canonicalBorough(a.council || a.referring_borough);
    case 'urgency': return a.urgency ? URGENCY_LABEL[a.urgency] : null;
    case 'situation': return a.housing_situation || null;
    default: return null;
  }
};

/** Suggestions for the form from what the client wrote, best first. */
export function readNotes(a: Applicant): NotesReading {
  const text = [a.notes, a.requirements].filter(Boolean).join('\n');
  const flags: Flag[] = [];
  readFlags(text, a, flags);
  const out: Candidate[] = [];
  if (text.trim()) {
    readBudget(text, out); readLha(text, out); readHousehold(text, out); readBenefits(text, a, out);
    readWork(text, out); readRegistration(text, out); readCouncil(text, out); readUrgency(text, out); readSituation(text, out);
  }

  // Best reading per field (two for budget, as people often give two figures)
  const byKey = new Map<string, Candidate[]>();
  for (const c of out) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);
  const suggestions: Suggestion[] = [];
  for (const [key, list] of byKey) {
    const ranked = list.sort((x, y) => y.confidence - x.confidence).slice(0, key === 'budget' ? 2 : 1);
    for (const c of ranked) {
      const now = currentWords(a, key);
      if (now !== null && now.toLowerCase() === c.value.toLowerCase().replace(/ \(sharing\)$/, '')) continue; // already filled in
      suggestions.push({
        id: `${key}:${c.value}`, field: c.field, patch: c.patch, value: c.value, evidence: c.evidence, note: c.note,
        // a field that already has a different answer is less likely to need changing
        confidence: now ? clamp(c.confidence - 0.15) : c.confidence,
        current: now ?? undefined,
      });
    }
  }
  suggestions.sort((x, y) => y.confidence - x.confidence);

  // What property matching already picks up from the notes
  const need = clientNeeds(a);
  const understood: string[] = [];
  if (need.beds?.asked) {
    const { min, max } = need.beds;
    understood.push(min === max ? (min === 0 ? 'Studio' : `${min} bed`) : min === 0 ? `Studio or ${max} bed` : `${min} to ${max} bed`);
  }
  if (need.askNames.length) understood.push(`Wants ${need.askNames.slice(0, 3).join(', ')}`);
  if (need.flexible) understood.push('Open to any area');
  if (need.rentCap !== null) understood.push(`Up to £${need.rentCap.toLocaleString('en-GB')} (on UC alone)`);
  if (need.selfContained) understood.push('Self-contained');
  if (need.needsStepFree) understood.push('Ground floor or step-free');

  return { suggestions, flags, understood };
}

// A client's profile: everything Keel knows or can work out about them, put together to say where they can be
// placed. Each fact says where it came from: recorded on the form, read from what they wrote, or worked out.
//
//   who is moving in    the form, else read from their message ("I am interested in a 1 bedroom or studio flat"
//                       with nobody else mentioned reads as one adult)
//   age and age band    their date of birth, else an age they gave ("I'm 28")
//   the rate they get   families by bedrooms; couples, single people 35 or over, and under-35s exempt from the
//                       shared rate: 1 bed; other under-35s: the shared accommodation rate (SAR)
//   where to place them the LHA areas their available matches are in, counting the properties whose rent is
//                       within the LHA they are paid there; focus boroughs first
//   what to ask next    the answers that would change where they can go
//
// Read-only: nothing here changes the record. `sureAnswers` lists what can be filled in with one tap.

import type { Applicant } from './types';
import { benefitCapOf, benefitsOf, councilOf, householdOf, sharedRateExempt } from './search';
import type { HouseholdKey } from './search';
import { readAgeText, readHouseholdText, readNotes } from './readNotes';
import type { Suggestion } from './readNotes';
import { clientNeeds, matchesForApplicant } from './propertyMatch';
import type { PropertyLike } from './propertyMatch';
import { lhaAreaFor, lhaCheck, rateFor, sizeWords } from './lha';
import type { LhaSize, PropertyForLha } from './lha';
import { boroughOf, focusRank } from './councils';
import { inGreaterLondon } from './propertyChecks';
import { LONDON_BOROUGHS } from './london';
import type { CouncilScheme } from './councils';
import { fromHousingOfficer } from './money';
import { money } from './format';
import { todayIso } from './calls';
import { activeSettings } from './settings';
import { HOUSEHOLD_LABEL } from './tiering';

export type Source = 'recorded' | 'read' | 'worked out' | 'not known';
export interface Known<T> { value: T | null; how: Source; why?: string }
export type RateType = 'uc_35_plus' | 'sar_exempt' | 'under_35_standard' | 'couples' | 'families';
export const RATE_TYPE_WORDS: Record<RateType, string> = {
  uc_35_plus: '35 plus', sar_exempt: 'Exempt from the shared rate', under_35_standard: 'Under 35 standard',
  couples: 'Couple', families: 'Family',
};

export interface Place {
  brma: string;
  /** the LHA they are paid there, for their size */
  rate: number | null;
  /** available matching properties within that LHA */
  fits: number;
  /** the cheapest of them */
  best: { address: string; rent: number } | null;
  focus: boolean;
}

export interface ClientProfile {
  household: Known<HouseholdKey>;
  age: Known<number>;
  ageBand: Known<'under_35' | '35_plus'>;
  /** reasons they may be exempt from the shared rate (to check) */
  exemptions: string[];
  rateType: Known<RateType>;
  size: Known<LhaSize>;
  /** rentCap: the most they can be matched to on UC alone (Team settings), or null when the limit does not apply */
  benefits: { uc: boolean | null; pip: boolean | null; lcwra: boolean | null; working: boolean | null; rentCap: number | null; cap: Applicant['benefit_cap'] | null; capWhy: string | null };
  wants: { beds: string | null; areas: string[]; anywhere: boolean; selfContained: boolean; stepFree: boolean };
  council: { name: string | null; route: 'housing officer' | 'council' | 'self'; incentive: string | null; incentiveMax: number | null };
  places: Place[];
  toAsk: Array<{ what: string; why: string }>;
  summary: string;
  /** suggestions from their notes sure enough to fill in with one tap (nothing already answered is changed) */
  sureAnswers: Suggestion[];
}

const yearsSince = (iso: string, today: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

/** Reasons a client under 35 may not be held to the shared rate. Each is a lead to check, never assumed. (PIP is not a
 *  lead: it exempts them outright, `sharedRateExempt`.) */
export function exemptionsFrom(a: Applicant): string[] {
  const text = [a.notes, a.requirements, a.housing_situation].filter(Boolean).join(' \n ');
  const out: string[] = [];
  if (/\b(care leaver|leaving care|left care|in care until|foster care)\b/i.test(text)) out.push('Care leaver (exempt until 25)');
  if (/\bhostel\b/i.test(text)) out.push('Hostel stay (exempt from 25 if 3 months or more in a homeless hostel)');
  if (/\b(mappa|probation|released from prison|on licence)\b/i.test(text)) out.push('MAPPA or probation (exempt if managed under MAPPA)');
  if (/\b(domestic (?:abuse|violence)|fled|fleeing|refuge)\b/i.test(text)) out.push('Domestic abuse (may be exempt: check)');
  return out;
}

/** Who is moving in, their age and age band, and the LHA rate they are paid at. Used by the profile and by matching. */
export interface RateFacts {
  household: Known<HouseholdKey>;
  age: Known<number>;
  ageBand: Known<'under_35' | '35_plus'>;
  exemptions: string[];
  rateType: Known<RateType>;
  size: Known<LhaSize>;
}

const rateCache = new WeakMap<Applicant, { today: string; facts: RateFacts }>();

export function rateOf(a: Applicant, today = todayIso()): RateFacts {
  const hit = rateCache.get(a);
  if (hit && hit.today === today) return hit.facts;
  const text = [a.notes, a.requirements].filter(Boolean).join('\n');

  // Who is moving in
  const recorded = householdOf(a);
  const read = recorded ? null : readHouseholdText(text);
  const household: Known<HouseholdKey> = recorded ? { value: recorded, how: a.household_type ? 'recorded' : 'worked out', why: a.household_type ? undefined : 'from adults and children' }
    : read ? { value: read.type, how: 'read', why: read.note ?? `“${text.slice(read.at, read.at + read.length)}”` } : { value: null, how: 'not known' };

  // Age: the date of birth, else the age band recorded (0023), else an age they gave
  const ageRead = a.date_of_birth ? null : readAgeText(text);
  const age: Known<number> = a.date_of_birth ? { value: yearsSince(a.date_of_birth, today), how: 'recorded' }
    : ageRead?.age != null ? { value: ageRead.age, how: 'read', why: `“${text.slice(ageRead.at, ageRead.at + ageRead.length)}”` } : { value: null, how: 'not known' };
  const ageBand: Known<'under_35' | '35_plus'> = a.date_of_birth && age.value != null ? { value: age.value < 35 ? 'under_35' : '35_plus', how: 'recorded' }
    : a.age_band ? { value: a.age_band, how: 'recorded' }
    : age.value != null ? { value: age.value < 35 ? 'under_35' : '35_plus', how: age.how }
    : ageRead?.band ? { value: ageRead.band, how: 'read' } : { value: null, how: 'not known' };
  const exemptions = exemptionsFrom(a);

  // The rate they are paid at
  const h = household.value;
  const needs = clientNeeds(a);
  let rateType: Known<RateType>;
  let size: Known<LhaSize>;
  if (h === 'family') {
    const beds = Math.min(4, Math.max(2, needs.beds && !needs.beds.asked ? needs.beds.min : 1 + Math.ceil(Math.max(1, needs.children) / 2))) as LhaSize;
    rateType = { value: 'families', how: household.how };
    size = { value: beds, how: 'worked out', why: `${needs.children || 'their'} ${needs.children === 1 ? 'child' : 'children'}` };
  } else if (h === 'couple') {
    rateType = { value: 'couples', how: household.how };
    size = { value: 1, how: 'worked out', why: 'a couple is paid the 1 bed rate' };
  } else if (h === 'single' || h === 'other') {
    if (ageBand.value === '35_plus') {
      rateType = { value: 'uc_35_plus', how: ageBand.how };
      size = { value: 1, how: 'worked out', why: '35 or over: the 1 bed rate' };
    } else if (sharedRateExempt(a)) {
      // PIP: never the shared rate, so their age does not change what they are paid
      rateType = { value: 'sar_exempt', how: a.pip === true ? 'recorded' : 'read', why: 'gets PIP' };
      size = { value: 1, how: 'worked out', why: 'PIP: never held to the shared rate' };
    } else if (ageBand.value === 'under_35') {
      const exempt = exemptions.some((e) => /exempt until|exempt from 25|exempt if managed/.test(e));
      rateType = exempt ? { value: 'sar_exempt', how: 'worked out', why: exemptions[0] } : { value: 'under_35_standard', how: ageBand.how };
      size = exempt ? { value: 1, how: 'worked out', why: `under 35 but ${exemptions[0].toLowerCase()}` } : { value: 'shared', how: 'worked out', why: 'under 35: the shared accommodation rate' };
    } else {
      rateType = { value: null, how: 'not known', why: 'needs their age' };
      size = { value: null, how: 'not known', why: '1 bed rate if 35 or over, the shared rate if under' };
    }
  } else {
    rateType = { value: null, how: 'not known' };
    size = { value: null, how: 'not known' };
  }
  const facts = { household, age, ageBand, exemptions, rateType, size };
  rateCache.set(a, { today, facts });
  return facts;
}

/** The answers matching needs (Step 6) that are still missing: where they want to live, age band, who is moving in,
 *  UC, the benefit cap and PIP or LCWRA. */
export function matchingGaps(a: Applicant, today = todayIso()): string[] {
  const r = rateOf(a, today);
  const needs = clientNeeds(a);
  const text = [a.notes, a.requirements].filter(Boolean).join('\n');
  const out: string[] = [];
  if (!a.postcode_area?.trim() && !needs.askNames.length && !needs.flexible && !/\blondon\b/i.test(text)) out.push('Postcode area');
  if (!r.household.value) out.push('Who is moving in');
  // with PIP their age does not change the rate, so it is not needed for matching
  if ((r.household.value === 'single' || r.household.value === 'other' || !r.household.value) && !r.ageBand.value && !sharedRateExempt(a)) out.push('Age band');
  if (a.on_uc == null && !benefitsOf(a).some((b) => b.key === 'uc')) out.push('UC');
  if ('benefit_cap' in a && !benefitCapOf(a).status && a.on_uc !== false) out.push('Benefit cap');
  if (a.pip == null && a.lcwra == null) out.push('PIP or LCWRA');
  return out;
}

/** Everything known or worked out about a client, and where they can be placed among the properties given. */
export function profileOf(a: Applicant, opts: { properties?: Array<PropertyLike & PropertyForLha & { id?: string; status?: string }>; schemes?: CouncilScheme[]; today?: string } = {}): ClientProfile {
  const today = opts.today ?? todayIso();
  const text = [a.notes, a.requirements].filter(Boolean).join('\n');
  const toAsk: ClientProfile['toAsk'] = [];

  const { household, age, ageBand, exemptions, rateType, size } = rateOf(a, today);
  const h = household.value;
  const needs = clientNeeds(a);
  if (!household.value) toAsk.push({ what: 'Who is moving in', why: 'decides the size of home and the rate they are paid' });
  if ((h === 'single' || h === 'other') && !ageBand.value && !sharedRateExempt(a)) {
    toAsk.push({ what: 'Their date of birth', why: 'under 35 they are paid the shared rate unless exempt; 35 or over, the 1 bed rate' });
  }

  // Benefits
  const has = (k: string) => benefitsOf(a).some((b) => b.key === k);
  const working = a.work_status ? a.work_status === 'full_time' || a.work_status === 'part_time' : null;
  const benefits = {
    uc: a.on_uc ?? (has('uc') ? true : null), pip: a.pip ?? (has('pip') ? true : null), lcwra: a.lcwra ?? (has('lcwra') ? true : null),
    working, rentCap: needs.rentCap, cap: benefitCapOf(a).status, capWhy: benefitCapOf(a).why,
  };
  if (benefits.uc === null) toAsk.push({ what: 'Whether they are on Universal Credit', why: 'LHA only pays the rent for people on UC or housing benefit' });
  if (benefits.uc && benefits.pip === null && benefits.lcwra === null) toAsk.push({ what: 'PIP or LCWRA', why: `either lifts the ${money(activeSettings().ucOnlyRentCap)} limit on UC alone and the benefit cap; PIP also means never the shared rate` });
  if (benefits.uc && !working && !benefits.cap) toAsk.push({ what: 'Whether the benefit cap applies to them', why: 'a capped household may not cover the full LHA' });

  // What they asked for
  const bedsWords = needs.beds ? (needs.beds.min === needs.beds.max ? (needs.beds.min === 0 ? 'a studio' : `a ${needs.beds.min} bed`) : needs.beds.min === 0 ? `a studio or ${needs.beds.max} bed` : `${needs.beds.min} to ${needs.beds.max} bed`) : null;
  // "Area: london", "anywhere in London": London as a whole (and a London council means London too)
  const saysLondon = /\blondon\b/i.test(text);
  const wants = { beds: bedsWords, areas: needs.askNames.length ? needs.askNames : saysLondon ? ['London'] : [], anywhere: needs.flexible, selfContained: needs.selfContained, stepFree: needs.needsStepFree };
  if (!needs.askNames.length && !wants.anywhere) {
    toAsk.push(saysLondon ? { what: 'Which parts of London', why: 'London has 14 LHA areas, each with its own rate' }
      : { what: 'Where they can live', why: 'without an area, every London LHA area is tried' });
  }

  // Council, and the incentive that might come with them
  const councilName = councilOf(a);
  const route: ClientProfile['council']['route'] = fromHousingOfficer(a) ? 'housing officer' : councilName ? 'council' : 'self';
  const scheme = councilName ? (opts.schemes ?? []).find((s) => boroughOf({ council: s.council }) === councilName) ?? null : null;
  const incentive = scheme
    ? `${scheme.registered ? 'Registered with' : 'Not yet registered with'} ${scheme.scheme_name ?? `${councilName}'s scheme`}${scheme.max_incentive != null ? `, up to ${money(scheme.max_incentive)}` : ''}`
    : route === 'housing officer' ? 'Officer referral: an incentive often comes with it' : councilName ? `No scheme recorded for ${councilName}` : null;
  if (!councilName) toAsk.push({ what: 'Their council', why: 'the council pays the incentive, and its scheme decides how' });
  else if (a.council_registered == null) toAsk.push({ what: `Whether they are on ${councilName}'s housing register`, why: 'most incentives need it' });

  // Where to place them: the LHA areas their available matches are in, counted by what fits their LHA there
  // a client who wants London (or whose council is in London) is not placed outside it, unless they named somewhere outside
  const londonOnly = (saysLondon || (councilName !== null && LONDON_BOROUGHS.has(councilName)))
    && !needs.askNames.some((n) => { const b = boroughOf({ borough: n }); return b !== null && !LONDON_BOROUGHS.has(b); });
  const available = (opts.properties ?? []).filter((p) => (!p.status || p.status === 'void' || p.status === 'under_offer')
    && (!londonOnly || inGreaterLondon({ postcode: p.postcode, address_line: p.address_line, borough: p.borough }) !== false));
  const byArea = new Map<string, Place>();
  for (const { property: p } of matchesForApplicant(a, available)) {
    const check = lhaCheck(p);
    if (!check) continue;
    const brma = check.area.brma;
    const rate = size.value ? rateFor(brma, size.value) : check.rate;
    const rent = check.rent ?? p.rent_pcm ?? null;
    const place = byArea.get(brma) ?? { brma, rate, fits: 0, best: null, focus: false };
    const borough = boroughOf({ borough: p.borough ?? null });
    if (borough && focusRank(borough) === 0) place.focus = true;
    if (rent !== null && rate !== null && rent <= rate + 0.005) {
      place.fits += 1;
      if (!place.best || rent < place.best.rent) place.best = { address: p.address_line, rent };
    }
    byArea.set(brma, place);
  }
  // with nothing in stock that fits, still say what they are paid in the areas they want (or their council's)
  if (![...byArea.values()].some((x) => x.fits > 0)) {
    const boroughs = [...needs.wantedBoroughs.keys(), ...(councilName ? [councilName] : [])];
    for (const b of boroughs) {
      const area = lhaAreaFor({ address_line: '', postcode: null, borough: b, property_type: null, bedrooms: null, rent_pcm: null, rent_text: null });
      if (!area || byArea.has(area.brma)) continue;
      byArea.set(area.brma, { brma: area.brma, rate: size.value ? rateFor(area.brma, size.value) : null, fits: 0, best: null, focus: focusRank(b) === 0 });
    }
  }
  const places = [...byArea.values()].sort((x, y) => y.fits - x.fits || Number(y.focus) - Number(x.focus) || (y.rate ?? 0) - (x.rate ?? 0)).slice(0, 4);

  // One line
  const who = h ? `${HOUSEHOLD_LABEL[h] ?? h}${household.how === 'read' ? ' (from their message)' : ''}` : 'Household not known';
  const ageWords = age.value != null ? `${age.value}` : ageBand.value ? (ageBand.value === 'under_35' ? 'under 35' : '35 or over') : 'age not known';
  const paid = size.value ? `paid the ${sizeWords(size.value)} rate` : h === 'single' || h === 'other' ? 'paid the 1 bed rate if 35 or over, the shared rate if under' : null;
  const where = wants.areas.length ? `in ${wants.areas.slice(0, 3).join(', ')}` : wants.anywhere ? 'anywhere' : null;
  const fit = places.reduce((s, p) => s + p.fits, 0);
  const summary = [
    `${who}, ${ageWords}${benefits.uc ? ', on UC' : ''}.`,
    bedsWords || where ? `Wants ${[bedsWords, where].filter(Boolean).join(' ')}${wants.selfContained ? ', nothing shared' : ''}.` : null,
    paid ? `${paid[0].toUpperCase()}${paid.slice(1)}.` : null,
    opts.properties ? (fit ? `${fit} available ${fit === 1 ? 'property fits' : 'properties fit'} within their LHA.` : 'No available property fits within their LHA yet.') : null,
  ].filter(Boolean).join(' ');

  const sureAnswers = readNotes(a).suggestions.filter((s) => s.confidence >= 0.7 && !s.current);

  return { household, age, ageBand, exemptions, rateType, size, benefits, wants, council: { name: councilName, route, incentive, incentiveMax: scheme?.max_incentive ?? null }, places, toAsk, summary, sureAnswers };
}

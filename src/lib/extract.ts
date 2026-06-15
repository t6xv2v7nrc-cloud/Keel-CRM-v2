import type {
  DocType,
  Extraction,
  ExtractedDate,
  SuggestedAction,
} from '../types/extraction';
import { toE164, normalisePostcode } from './format';

// ── Field-level pattern matching ────────────────────────────────────

const UK_PHONE = /(?:(?:\+44\s?|0)(?:7\d{3}|\d{2,4})[\s-]?\d{3,4}[\s-]?\d{3,4})/g;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b/gi;
const MONEY = /£\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/g;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Dates: 12/06/2026, 12-06-26, 12 June 2026, 3rd July
const DATE =
  /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4})\b/gi;

/** Pull the first capture of a labelled field, e.g. "Name: Lubna Hassan". */
function labelled(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, 'i');
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim().split(/\s{2,}|\||,(?=\s*[A-Z][a-z]+:)/)[0].trim();
  }
  return undefined;
}

function firstMoney(text: string): number | undefined {
  const m = MONEY.exec(text);
  MONEY.lastIndex = 0;
  if (!m) return undefined;
  return Number(m[1].replace(/,/g, ''));
}

function allDates(text: string): ExtractedDate[] {
  const out: ExtractedDate[] = [];
  let m: RegExpExecArray | null;
  DATE.lastIndex = 0;
  while ((m = DATE.exec(text)) !== null) {
    out.push({ date: m[1].trim() });
    if (out.length >= 5) break;
  }
  return out;
}

// ── Document classification (weighted structural signals) ───────────
// Raw keyword counting is too blunt: a referral that says "looking for a
// studio" should not read as a property listing. We score each doc_type
// from a set of boolean features, weighting the ones that actually
// distinguish (a postcode + "to let" = a listing; name + benefit +
// "looking for" = a referral).

interface Features {
  hasPostcode: boolean;
  hasRent: boolean;
  hasFee: boolean;
  hasBenefit: boolean;
  hasNameLabel: boolean;
  hasLookingFor: boolean;
  hasReferral: boolean;
  hasViewing: boolean;
  hasOffer: boolean;
  hasToLet: boolean;
  hasGreeting: boolean;
  hasTenancy: boolean;
}

function features(text: string): Features {
  POSTCODE.lastIndex = 0;
  return {
    hasPostcode: POSTCODE.test(text),
    hasRent: /\b(rent|pcm|per month|per calendar month)\b/i.test(text),
    hasFee: /\b(fee|invoice|incentive|commission|finder'?s fee)\b/i.test(text),
    hasBenefit: /\buniversal credit\b|\bhousing benefit\b|\bUC\b|\bHB\b/i.test(text),
    hasNameLabel: /\b(name|applicant|client|tenant)\s*[:\-]/i.test(text),
    hasLookingFor: /\b(looking for|needs?|seeking|wants?|requires?|in need of|after a)\b/i.test(text),
    hasReferral: /\b(refer(ral|ring|red)?|i'?ve got (a|someone)|new (client|applicant))\b/i.test(text),
    hasViewing: /\b(viewing|appointment|come (and )?see|visit|booked .*(view|see)|available to view)\b/i.test(text),
    hasOffer: /\b(offer|landlord (will )?accept|accepted|happy to take|will take (them|him|her))\b/i.test(text),
    hasToLet: /\b(to let|available (from|now|immediately)|move[- ]?in|vacant)\b/i.test(text),
    hasGreeting: /\b(hi|hello|morning|hope you'?re|thanks|cheers|let me know)\b/i.test(text),
    hasTenancy: /\b(tenancy agreement|\bast\b|assured shorthold|inventory|right to rent)\b/i.test(text),
  };
}

function classify(text: string): { doc_type: DocType; confidence: number } {
  const f = features(text);
  const scores: Array<{ type: DocType; score: number }> = [
    { type: 'tenancy_doc', score: f.hasTenancy ? 6 : 0 },
    { type: 'fee_confirmation', score: (f.hasFee ? 4 : 0) + (/\bconfirm/i.test(text) ? 1 : 0) },
    { type: 'viewing_arrangement', score: f.hasViewing ? 4 : 0 },
    {
      type: 'applicant_referral',
      score:
        (f.hasReferral ? 3 : 0) +
        (f.hasBenefit ? 2 : 0) +
        (f.hasLookingFor ? 2 : 0) +
        (f.hasNameLabel ? 1 : 0),
    },
    {
      type: 'landlord_offer',
      // an offer about a known property, not someone looking
      score: (f.hasOffer ? 3 : 0) + (f.hasToLet ? 1 : 0) - (f.hasLookingFor ? 2 : 0),
    },
    {
      type: 'property_details',
      // a listing: address/postcode + availability + rent, penalised if it
      // reads like a person looking (benefit / looking-for present)
      score:
        (f.hasPostcode ? 2 : 0) +
        (f.hasToLet ? 2 : 0) +
        (f.hasRent ? 1 : 0) -
        (f.hasBenefit ? 2 : 0) -
        (f.hasLookingFor ? 1 : 0),
    },
    { type: 'officer_message', score: f.hasGreeting ? 1 : 0 },
  ];

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score <= 0) return { doc_type: 'unknown', confidence: 0.3 };
  const lead = top.score - (scores[1]?.score ?? 0);
  const confidence = Math.min(0.9, 0.45 + top.score * 0.06 + lead * 0.05);
  return { doc_type: top.type, confidence: Number(confidence.toFixed(2)) };
}

// ── Default suggested actions per doc_type ──────────────────────────

const ACTIONS_BY_TYPE: Record<DocType, SuggestedAction[]> = {
  applicant_referral: ['create_applicant', 'advance_stage'],
  property_details: ['create_property'],
  officer_message: ['log_note_only'],
  viewing_arrangement: ['advance_stage'],
  fee_confirmation: ['record_fee', 'update_placement'],
  landlord_offer: ['update_property', 'advance_stage'],
  tenancy_doc: ['log_note_only'],
  unknown: ['log_note_only'],
};

/** Heuristic extractor: raw OCR text + optional source hint → structured Extraction.
 *  Drop-in replaceable by a Claude-vision call later; same return contract. */
export function extractFromText(rawText: string, sourceHint?: string): Extraction {
  const text = rawText.replace(/\r/g, '');
  const hintText = sourceHint ? `${sourceHint}\n${text}` : text;

  const { doc_type, confidence } = classify(hintText);

  // Phones — first is treated as the primary person, second (if any) as contact.
  const phones = Array.from(text.matchAll(UK_PHONE))
    .map((m) => toE164(m[0]))
    .filter((p): p is string => Boolean(p));

  POSTCODE.lastIndex = 0;
  const postcodeMatch = POSTCODE.exec(text);
  POSTCODE.lastIndex = 0;
  const postcode = postcodeMatch ? normalisePostcode(postcodeMatch[0]) : undefined;

  const emailMatch = text.match(EMAIL);
  const fee = firstMoney(text);
  const dates = allDates(text);

  const name = labelled(text, ['name', 'applicant', 'client', 'tenant', 'full name']);
  const borough = labelled(text, ['borough', 'council', 'local authority', 'area']);
  const benefit =
    /\buniversal credit\b|\bUC\b/i.test(text) ? 'UC' : /\bhousing benefit\b|\bHB\b/i.test(text) ? 'HB' : undefined;

  const extraction: Extraction = {
    doc_type,
    transcription: rawText,
    summary: buildSummary(doc_type, { name, borough, fee, postcode }),
    confidence,
    suggested_actions: ACTIONS_BY_TYPE[doc_type],
  };

  // Populate entity blocks only with what we actually found.
  if (doc_type === 'property_details' || doc_type === 'landlord_offer') {
    extraction.property = {
      address_line: labelled(text, ['address', 'property']),
      postcode,
      borough,
      rent_pcm: fee,
    };
  } else {
    if (name || phones[0] || benefit) {
      extraction.applicant = {
        full_name: name,
        phone: phones[0],
        benefit_type: benefit,
        referring_borough: borough,
        budget_pcm: doc_type === 'applicant_referral' ? fee : undefined,
      };
    }
  }

  if (phones[1] || emailMatch) {
    extraction.contact = {
      full_name: sourceHint?.replace(/^from\s+/i, '').split(/,|\(/)[0].trim() || undefined,
      borough,
      phone: phones[1],
      email: emailMatch?.[0],
    };
  }

  if (doc_type === 'fee_confirmation' && fee) {
    extraction.money = { fee_amount: fee };
  }

  if (dates.length) extraction.dates = dates;

  return extraction;
}

function buildSummary(
  type: DocType,
  f: { name?: string; borough?: string; fee?: number; postcode?: string },
): string {
  const who = f.name ? ` for ${f.name}` : '';
  const where = f.borough ? ` (${f.borough})` : '';
  switch (type) {
    case 'applicant_referral':
      return `Applicant referral${who}${where}.`;
    case 'property_details':
      return `Property details${f.postcode ? ` at ${f.postcode}` : ''}${f.fee ? `, £${f.fee} pcm` : ''}.`;
    case 'fee_confirmation':
      return `Fee confirmation${f.fee ? ` for £${f.fee}` : ''}${who}.`;
    case 'viewing_arrangement':
      return `Viewing arrangement${who}.`;
    case 'landlord_offer':
      return `Landlord offer${f.postcode ? ` on ${f.postcode}` : ''}.`;
    case 'officer_message':
      return `Message from an officer${who}.`;
    case 'tenancy_doc':
      return `Tenancy document${who}.`;
    default:
      return 'Could not confidently classify this screenshot. Pick a target below.';
  }
}

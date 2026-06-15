import type { Extraction } from '../types/extraction';
import { toE164 } from './format';

/** Raw key/value pairs from a keellettings.com enquiry (email body or Netlify
 *  form payload). Keys are case-insensitive labels like "First Name". */
export type EnquiryFields = Record<string, string>;

/** Pull "Label: value" pairs out of a pasted enquiry email body. */
export function fieldsFromEmail(text: string): EnquiryFields {
  const out: EnquiryFields = {};
  const labels = ['First Name', 'Last Name', 'Email', 'Phone', 'Enquiry Type', 'Message'];
  for (const label of labels) {
    // Message runs to the end (or to a sign-off); others are single-line.
    if (label === 'Message') {
      const m = text.match(/Message:\s*([\s\S]+?)$/i);
      if (m) out[label] = m[1].trim();
    } else {
      const re = new RegExp(`${label}\\s*:\\s*(.+)`, 'i');
      const m = text.match(re);
      if (m) out[label] = m[1].trim();
    }
  }
  return out;
}

/** Parse household size from free text, e.g. "me and my 3 daughters". */
function parseHousehold(message: string): { adults: number; children: number } {
  let adults = 1; // the enquirer
  let children = 0;

  const kids = message.match(/(\d+)\s*(child|children|kid|kids|son|sons|daughter|daughters)/i);
  if (kids) children = parseInt(kids[1], 10) || 0;

  // "me and my partner/wife/husband/family"
  if (/\b(my (partner|wife|husband)|with my partner)\b/i.test(message)) adults = 2;
  const familyOf = message.match(/family of\s*(\d+)/i);
  if (familyOf) {
    const total = parseInt(familyOf[1], 10) || 0;
    if (total > 0) { adults = Math.min(2, total); children = Math.max(0, total - adults); }
  }
  return { adults, children };
}

/** Parse a budget figure (pcm) from free text. Returns the upper bound of any
 *  range, e.g. "budget is 1400-1800" → 1800. */
function parseBudget(message: string): number | undefined {
  // "1400-1800" or "£1,400 - £1,800" or "budget is 1800"
  const range = message.match(/£?\s?(\d{3,4})(?:\s?[,.]?\d{3})?\s*[-–to]+\s*£?\s?(\d{3,4})/i);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const single = message.match(/budget(?:\s+is)?\s*£?\s?(\d{3,4})/i);
  if (single) return Number(single[1]);
  const anyMoney = message.match(/£\s?(\d{3,4})/);
  if (anyMoney) return Number(anyMoney[1]);
  return undefined;
}

/** Parse bedroom requirement, e.g. "2-3 bedroom" → "2-3 bed". */
function parseBeds(message: string): string | undefined {
  const m = message.match(/(\d(?:\s*[-–to]+\s*\d)?)\s*(?:bed|bedroom)/i);
  return m ? `${m[1].replace(/\s/g, '')} bed` : undefined;
}

/** Turn raw enquiry fields into the shared Extraction contract.
 *  No OCR, no AI — the data is already structured at source. */
export function enquiryToExtraction(fields: EnquiryFields): Extraction {
  const first = fields['First Name'] ?? '';
  const last = fields['Last Name'] ?? '';
  const full_name = `${first} ${last}`.trim();
  const message = fields['Message'] ?? '';
  const phone = fields['Phone'] ? toE164(fields['Phone']) ?? fields['Phone'] : undefined;

  const { adults, children } = parseHousehold(message);
  const budget = parseBudget(message);
  const beds = parseBeds(message);

  const requirements = [
    beds && `${beds} wanted`,
    /furnish/i.test(message) ? (/part/i.test(message) ? 'furnished or part-furnished' : 'furnished') : null,
  ].filter(Boolean).join('; ') || undefined;

  return {
    doc_type: 'applicant_referral',
    transcription: [
      first && `First Name: ${first}`,
      last && `Last Name: ${last}`,
      fields['Email'] && `Email: ${fields['Email']}`,
      fields['Phone'] && `Phone: ${fields['Phone']}`,
      fields['Enquiry Type'] && `Enquiry Type: ${fields['Enquiry Type']}`,
      message && `Message:\n${message}`,
    ].filter(Boolean).join('\n'),
    summary: `Website enquiry from ${full_name || 'an applicant'}${budget ? `, budget up to £${budget}` : ''}.`,
    confidence: 0.95, // structured source — high confidence
    applicant: {
      full_name: full_name || undefined,
      phone: phone || undefined,
      adults,
      children,
      budget_pcm: budget,
      requirements,
    },
    contact: fields['Email']
      ? undefined // the email belongs to the applicant, not a referring contact
      : undefined,
    suggested_actions: ['create_applicant'],
  };
}

/** Convenience: parse a pasted email body straight to an Extraction. */
export function parseEnquiryEmail(text: string): Extraction | null {
  const fields = fieldsFromEmail(text);
  if (!fields['First Name'] && !fields['Last Name'] && !fields['Email']) return null;
  return enquiryToExtraction(fields);
}

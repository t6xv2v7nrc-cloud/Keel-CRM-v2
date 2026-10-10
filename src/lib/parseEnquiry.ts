import type { Extraction } from '../types/extraction';
import { readHouseholdText } from './readNotes';
import { toE164 } from './format';

/** Raw key/value pairs from a keellettings.com enquiry (email body or Netlify
 *  form payload). Keys are case-insensitive labels like "First Name". */
export type EnquiryFields = Record<string, string>;

/** Pull "Label: value" pairs out of a pasted enquiry email body. */
function fieldsFromEmail(text: string): EnquiryFields {
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

/** Who is moving in, from the message: the same reading the client page uses ("my 13-year-old daughter" is a family). */
function parseHousehold(message: string): { adults: number; children: number; household_type?: string } {
  const h = readHouseholdText(message);
  return { adults: h?.adults ?? 1, children: h?.children ?? 0, household_type: h && h.confidence >= 0.8 ? h.type : undefined };
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
function enquiryToExtraction(fields: EnquiryFields): Extraction {
  const first = fields['First Name'] ?? '';
  const last = fields['Last Name'] ?? '';
  const full_name = `${first} ${last}`.trim();
  const message = fields['Message'] ?? '';
  const phone = fields['Phone'] ? toE164(fields['Phone']) ?? fields['Phone'] : undefined;

  const { adults, children, household_type } = parseHousehold(message);
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
      email: fields['Email'] || undefined, // the applicant's own email, not a referring contact
      adults,
      children,
      household_type,
      budget_pcm: budget,
      requirements,
      notes: message || undefined, // kept on the client so you can see and search what they want
    },
    suggested_actions: ['create_applicant'],
  };
}

/** Convenience: parse a pasted email body straight to an Extraction. */
export function parseEnquiryEmail(text: string): Extraction | null {
  const fields = fieldsFromEmail(text);
  if (!fields['First Name'] && !fields['Last Name'] && !fields['Email']) return null;
  return enquiryToExtraction(fields);
}

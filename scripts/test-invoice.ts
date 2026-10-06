// Checks for invoices. Run with: npx tsx scripts/test-invoice.ts
import { defaultBillTo, invoiceEmail, invoiceFor, invoiceMessage, invoiceNumber, missingDetails, vatSplit } from '../src/lib/invoice';
import { DEFAULT_INVOICE } from '../src/lib/settings';
import type { InvoiceSettings } from '../src/lib/settings';
import type { Provider, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

const settings: InvoiceSettings = {
  ...DEFAULT_INVOICE, address: '1 High Street\nLondon N1 1AA', email: 'hello@keel.example', accountName: 'Keel Lettings Ltd', sortCode: '12-34-56', accountNumber: '12345678',
};
const watermint: Provider = {
  id: 'wm', name: 'Watermint', contact_first_name: 'Sam', company: 'Watermint Homes Ltd', tag: 'WM', whatsapp: '447700900123', email: 'accounts@watermint.example',
  rules: {}, fee_terms: null, notes: null, active: true, created_at: '', updated_at: '',
};
const fee: Receivable = {
  id: 'r1', kind: 'letting_fee', applicant_id: 'a1', deal_id: 'd1', property_address: 'Flat 6, 78 Thornton Avenue', payer: 'Watermint', provider_id: 'wm',
  amount: 288.46, sign_up_on: '2026-10-06', due_on: '2026-11-06', claim_submitted_on: null, status: 'due', paid_on: null, notes: null,
  rent_pcm: 1250, fee_basis: 'weeks', fee_rate: 1, due_after: 'sign_up', invoice_number: 'KEEL-0007', invoiced_on: '2026-10-06', bill_to: null,
  created_at: '', updated_at: '',
};
const client = { full_name: 'Rio Dawkins' };

check('numbers: prefix and four digits', invoiceNumber('KEEL-', 7) === 'KEEL-0007' && invoiceNumber('INV', 12345) === 'INV12345');
check('not VAT registered: no VAT', JSON.stringify(vatSplit(300, false)) === '{"net":300,"vat":0,"total":300}');
check('VAT registered: £300 includes £50 VAT', JSON.stringify(vatSplit(300, true)) === '{"net":250,"vat":50,"total":300}');
check('VAT on pence adds back up', (() => { const v = vatSplit(288.46, true); return v.net + v.vat === 288.46 && v.net === 240.38; })(), JSON.stringify(vatSplit(288.46, true)));

check('bill to a provider: company, contact, email', defaultBillTo(fee, watermint) === 'Watermint Homes Ltd\nAttn: Sam\naccounts@watermint.example');
check('bill to the landlord: left for you to fill in', defaultBillTo({ ...fee, payer: 'Landlord' }, null) === '');
check('bill to a council', defaultBillTo({ kind: 'incentive', payer: 'Barnet council' }, null) === 'Barnet Council');

const inv = invoiceFor(fee, { client, settings, billTo: defaultBillTo(fee, watermint), today: '2026-10-08' });
check('invoice: number, date raised, due date in words', inv.number === 'KEEL-0007' && inv.date === '2026-10-06' && inv.due === '6 November 2026');
check('invoice to a provider names the client by first name only', inv.lines[0].detail.includes('Tenant: Rio') && !JSON.stringify(inv).includes('Dawkins'));
check('invoice shows how the fee was worked out', inv.lines[0].detail.includes('1 week\'s rent at £1,250 pcm') && inv.lines[0].description === 'Letting fee: Flat 6, 78 Thornton Avenue');
check('invoice: bank details and the number as reference', inv.payment.includes('Sort code: 12-34-56') && inv.payment.includes('Reference: KEEL-0007'));
check('invoice: Keel\'s address one line each', inv.from.join('|') === 'Keel Lettings Ltd|1 High Street|London N1 1AA|hello@keel.example');
check('invoice: total, no VAT', inv.total === 288.46 && inv.vat === 0 && inv.vatNumber === null);
const council = invoiceFor({ ...fee, kind: 'incentive', payer: 'Barnet council', fee_basis: null, fee_rate: null, amount: 1000 }, { client, settings: { ...settings, vatRegistered: true, vatNumber: 'GB123456789' }, today: '2026-10-08' });
check('incentive claim to a council carries the full name', council.lines[0].detail.includes('Tenant: Rio Dawkins') && council.lines[0].description.startsWith('Council incentive'));
check('VAT registered invoice shows the VAT number and the split', council.vatNumber === 'GB123456789' && council.net === 833.33 && council.vat === 166.67);
const waits = invoiceFor({ ...fee, due_after: 'first_rent', first_rent_paid_on: null }, { client, settings, today: '2026-10-08' });
check('a fee that waits: due once the first month\'s rent is paid', waits.due === 'Once the first month\'s rent is paid');
check('missing details are named', missingDetails(DEFAULT_INVOICE).join(', ') === 'address, bank details' && missingDetails(settings).length === 0);

const msg = invoiceMessage(fee, { provider: watermint, client, myName: 'Ridwan', settings });
check('WhatsApp: Salam, number, amount, first name, bank details', msg.startsWith('Salam Sam, here is invoice KEEL-0007 for £288.46: the letting fee for Rio at Flat 6, 78 Thornton Avenue, due 6 November 2026.')
  && msg.includes('sort code 12-34-56, account 12345678') && msg.endsWith('Thanks, Ridwan, Keel Lettings') && !msg.includes('Dawkins'), msg);
const mail = invoiceEmail(fee, { client, myName: 'Ridwan', settings });
check('email subject and body', mail.subject === 'Invoice KEEL-0007 from Keel Lettings Ltd' && mail.body.includes('£288.46, the letting fee for Rio at') && !mail.body.includes('Dawkins'), mail.body);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

// Checks for placements: money read from Finances, Keel's share and the flags. Run with: npx tsx scripts/test-placements.ts
import { moneyLine, placementsFrom, placementView } from '../src/lib/placements';
import type { Placement } from '../src/lib/placements';
import type { Deal, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const deal = (p: Partial<Deal>): Deal => ({ id: 'd1', applicant_id: 'a1', property_id: 'p1', address: '1 Moved Road, London N12 0AA', status: 'moved_in', viewing_at: null,
  move_in_on: '2026-10-01', fell_through_reason: null, notes: null, created_at: '', updated_at: '2026-10-01', ...p });
let n = 0;
const rec = (p: Partial<Receivable>): Receivable => ({ id: `r${++n}`, kind: 'incentive', applicant_id: 'a1', deal_id: 'd1', property_address: null, payer: 'Harrow council',
  provider_id: null, amount: 4000, sign_up_on: '2026-10-01', due_on: '2026-10-01', claim_submitted_on: null, status: 'due', paid_on: null, notes: null,
  created_at: '', updated_at: '', ...p });
const pl = (p: Partial<Placement>): Placement => ({ id: 'pl1', applicant_id: 'a1', property_id: 'p1', deal_id: 'd1', council: 'Harrow', move_in_date: '2026-10-01', rent_pcm: 1100,
  route: 'officer', provider_id: 'wm', fee_type: 'mixed', keel_share_pct: 50, invoiced_by: 'partner', split_agreed_in_writing: true,
  split_document_url: 'https://docs.example/agreement', renters_rights_sheet_on: '2026-10-01', notes: null, created_at: '', updated_at: '', ...p });
const providers = [{ id: 'wm', name: 'Watermint' }];

const all = placementView(deal({}), pl({}), [rec({}), rec({ kind: 'letting_fee', amount: 254, payer: 'Watermint' })], providers);
check('everything in order: no flags', all.flags.length === 0, JSON.stringify(all.flags));
check('the incentive and fee come from Finances', all.incentive?.amount === 4000 && all.fee?.amount === 254);
check("Keel's share is worked out from the incentive", all.keelShare === 2000 && all.keelIncome === 2254);
check('the partner is named from Providers', all.partner?.name === 'Watermint');

const noSplit = placementView(deal({}), pl({ split_agreed_in_writing: false, split_document_url: null }), [rec({})], providers);
check('an incentive with no split in writing is red', noSplit.flags.some((f) => f.tone === 'red' && f.key === 'no_written_split'));
const noRecord = placementView(deal({}), null, [rec({})], providers);
check('no placement record yet, with an incentive: red, and who invoices not set', noRecord.flags.some((f) => f.key === 'no_written_split') && noRecord.flags.some((f) => f.key === 'who_invoices'));
check('no incentive: no split needed', !placementView(deal({}), pl({ fee_type: 'week_rent', split_agreed_in_writing: false }), [rec({ kind: 'letting_fee', amount: 254 })], providers).flags.some((f) => f.key === 'no_written_split'));
check('a fee type of incentive counts before the incentive is on Finances', placementView(deal({}), pl({ fee_type: 'incentive', split_agreed_in_writing: false }), [], providers).flags.some((f) => f.key === 'no_written_split'));
check('agreed but no link: amber', placementView(deal({}), pl({ split_document_url: null }), [rec({})], providers).flags.some((f) => f.key === 'no_document' && f.tone === 'amber'));
check("both fee and incentive with no share set: amber", placementView(deal({}), pl({ keel_share_pct: null }), [rec({})], providers).flags.some((f) => f.key === 'share_not_set'));
check("Renters' Rights sheet not recorded: grey", placementView(deal({}), pl({ renters_rights_sheet_on: null }), [rec({})], providers).flags.some((f) => f.key === 'rra_sheet' && f.tone === 'grey'));
check('Keel invoicing alone keeps the whole incentive', placementView(deal({}), pl({ invoiced_by: 'keel', provider_id: null, keel_share_pct: null, fee_type: 'incentive' }), [rec({})], providers).keelShare === 4000);
check('a declined incentive is not counted', placementView(deal({}), pl({}), [rec({ status: 'declined' })], providers).incentive === null);
check("another client's money is not counted", placementView(deal({}), pl({}), [rec({ applicant_id: 'a2', deal_id: 'd9' })], providers).incentive === null);

const list = placementsFrom([deal({}), deal({ id: 'd2', status: 'viewing' }), deal({ id: 'd3', applicant_id: 'a3', move_in_on: '2026-10-10' })], [pl({})], [rec({})], providers);
check('only moved-in deals are placements, newest first', list.map((v) => v.deal.id).join() === 'd3,d1');
check('each finds its own record', list[1].placement?.id === 'pl1' && list[0].placement === null);
check('money in words', moneyLine(rec({ invoiced_on: '2026-10-03', paid_on: '2026-10-20', status: 'paid' }), 'incentive') === '£4,000 incentive, invoiced 3 Oct 2026, paid 20 Oct 2026', String(moneyLine(rec({ invoiced_on: '2026-10-03', paid_on: '2026-10-20', status: 'paid' }), 'incentive')));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

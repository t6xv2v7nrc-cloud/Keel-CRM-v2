// Checks for the in-product guidance: Getting started ticks itself off from what Keel holds, What's new and the tips
// read cleanly. Run with: npx tsx scripts/test-guide.ts
import { gettingStarted, TIPS, WHATS_NEW } from '../src/lib/guide';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

const none = { myName: null, lhaFromGovUk: false, businessMissing: 5, properties: 0, officers: 0, outlookSetUp: false, outlookConnected: false, pushOn: false, people: 1 };
const all = { myName: 'Ridwan', lhaFromGovUk: true, businessMissing: 0, properties: 12, officers: 40, outlookSetUp: true, outlookConnected: true, pushOn: true, people: 2 };
check('a new account: every step to do', gettingStarted(none).every((s) => !s.done));
check('all set up: every step done', gettingStarted(all).every((s) => s.done));
check('each step ticks itself from what Keel holds', gettingStarted({ ...none, properties: 3 }).find((s) => s.id === 'properties')!.done
  && !gettingStarted({ ...none, properties: 3 }).find((s) => s.id === 'officers')!.done);
check('Outlook not set up yet: the step goes to Team settings, then to My settings', gettingStarted(none).find((s) => s.id === 'outlook')!.href === '/settings?tab=team#outlook'
  && gettingStarted({ ...none, outlookSetUp: true }).find((s) => s.id === 'outlook')!.href === '/settings#myoutlook');
check('team steps are marked as the owner\'s', gettingStarted(none).filter((s) => s.owner).map((s) => s.id).join() === 'lha,business,team');
check('every Settings link opens a card that exists', gettingStarted(none).filter((s) => s.href.includes('#')).every((s) => ['you', 'lha', 'business', 'outlook', 'myoutlook', 'notifications'].includes(s.href.split('#')[1])));
check('What\'s new: each id once, newest first', new Set(WHATS_NEW.map((n) => n.id)).size === WHATS_NEW.length
  && WHATS_NEW.every((n, i) => i === 0 || WHATS_NEW[i - 1].date >= n.date));
const words = [...WHATS_NEW.flatMap((n) => [n.title, n.body, n.where ?? '']), ...Object.values(TIPS), ...gettingStarted(none).flatMap((s) => [s.title, s.why])];
check('no em dashes in any of it', !words.some((w) => w.includes('—')));
check('never mentions council incentives in What\'s new (it can be shown to anyone)', !WHATS_NEW.some((n) => /incentive/i.test(`${n.title} ${n.body}`)));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll guide checks pass');

// Checks for notes and last contact. Run with: npx tsx scripts/test-contacts.ts
import { lastContacts, noteActivity, readNote } from '../src/lib/contacts';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

check('a WhatsApp note is a contact', JSON.stringify(noteActivity('whatsapp', ' Talked about the viewing ')) === JSON.stringify({ kind: 'contact', body: 'WhatsApp: Talked about the viewing' }));
check('just a note is not a contact', noteActivity('note', 'Prefers texts').kind === 'note');
check('read back: channel and words', JSON.stringify(readNote({ kind: 'contact', body: 'In person: Met at the office' })) === JSON.stringify({ channel: 'in_person', text: 'Met at the office' }));
check('a note that starts with a colon word is not mistaken', readNote({ kind: 'note', body: 'Call: she will ring back' })?.channel === 'note');
check('other activities are not notes', readNote({ kind: 'progress', body: 'Viewing booked' }) === null);

const row = (entity_id: string, kind: string, body: string, created_at: string) => ({ entity_type: 'applicant', entity_id, kind, body, created_at, actor: 'u1' });
const map = lastContacts([
  row('a', 'note', 'Prefers texts', '2026-10-09T10:00:00Z'),          // a plain note: not contact
  row('a', 'contact', 'Text: Sent the address', '2026-10-05T10:00:00Z'),
  row('b', 'whatsapp', 'Sent 12 Elm Road on WhatsApp', '2026-10-08T10:00:00Z'),
  row('c', 'progress', 'Viewing booked', '2026-10-09T10:00:00Z'),     // not contact
  { ...row('d', 'contact', 'Call: x', '2026-10-01T10:00:00Z'), entity_type: 'property' },
], [{ applicant_id: 'b', created_at: '2026-10-09T09:00:00Z', notes: 'No answer' }]);
check('a plain note does not count as contact', map.get('a')?.channel === 'text' && map.get('a')?.at === '2026-10-05T10:00:00Z');
check('the newest wins: a call after a WhatsApp send', map.get('b')?.channel === 'call' && map.get('b')?.text === 'No answer');
check('progress and other records are not contact', !map.has('c') && !map.has('d'));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

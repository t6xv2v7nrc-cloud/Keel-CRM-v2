// Checks for arranging the cards on a client's page. Run with: npx tsx scripts/test-client-layout.ts
import { cardOrder, isStandardOrder, moveCard } from '../src/lib/clientLayout';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const std = cardOrder([]);
check('nothing saved: the standard order', std.join() === 'notes,progress,finances,suitable,details,nextstep,timeline', std.join());
const up = moveCard(std, 'timeline', -1);
check('timeline moves up one', up.join() === 'notes,progress,finances,suitable,details,timeline,nextstep', up.join());
check('the top card cannot move up', moveCard(std, 'notes', -1).join() === std.join());
check('the bottom card cannot move down', moveCard(std, 'timeline', 1).join() === std.join());
let top = std;
for (let i = 0; i < 10; i++) top = moveCard(top, 'timeline', -1);
check('timeline can go all the way to the top', top[0] === 'timeline');
check('a saved order is kept', cardOrder(['timeline', 'notes', 'progress', 'finances', 'suitable', 'details', 'nextstep'])[0] === 'timeline');
check('unknown or repeated names are ignored', cardOrder(['calls', 'timeline', 'timeline']).filter((k) => k === 'timeline').length === 1 && !cardOrder(['calls']).includes('calls' as never));
const partial = cardOrder(['timeline', 'notes']);
check('cards not in a saved order keep their standard place after it', partial.join() === 'timeline,notes,progress,finances,suitable,details,nextstep', partial.join());
check('standard order is recognised', isStandardOrder([]) && isStandardOrder(std) && !isStandardOrder(up));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

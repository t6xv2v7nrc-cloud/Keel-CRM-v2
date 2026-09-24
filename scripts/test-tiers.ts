// Checks for the tier logic engine. Run with: npx tsx scripts/test-tiers.ts
import { computeTier, describeTier, tierReason } from '../src/lib/tiering';
import { DEFAULT_TIER_LOGIC, mergeSettings } from '../src/lib/settings';
import type { TierLogic } from '../src/lib/settings';
import type { TierInputs } from '../src/lib/tiering';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

// The old fixed rules, for comparison
const oldTier = (i: TierInputs) =>
  i.household_type === 'single' && i.on_uc && i.pip && i.lcwra && i.council_registered ? 1
    : i.council_registered && (i.on_uc || i.work_status === 'full_time') ? 2 : 3;

// Every combination of the answers the old rules used
let same = 0; let total = 0;
for (const household_type of ['single', 'couple', 'family', null])
  for (const on_uc of [true, false, null])
    for (const pip of [true, false])
      for (const lcwra of [true, false])
        for (const council_registered of [true, false, null])
          for (const work_status of ['full_time', 'part_time', 'not_working', null]) {
            const i = { household_type, on_uc, pip, lcwra, council_registered, work_status };
            total += 1;
            if (computeTier(i, DEFAULT_TIER_LOGIC) === oldTier(i)) same += 1;
          }
check('standard logic gives the same tier as the old rules for every combination', same === total, `${same} of ${total}`);

// Old saved rules are converted, including a changed tick box
const merged = mergeSettings({ tiers: {
  tier1: { single: false, uc: true, pip: true, lcwra: true, councilRegistered: true },
  tier2: { councilRegistered: true, uc: true, fullTime: true, partTime: true, pip: false },
} }, undefined);
check('old saved rules become tier logic', merged.tierLogic.tiers.length === 3 && merged.tierLogic.tiers[0].all.length === 4);
check('converted rule: a couple on UC, PIP, LCWRA, registered is now Tier 1',
  computeTier({ household_type: 'couple', on_uc: true, pip: true, lcwra: true, council_registered: true }, merged.tierLogic) === 1);
check('converted rule: part-time and registered is Tier 2', computeTier({ council_registered: true, work_status: 'part_time' }, merged.tierLogic) === 2);

// A custom four-tier logic
const custom: TierLogic = { tiers: [
  { label: 'Emergency', all: [{ field: 'urgency', op: 'oneOf', values: ['homeless_tonight'] }], any: [] },
  { label: 'Priority', all: [{ field: 'pip', op: 'yes' }], any: [{ field: 'council', op: 'oneOf', values: ['Barnet', 'Enfield'] }, { field: 'budget', op: 'atLeast', n: 1300 }] },
  { label: 'Families', all: [{ field: 'children', op: 'atLeast', n: 1 }], any: [] },
  { label: 'Everyone else', all: [], any: [] },
] };
check('custom: homeless tonight is Emergency', computeTier({ urgency: 'homeless_tonight', pip: true }, custom) === 1);
check('custom: PIP in Barnet is Priority', computeTier({ pip: true, council: 'Barnet Council' }, custom) === 2);
check('custom: PIP with a £1,400 budget is Priority', computeTier({ pip: true, budget_pcm: 1400 }, custom) === 2);
check('custom: PIP in Croydon with no budget is not Priority', computeTier({ pip: true, council: 'Croydon' }, custom) === 4);
check('custom: a family is Families', computeTier({ children: 2 }, custom) === 3);
check('custom: others are Everyone else', computeTier({ on_uc: true }, custom) === 4);
check('an empty tier matches nobody', computeTier({ on_uc: true }, { tiers: [{ label: 'A', all: [], any: [] }, { label: 'B', all: [], any: [] }] }) === 2);
check('benefit text counts: "UC" in other benefits', computeTier({ benefit_type: 'UC', council_registered: true }, DEFAULT_TIER_LOGIC) === 2);

console.log('\n' + custom.tiers.map((t, k) => `${t.label}: ${describeTier(t, k === custom.tiers.length - 1)}`).join('\n'));
console.log('Reason for PIP in Croydon:', tierReason({ pip: true, council: 'Croydon' }, custom));
console.log('Reason standard Tier 1:', tierReason({ household_type: 'single', on_uc: true, pip: true, lcwra: true, council_registered: true }, DEFAULT_TIER_LOGIC));
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

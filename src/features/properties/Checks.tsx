import { useState } from 'react';
import { Button, Icon, useToast } from '../../components/ui';
import { useSetPropertyReady } from '../../lib/hooks';
import { isLocalProperty } from '../../lib/localProperties';
import { money } from '../../lib/format';
import { ACCOMMODATION_LABEL, BILLS_LABEL, checksFor, floorWords, SUITS_LABEL } from '../../lib/propertyChecks';
import type { Flag } from '../../lib/propertyChecks';
import type { Property } from '../../lib/types';

const TONE: Record<Flag['tone'], { bg: string; fg: string; icon: 'alert' | 'clock' | 'x' }> = {
  red: { bg: 'var(--danger-soft)', fg: 'var(--danger)', icon: 'x' },
  amber: { bg: 'var(--note-bg)', fg: 'var(--note-fg)', icon: 'alert' },
  grey: { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)', icon: 'clock' },
};
const small = 'min-h-0 px-2.5 py-1 text-[13px]';

/** A flag in words, never colour alone: "£36 over LHA", "Marked not ready: waiting for the EICR". */
export function FlagChip({ flag, full = false }: { flag: Flag; full?: boolean }) {
  const t = TONE[flag.tone];
  return (
    <span className="inline-flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: t.bg, color: t.fg }} title={flag.detail}>
      <Icon name={t.icon} size={12} className="mt-[2px] shrink-0" />
      <span className="min-w-0">{flag.words}{full && flag.detail ? <span className="font-normal">: {flag.detail}</span> : null}</span>
    </span>
  );
}

/** Under the LHA line on a property card: the flags, then what kind of place it is, who it suits, and whether it is
 *  ready to send. Ready is the standard (the suppliers see to the checks); Mark not ready holds it back. */
export function PropertyChecks({ property }: { property: Property }) {
  const c = checksFor(property);
  const setReady = useSetPropertyReady();
  const { toast } = useToast();
  const [holding, setHolding] = useState(false);
  const [note, setNote] = useState('');
  const facts = [
    c.accommodation ? `${ACCOMMODATION_LABEL[c.accommodation.type]}${c.accommodation.estimated ? ' (from its type)' : ''}` : null,
    c.suits.length ? `Suits ${c.suits.map((s) => SUITS_LABEL[s]).join(', ')}` : c.papers.known && !c.flags.some((f) => f.key === 'suits_not_set') ? 'Suits: not set' : null,
    c.sar !== null ? `Shared rate ${money(c.sar)}${c.sarGap !== null ? ` (${Math.abs(c.sarGap) < 0.005 ? 'at it' : `${money(Math.abs(c.sarGap))} ${c.sarGap > 0 ? 'over' : 'under'}`})` : ''}` : null,
    floorWords(property.floor, property.lift),
    property.bills_included?.length ? `Bills: ${property.bills_included.map((b) => BILLS_LABEL[b as keyof typeof BILLS_LABEL] ?? b).join(', ')}` : null,
  ].filter(Boolean);
  // over LHA is already the red badge on the LHA line above
  const shown = c.flags.filter((f) => f.key !== 'over_lha');
  const held = !!property.not_ready_at;
  const overLha = c.flags.some((f) => f.key === 'over_lha');
  const available = property.status === 'void' || property.status === 'under_offer';
  // holding one back needs 0025 (a property only on this device can always hold it)
  const canMark = isLocalProperty(property.id) || 'not_ready_at' in property;
  const mark = (ready: boolean) => setReady.mutate({ p: property, ready, note }, {
    onSuccess: () => { toast(ready ? 'Marked ready to send' : 'Marked not ready: it will not be sent', 'success'); setHolding(false); setNote(''); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{shown.map((f) => <FlagChip key={f.key} flag={f} full />)}</div>
      )}
      {facts.length > 0 && <div className="text-[13px] text-[var(--ink-muted)]">{facts.join(' · ')}</div>}
      {available && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {held ? (
            <Button className={small} disabled={setReady.isPending} onClick={() => mark(true)}><Icon name="check" size={13} />Mark ready</Button>
          ) : (
            <>
              <span className={`inline-flex items-center gap-1 font-medium ${overLha ? 'text-[var(--ink-muted)]' : 'text-[var(--accent-ink)]'}`}>
                <Icon name={overLha ? 'alert' : 'check'} size={13} />
                {/* over LHA still goes from the Mailer, marked red; clients see it only with Show over LHA */}
                {overLha ? 'Ready to send, marked over LHA' : `Ready to send${c.papers.known && c.papers.complete ? `, papers recorded${c.photos ? `, ${c.photos} photos` : ''}` : ''}`}
              </span>
              {!holding && canMark && <button type="button" onClick={() => setHolding(true)} className="text-[var(--link)] hover:underline">Mark not ready</button>}
            </>
          )}
        </div>
      )}
      {holding && !held && (
        <div className="flex flex-wrap items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, e.g. waiting for the EICR" aria-label="Why it is not ready"
            className="h-9 min-w-0 flex-1 basis-[200px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
          <Button className={small} disabled={setReady.isPending} onClick={() => mark(false)}>Hold it back</Button>
          <button type="button" onClick={() => { setHolding(false); setNote(''); }} className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
        </div>
      )}
    </div>
  );
}

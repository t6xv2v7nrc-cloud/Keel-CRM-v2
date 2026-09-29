import { useEffect, useState } from 'react';
import { Button, Icon, useToast } from '../../components/ui';
import { useApplicants, useClientNote, useDeals, useMoveDeal, usePeople, useProperties, useProviders } from '../../lib/hooks';
import { activeSettings } from '../../lib/settings';
import { FELL_THROUGH_REASONS, shortAddress, viewingWords } from '../../lib/progress';
import { firstNameOf, providerFor, requestMessage, slotWords } from '../../lib/requests';
import { viewingMessage, waLink, waNumber } from '../../lib/whatsapp';

// ── Opening from anywhere (a client's Progress, This week on Home) ──

const EVENT = 'keel:viewing-change';
export const openViewingChange = (dealId: string) => window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: dealId }));

/** Mounted once in the app shell. */
export function ViewingChangeHost() {
  const [dealId, setDealId] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setDealId((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return dealId ? <ViewingChangeSheet key={dealId} dealId={dealId} onClose={() => setDealId(null)} /> : null;
}

/** "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Move or cancel a booked viewing, then tell the client and the provider on WhatsApp. */
function ViewingChangeSheet({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { deals } = useDeals();
  const { data: applicants = [] } = useApplicants();
  const { data: properties = [] } = useProperties();
  const { providers } = useProviders();
  const { myName } = usePeople();
  const move = useMoveDeal();
  const note = useClientNote();
  const { toast } = useToast();

  // the viewing as it was when opened: once cancelled it has no time, but the messages still need it
  const [deal] = useState(() => deals.find((d) => d.id === dealId) ?? null);
  const applicant = deal ? applicants.find((a) => a.id === deal.applicant_id) ?? null : null;
  const [mode, setMode] = useState<'move' | 'cancel'>('move');
  const [when, setWhen] = useState(deal?.viewing_at ? toLocalInput(deal.viewing_at) : '');
  const [stillKeen, setStillKeen] = useState(true);
  const [reason, setReason] = useState<string>(FELL_THROUGH_REASONS[1]);
  const [done, setDone] = useState<null | { mode: 'move' | 'cancel'; oldAt: string; newAt: string | null }>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!deal || !applicant || !deal.viewing_at) return null;
  const property = properties.find((p) => p.id === deal.property_id) ?? properties.find((p) => p.address_line === deal.address) ?? null;
  const provider = property ? providerFor(property, providers) : null;
  const who = firstNameOf(applicant);
  const oldAt = deal.viewing_at;

  const save = () => {
    const base = { applicant, deal, allDeals: deals, property };
    if (mode === 'move') {
      const newAt = new Date(when).toISOString();
      move.mutate({ ...base, to: 'viewing', viewingAt: newAt, activityBody: `Viewing at ${deal.address} moved from ${slotWords(oldAt)} to ${slotWords(newAt)}` }, {
        onSuccess: () => setDone({ mode, oldAt, newAt }), onError: (e) => toast((e as Error).message, 'danger'),
      });
    } else {
      const body = `Viewing at ${deal.address} on ${slotWords(oldAt)} cancelled${stillKeen ? ', still interested' : `: ${reason}`}`;
      move.mutate({ ...base, to: stillKeen ? 'interested' : 'fell_through', reason: stillKeen ? null : reason, activityBody: body }, {
        onSuccess: () => setDone({ mode, oldAt, newAt: null }), onError: (e) => toast((e as Error).message, 'danger'),
      });
    }
  };

  const s = activeSettings();
  const clientText = done && viewingMessage(done.mode === 'move' ? s.whatsappViewingMoved : s.whatsappViewingCancelled, {
    clientName: applicant.full_name, address: deal.address, when: done.newAt ? viewingWords(done.newAt) : undefined, oldWhen: viewingWords(done.oldAt), myName,
  });
  const providerText = done && provider && requestMessage({
    type: done.mode === 'move' ? 'reschedule' : 'cancel', provider, property: { address_line: deal.address, rent_pcm: property?.rent_pcm ?? null, rent_text: property?.rent_text ?? null },
    clients: [applicant], myName, oldTime: done.oldAt, newTime: done.newAt,
  });
  const word = done?.mode === 'move' ? 'moved' : 'cancelled';
  const clientNumber = waNumber(applicant.phone);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(42,40,36,0.35)] backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Change the viewing at ${deal.address}`} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-[var(--shadow-pop)] sm:max-w-[520px] sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] font-semibold text-[var(--ink)]">{done ? `Viewing ${word}` : 'Move or cancel the viewing'}</div>
            <div className="truncate text-[14px] text-[var(--ink-muted)]">{shortAddress(deal.address)} · {applicant.full_name} · {slotWords(oldAt)}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {!done ? (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="radiogroup" aria-label="What happened">
                {([['move', 'Move it'], ['cancel', 'Cancel it']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                    className={`rounded-md px-2 py-2 text-[14px] font-medium ${mode === k ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)]'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'move' ? (
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">
                  New time
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                    className="h-11 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]" />
                </label>
              ) : (
                <div className="flex flex-col gap-2 text-[14px] text-[var(--ink)]">
                  <label className="flex items-center gap-2"><input type="radio" checked={stillKeen} onChange={() => setStillKeen(true)} className="accent-[var(--accent)]" />{who} still wants it: rebook later</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={!stillKeen} onChange={() => setStillKeen(false)} className="accent-[var(--accent)]" />It is not going ahead</label>
                  {!stillKeen && (
                    <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Why"
                      className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]">
                      {FELL_THROUGH_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </div>
              )}
              <p className="m-0 text-[12px] text-[var(--ink-muted)]">Next you can tell {who}{provider ? ` and ${provider.tag}` : ''} on WhatsApp, with the wording from Team settings.</p>
            </>
          ) : (
            <>
              <p className="m-0 text-[14px] text-[var(--ink)]">Saved on {who}'s Progress. Now let them know:</p>
              <Message title={`To ${who}`} text={clientText ?? ''} href={waLink(clientNumber, clientText ?? '')}
                why={clientNumber ? null : `No mobile number saved for ${who}: WhatsApp will ask who to send it to`}
                onSend={() => note.mutate({ applicantId: applicant.id, body: `Told ${who} the viewing at ${shortAddress(deal.address)} ${word}` })} />
              {provider ? (
                <Message title={`To ${provider.tag}${provider.contact_first_name ? ` (${provider.contact_first_name})` : ''}`} text={providerText ?? ''}
                  href={provider.whatsapp ? waLink(provider.whatsapp, providerText ?? '') : null}
                  why={provider.whatsapp ? null : `${provider.tag} has no WhatsApp number in Team settings`}
                  onSend={() => note.mutate({ applicantId: applicant.id, body: `Told ${provider.tag} the viewing at ${shortAddress(deal.address)} ${word}` })} />
              ) : (
                <p className="m-0 text-[13px] text-[var(--ink-muted)]">No provider is set for this property, so there is no one else to tell.</p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] px-5 py-3">
          {!done ? (
            <>
              <Button onClick={onClose}>Keep it as it is</Button>
              <Button variant="primary" disabled={move.isPending || (mode === 'move' && !when)} onClick={save}>
                {mode === 'move' ? 'Save the new time' : 'Cancel the viewing'}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ title, text, href, why, onSend }: { title: string; text: string; href: string | null; why: string | null; onSend: () => void }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--ink-muted)]">{title}</span>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" onClick={onSend} title={why ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-strong)]">
            <Icon name="chat" size={14} /> Open in WhatsApp
          </a>
        ) : (
          <span className="text-[12px] text-[var(--note-fg)]">{why}</span>
        )}
      </div>
      <div className="whitespace-pre-wrap rounded-lg rounded-tr-none bg-[var(--accent-soft)] p-3 text-[14px] leading-relaxed text-[var(--ink)]">{text}</div>
    </section>
  );
}

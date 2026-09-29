import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import {
  fetchDeals, useAddDeals, useMoveDeal, usePeople, useProperties, useProviders, useRequests, useUpdateRequest,
} from '../../lib/hooks';
import { awaitingProviders, REQUEST_LABEL, requestMessage, slotWords } from '../../lib/requests';
import { addDays } from '../../lib/calls';
import { timeAgo } from '../../lib/format';
import { shortAddress } from '../../lib/progress';
import { waLink } from '../../lib/whatsapp';
import type { Applicant, Provider, ProviderRequest } from '../../lib/types';

/** "2026-10-02T14:00" for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Home: requests still waiting on a provider, the ones due a chase first. */
export function AwaitingProviders({ applicants }: { applicants: Applicant[] }) {
  const { requests, ready } = useRequests();
  const { providers } = useProviders();
  const [all, setAll] = useState(false);
  const list = awaitingProviders(requests);
  if (!ready || list.length === 0) return null;
  const due = list.filter((x) => x.overdue).length;
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const shown = all ? list : list.slice(0, 6);

  return (
    <Card>
      <CardHeader icon="send" title="Awaiting providers" sub={`${list.length} open${due ? ` · ${due} to chase` : ''}`} help="requests" />
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
        {shown.map(({ request, overdue }) => (
          <AwaitingRow key={request.id} request={request} overdue={overdue}
            provider={providers.find((p) => p.id === request.provider_id) ?? null}
            clients={request.client_ids.map((id) => byId.get(id)).filter((a): a is Applicant => !!a)} />
        ))}
      </ul>
      {list.length > 6 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="px-5 py-3 text-left text-[13px] text-[var(--link)] hover:underline">
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </Card>
  );
}

function AwaitingRow({ request, overdue, provider, clients }: { request: ProviderRequest; overdue: boolean; provider: Provider | null; clients: Applicant[] }) {
  const update = useUpdateRequest();
  const addDeals = useAddDeals();
  const moveDeal = useMoveDeal();
  const qc = useQueryClient();
  const { data: properties = [] } = useProperties();
  const { myName } = usePeople();
  const { toast } = useToast();
  const [mode, setMode] = useState<null | 'confirm' | 'decline'>(null);
  const [slot, setSlot] = useState(request.slots[0] ? toLocalInput(request.slots[0]) : `${addDays(1)}T11:00`);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const tag = provider?.tag ?? 'the provider';
  const short = shortAddress(request.property_address);
  const names = clients.map((c) => c.full_name.split(' ')[0]).join(', ');
  const chase = provider?.whatsapp
    ? waLink(provider.whatsapp, requestMessage({ type: 'chase', provider, property: { address_line: request.property_address, rent_pcm: null, rent_text: null }, clients: [], myName }))
    : null;

  const fail = (e: unknown) => toast((e as Error).message, 'danger');

  /** Confirmed: for a viewing, book it on each client's Progress (their stage and next step follow). */
  const confirm = async () => {
    setBusy(true);
    try {
      if (request.type === 'viewing') {
        const when = new Date(slot).toISOString();
        await update.mutateAsync({ request, tag, status: 'confirmed', note: `Viewing ${slotWords(when)}` });
        const property = properties.find((p) => p.id === request.property_id) ?? properties.find((p) => p.address_line === request.property_address) ?? null;
        try {
          for (const c of clients) {
            await addDeals.mutateAsync({ applicantId: c.id, properties: [{ id: property?.id, address_line: request.property_address }], status: 'interested', quiet: true });
          }
          const { deals } = await qc.fetchQuery({ queryKey: ['deals'], queryFn: fetchDeals, staleTime: 0 });
          for (const c of clients) {
            const deal = deals.find((d) => d.applicant_id === c.id && d.address === request.property_address);
            if (deal) await moveDeal.mutateAsync({ applicant: c, deal, to: 'viewing', viewingAt: when, allDeals: deals, property });
          }
          toast(`Viewing booked for ${names || 'the client'}: ${slotWords(when)}`, 'success');
        } catch {
          toast(`${tag} confirmed. Book the viewing on the client's page once progress tracking is set up (0009).`, 'success');
        }
      } else {
        await update.mutateAsync({ request, tag, status: 'confirmed', note: note.trim() || (request.type === 'availability' ? 'Still available' : 'Details received') });
        toast(`${tag} confirmed`, 'success');
      }
      setMode(null);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const decline = () => update.mutate({ request, tag, status: 'declined', note: note.trim() || null }, {
    onSuccess: () => { toast(`${tag} said no. Noted on ${names || 'the request'}.`, 'success'); setMode(null); }, onError: fail,
  });
  const other = (v: string) => {
    if (v === 'no_reply' || v === 'cancelled') update.mutate({ request, tag, status: v }, { onSuccess: () => toast(v === 'no_reply' ? 'Marked as no reply' : 'Request cancelled', 'success'), onError: fail });
  };

  return (
    <li className="flex flex-col gap-2 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {overdue ? (
          <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>Chase due</span>
        ) : (
          <span className="text-[12px] text-[var(--ink-muted)]">Sent {timeAgo(request.sent_at)}</span>
        )}
        <span className="text-[15px] font-medium text-[var(--ink)]">{REQUEST_LABEL[request.type].done} · {tag}</span>
      </div>
      <div className="text-[13px] text-[var(--ink-muted)]">
        {short}
        {clients.length > 0 && <> · {clients.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Link to={`/applicants/${c.id}`} className="text-[var(--ink)] hover:underline">{c.full_name.split(' ')[0]}</Link></span>)}</>}
        {request.slots.length > 0 && <> · offered {request.slots.map(slotWords).join(', ')}</>}
      </div>

      {mode === null && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setMode('confirm')}>
            <Icon name="check" size={14} />{request.type === 'viewing' ? 'Confirmed: book it' : 'Confirmed'}
          </Button>
          <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setMode('decline')}>Declined</Button>
          {chase ? (
            <a href={chase} target="_blank" rel="noreferrer" onClick={() => update.mutate({ request, tag, chased: true })}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent-ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
              <Icon name="chat" size={14} /> Chase
            </a>
          ) : (
            <span className="text-[12px] text-[var(--ink-muted)]" title={`${tag} has no WhatsApp number`}>No number to chase</span>
          )}
          <select value="" onChange={(e) => other(e.target.value)} aria-label="More"
            className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink-muted)]">
            <option value="">More…</option>
            <option value="no_reply">No reply</option>
            <option value="cancelled">Cancel the request</option>
          </select>
        </div>
      )}

      {mode === 'confirm' && (
        <div className="flex flex-col gap-2 rounded-lg bg-[var(--surface-2)] p-3 text-[14px]">
          {request.type === 'viewing' ? (
            <>
              <span className="font-medium text-[var(--ink)]">Which time did {tag} confirm?</span>
              {request.slots.map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input type="radio" name={`slot-${request.id}`} checked={slot === toLocalInput(s)} onChange={() => setSlot(toLocalInput(s))} className="accent-[var(--accent)]" />
                  {slotWords(s)}
                </label>
              ))}
              <label className="flex flex-wrap items-center gap-2">
                <span>{request.slots.length ? 'Or another time' : 'Time'}</span>
                <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)}
                  className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]" />
              </label>
            </>
          ) : (
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={request.type === 'availability' ? 'Note, e.g. available from 1 Oct' : 'Note (optional)'}
              className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]" />
          )}
          <div className="flex gap-2">
            <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" disabled={busy || (request.type === 'viewing' && !slot)} onClick={() => void confirm()}>
              {request.type === 'viewing' ? `Book the viewing${clients.length ? ` for ${names}` : ''}` : 'Mark as confirmed'}
            </Button>
            <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-2)] p-3 text-[14px]">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? e.g. let already, no UC" aria-label="Why they said no"
            className="h-9 min-w-[200px] flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]" />
          <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={update.isPending} onClick={decline}>Mark as declined</Button>
          <Button variant="ghost" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      )}
    </li>
  );
}

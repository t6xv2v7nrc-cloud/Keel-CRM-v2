import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Help, Icon, useToast } from '../../components/ui';
import { useApplicants, useCreateRequest, usePeople, useProviders, useRequests } from '../../lib/hooks';
import { matchesForProperty } from '../../lib/propertyMatch';
import type { Strength } from '../../lib/propertyMatch';
import {
  firstNameOf, needsConsent, propertyProblems, providerFor, REQUEST_LABEL, REQUEST_TYPES, requestMessage, ruleProblems,
} from '../../lib/requests';
import { isActive } from '../../lib/search';
import { timeAgo } from '../../lib/format';
import { addDays } from '../../lib/calls';
import { waLink } from '../../lib/whatsapp';
import type { Applicant, Property, Provider, ProviderRequest, RequestType } from '../../lib/types';

// ── Opening the sheet from anywhere ────────────────────────────────

interface OpenDetail { property: Property; clientIds?: string[] }
const EVENT = 'keel:request';

/** Open the request sheet for a property, optionally with clients already picked. */
const openRequest = (detail: OpenDetail) => window.dispatchEvent(new CustomEvent<OpenDetail>(EVENT, { detail }));

/** Mounted once in the app shell. */
export function RequestSheetHost() {
  const [open, setOpen] = useState<OpenDetail | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<OpenDetail>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!open) return null;
  return <RequestSheet key={`${open.property.id}|${(open.clientIds ?? []).join(',')}`} {...open} onClose={() => setOpen(null)} />;
}

/** "Request" button for a property card or a client's suitable property. */
export function RequestButton({ property, client, compact = false }: { property: Property; client?: Pick<Applicant, 'id' | 'full_name'>; compact?: boolean }) {
  const { ready } = useProviders();
  if (!ready) return null;
  const title = client ? `Request for ${firstNameOf(client)}: availability, a viewing or their details` : 'Ask the provider: availability, a viewing or client details';
  return (
    <button type="button" onClick={() => openRequest({ property, clientIds: client ? [client.id] : undefined })} title={title} aria-label={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--line-strong)] text-[13px] font-medium text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] ${
        compact ? 'h-8 px-2' : 'min-h-[36px] px-3'}`}>
      <Icon name="send" size={15} />
      <span className={compact ? 'hidden sm:inline' : ''}>{client && !compact ? `Request for ${firstNameOf(client)}` : 'Request'}</span>
    </button>
  );
}

/** "Viewing requested · ZUB · 2h ago" */
export function RequestChip({ request, providers }: { request: ProviderRequest; providers: Provider[] }) {
  const tag = providers.find((p) => p.id === request.provider_id)?.tag ?? 'provider';
  const due = request.follow_up_at && new Date(request.follow_up_at) <= new Date();
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-medium ${
      due ? 'bg-[var(--note-bg)] text-[var(--note-fg)]' : 'bg-[var(--chip-bg)] text-[var(--chip-fg)]'}`}
      title={`${request.property_address}${due ? '. Chase due' : ''}`}>
      <Icon name="send" size={11} /> {REQUEST_LABEL[request.type].done} · {tag} · {timeAgo(request.sent_at)}
    </span>
  );
}

// ── The sheet ──────────────────────────────────────────────────────

const STRENGTH_WORD: Record<Strength, string> = { strong: 'Strong', good: 'Good', possible: 'Possible' };
/** "YYYY-MM-DDTHH:mm" for a datetime-local input, n days from now at the given hour. */
const slotAt = (days: number, hour: number) => `${addDays(days)}T${String(hour).padStart(2, '0')}:00`;

function RequestSheet({ property, clientIds = [], onClose }: OpenDetail & { onClose: () => void }) {
  const { providers, ready } = useProviders();
  const { requests } = useRequests();
  const { data: applicants = [] } = useApplicants();
  const { myName } = usePeople();
  const create = useCreateRequest();
  const { toast } = useToast();

  const provider = providerFor(property, providers);
  const [type, setType] = useState<RequestType>(clientIds.length ? 'viewing' : 'availability');
  const [picked, setPicked] = useState<string[]>(clientIds);
  const [search, setSearch] = useState('');
  const [slots, setSlots] = useState<string[]>([slotAt(1, 11)]);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byId = useMemo(() => new Map(applicants.map((a) => [a.id, a])), [applicants]);
  const clients = picked.map((id) => byId.get(id)).filter((a): a is Applicant => !!a);
  const suggestions = useMemo(() => {
    const matches = matchesForProperty(property, applicants);
    const strength = new Map(matches.map((m) => [m.applicant.id, m.strength]));
    const q = search.trim().toLowerCase();
    const pool = applicants.filter(isActive).filter((a) => !picked.includes(a.id)).filter((a) => !q || a.full_name.toLowerCase().includes(q));
    const rank = (id: string) => ({ strong: 0, good: 1, possible: 2 } as const)[strength.get(id) ?? 'possible'] + (strength.has(id) ? 0 : 1);
    return pool
      .sort((a, b) => rank(a.id) - rank(b.id) || a.full_name.localeCompare(b.full_name))
      .slice(0, q ? 8 : 5)
      .map((a) => ({ a, strength: strength.get(a.id) ?? null }));
  }, [applicants, property, picked, search]);

  const liveSlots = type === 'viewing' ? slots.filter(Boolean).map((s) => new Date(s).toISOString()) : [];
  const problemsOf: Record<string, string[]> = { '': provider ? propertyProblems(provider, property) : [] };
  if (provider) for (const c of clients) problemsOf[c.id] = ruleProblems(provider, c);
  const problems = clients.flatMap((c) => problemsOf[c.id] ?? []);
  const propertyNotes = problemsOf[''];
  const warnings = [...propertyNotes, ...problems];
  const noConsent = needsConsent(type) ? clients.filter((c) => !c.share_with_landlords) : [];
  const message = provider ? requestMessage({ type, provider, property, clients, slots: liveSlots, myName }) : '';
  const open = requests.filter((r) => r.status === 'sent' && (r.property_id === property.id || r.property_address === property.address_line));

  const blocked = !ready ? 'Providers need a one-off database update first.'
    : !provider ? 'No provider for this property yet.'
    : !provider.active ? `${provider.tag} is switched off in Team settings.`
    : !provider.whatsapp ? `${provider.tag} has no WhatsApp number. Add it in Team settings, Providers.`
    : type !== 'availability' && clients.length === 0 ? 'Pick at least one client.'
    : noConsent.length ? `${noConsent.map(firstNameOf).join(', ')} ${noConsent.length === 1 ? 'has' : 'have'} not agreed to share details with landlords.`
    : warnings.length && !(override && reason.trim()) ? 'A client does not meet this provider\'s rules. Tick Send anyway and give a reason.'
    : null;

  const send = () => {
    if (blocked || !provider) return;
    create.mutate({
      provider, property, clients, type, message, slots: liveSlots,
      overrideReason: warnings.length ? reason.trim() : null, problemsOf,
    }, {
      onSuccess: () => { toast(`Logged. Keel will remind you to chase ${provider.tag} tomorrow if they have not replied.`, 'success'); onClose(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(42,40,36,0.35)] backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Request for ${property.address_line}`} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-[var(--shadow-pop)] sm:max-w-[560px] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[18px] font-semibold text-[var(--ink)]">Request <Help topic="requests" /></div>
            <div className="truncate text-[14px] text-[var(--ink-muted)]">{property.address_line}</div>
            {provider && (
              <div className="mt-1 text-[13px] text-[var(--ink)]">
                To <strong>{provider.tag}</strong>{provider.contact_first_name ? ` · ${provider.contact_first_name}` : ''}{provider.name !== provider.tag ? ` (${provider.name})` : ''}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)]">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {!ready && <Note>Requests need a one-off database update: run <code className="font-mono">supabase/migrations/0010_providers_requests.sql</code> in the Supabase SQL Editor.</Note>}
          {ready && !provider && (
            <Note>
              No provider for this property{property.source_tag ? ` (its list is tagged ${property.source_tag})` : ''}.{' '}
              <Link to="/settings?tab=providers" onClick={onClose} className="underline">Add one in Team settings, Providers</Link>.
            </Note>
          )}
          {open.length > 0 && (
            <p className="m-0 text-[13px] text-[var(--ink-muted)]">
              Already waiting on {open.length} {open.length === 1 ? 'request' : 'requests'} for this property ({open.map((r) => `${REQUEST_LABEL[r.type].done.toLowerCase()} ${timeAgo(r.sent_at)}`).join(', ')}).
            </p>
          )}

          {/* Type */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="radiogroup" aria-label="Request type">
            {REQUEST_TYPES.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={type === t.key} onClick={() => setType(t.key)}
                className={`rounded-md px-2 py-2 text-[13px] font-medium leading-tight transition-colors ${
                  type === t.key ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Clients */}
          <section className="flex flex-col gap-2">
            <div className="text-[13px] font-medium text-[var(--ink-muted)]">
              {type === 'availability' ? 'Clients (optional: only their household and benefits are shared)' : 'Clients'}
            </div>
            {clients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {clients.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-[14px] text-[var(--accent-ink)]">
                    {c.full_name}
                    <button type="button" onClick={() => setPicked((ps) => ps.filter((x) => x !== c.id))} aria-label={`Remove ${c.full_name}`}
                      className="grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--surface)]"><Icon name="x" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Add a client: type a name" aria-label="Add a client"
              className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <ul className="m-0 flex list-none flex-col p-0">
              {suggestions.map(({ a, strength }) => (
                <li key={a.id}>
                  <button type="button" onClick={() => { setPicked((ps) => [...ps, a.id]); setSearch(''); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[14px] hover:bg-[var(--surface-2)]">
                    <Icon name="plus" size={14} className="text-[var(--accent)]" />
                    <span className="flex-1 text-[var(--ink)]">{a.full_name}</span>
                    {strength && <span className="text-[12px] text-[var(--ink-muted)]">{STRENGTH_WORD[strength]} match</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Rules and consent */}
          {warnings.length > 0 && (
            <section className="flex flex-col gap-2 rounded-lg bg-[var(--note-bg)] p-3 text-[14px] text-[var(--note-fg)]">
              {warnings.map((w) => <div key={w} className="flex gap-2"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{w}</div>)}
              <label className="mt-1 flex items-center gap-2 text-[var(--ink)]">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                Send anyway
              </label>
              {override && (
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? e.g. Zubair said he would consider UC" aria-label="Reason for sending anyway"
                  className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
              )}
            </section>
          )}
          {noConsent.length > 0 && (
            <Note>
              Sending details needs the client's agreement.{' '}
              {noConsent.map((c, i) => (
                <span key={c.id}>{i ? ', ' : ''}<Link to={`/applicants/${c.id}#details`} onClick={onClose} className="underline">{firstNameOf(c)}</Link></span>
              ))}{' '}
              {noConsent.length === 1 ? 'has' : 'have'} not agreed yet: set OK to share with landlords in their details once they say yes.
            </Note>
          )}

          {/* Viewing times */}
          {type === 'viewing' && (
            <section className="flex flex-col gap-2">
              <div className="text-[13px] font-medium text-[var(--ink-muted)]">Times you can offer (up to 3)</div>
              {slots.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="datetime-local" value={s} onChange={(e) => setSlots((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    aria-label={`Time ${i + 1}`}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]" />
                  <button type="button" onClick={() => setSlots((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove time ${i + 1}`}
                    className="grid h-10 w-10 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"><Icon name="x" size={16} /></button>
                </div>
              ))}
              {slots.length < 3 && (
                <button type="button" onClick={() => setSlots((xs) => [...xs, slotAt(xs.length + 1, 14)])} className="self-start text-[14px] text-[var(--link)] hover:underline">
                  Add {slots.length ? 'another' : 'a'} time
                </button>
              )}
            </section>
          )}

          {/* Preview */}
          {provider && (
            <section className="flex flex-col gap-2">
              <div className="text-[13px] font-medium text-[var(--ink-muted)]">Message</div>
              <div className="whitespace-pre-wrap rounded-lg rounded-tr-none bg-[var(--accent-soft)] p-3 text-[14px] leading-relaxed text-[var(--ink)]">{message}</div>
              <p className="m-0 text-[12px] text-[var(--ink-muted)]">First names, household and benefits only. The wording is in Team settings.</p>
            </section>
          )}
        </div>

        {/* Send */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] px-5 py-3">
          {blocked && <p className="m-0 w-full text-[13px] text-[var(--note-fg)]">{blocked}</p>}
          <Button onClick={onClose}>Cancel</Button>
          {blocked || !provider?.whatsapp ? (
            <Button variant="primary" disabled title={blocked ?? ''}><Icon name="chat" size={16} />Open in WhatsApp</Button>
          ) : (
            <a href={waLink(provider.whatsapp, message)} target="_blank" rel="noreferrer" onClick={send}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[15px] font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-strong)]">
              <Icon name="chat" size={16} />Open in WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div role="note" className="rounded-lg bg-[var(--note-bg)] p-3 text-[14px] text-[var(--note-fg)]">{children}</div>;
}

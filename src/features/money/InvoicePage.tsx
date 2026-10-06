import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Empty, Help, Icon, useToast } from '../../components/ui';
import {
  useApplicants, useClientNote, usePeople, useProviders, useRaiseInvoice, useReceivables, useSetBillTo, useSettings,
} from '../../lib/hooks';
import { todayIso } from '../../lib/calls';
import { fullDate, moneyExact } from '../../lib/format';
import { defaultBillTo, invoiceEmail, invoiceFor, invoiceMessage, missingDetails } from '../../lib/invoice';
import { KIND_LABEL } from '../../lib/money';
import { waLink } from '../../lib/whatsapp';
import { FinancesNeedsUpdate, MoneyNeedsUpdate } from './Money';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const linkButton = 'inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]';

/** An invoice for one letting fee or incentive: raise it (it gets the next number), then print it, save it as a PDF, or send it. */
export function InvoicePage() {
  const { id } = useParams();
  const { receivables, ready, full } = useReceivables();
  const { data: applicants = [] } = useApplicants();
  const { providers, isLoading: providersLoading } = useProviders();
  const { settings } = useSettings();
  const people = usePeople();
  const raise = useRaiseInvoice();
  const saveBillTo = useSetBillTo();
  const note = useClientNote();
  const { toast } = useToast();
  const r = receivables.find((x) => x.id === id) ?? null;
  const client = r ? applicants.find((a) => a.id === r.applicant_id) ?? null : null;
  const provider = r ? providers.find((p) => p.id === r.provider_id) ?? null : null;
  // what has been typed; until then, who it was last addressed to (or the provider's details)
  const [typed, setBillTo] = useState<string | null>(null);

  if (!ready) return <div className="mx-auto max-w-[800px] p-4 sm:p-6"><MoneyNeedsUpdate /></div>;
  if (!r) {
    return (
      <div className="mx-auto max-w-[800px] p-4 sm:p-6">
        <Card><Empty icon="file" title="Not found">That fee or incentive is not on Finances any more. <Link to="/finances" className="text-[var(--link)] hover:underline">Back to Finances</Link></Empty></Card>
      </div>
    );
  }

  const s = settings.invoice;
  const savedBillTo = r.bill_to ?? (providersLoading ? '' : defaultBillTo(r, provider));
  const billTo = typed ?? savedBillTo;
  const inv = invoiceFor(r, { client, settings: s, billTo, today: todayIso() });
  const missing = missingDetails(s);
  const raised = Boolean(r.invoice_number);
  const billDirty = billTo.trim() !== savedBillTo.trim();
  const email = provider?.email ?? billTo.split('\n').map((l) => l.trim()).find((l) => /^\S+@\S+\.\S+$/.test(l)) ?? null;
  const wa = raised && provider?.whatsapp ? waLink(provider.whatsapp, invoiceMessage(r, { provider, client, myName: people.myName })) : null;
  const mail = raised && email ? invoiceEmail(r, { client, myName: people.myName }) : null;
  const sent = (how: string) => note.mutate({ applicantId: r.applicant_id, kind: 'money', body: `Sent invoice ${r.invoice_number} to ${r.payer} ${how}` });

  const onRaise = () => raise.mutate({ r, billTo, prefix: s.prefix, startAt: s.startAt }, {
    onSuccess: (n) => toast(`Invoice ${n} raised. Print it or save it as a PDF to send.`, 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4 p-4 pb-24 sm:p-6 print:p-0">
      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/finances" className="inline-flex items-center gap-1 text-[14px] text-[var(--link)] hover:underline"><Icon name="chevronLeft" size={15} />Finances</Link>
          <span className="text-[14px] text-[var(--ink-muted)]">{KIND_LABEL[r.kind]} from {r.payer}{client ? ` for ${client.full_name}` : ''}</span>
          <Help topic="invoices" />
        </div>
        {!full && <FinancesNeedsUpdate />}
        {missing.length > 0 && (
          <div role="note" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-3 text-[14px] text-[var(--note-fg)]">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <div>
              Keel&apos;s {missing.join(' and ')} {missing.length === 1 ? 'is' : 'are'} not on invoices yet.{' '}
              {people.canEditTeam
                ? <Link to="/settings?tab=team#invoices" className="font-medium underline">Add them in Team settings, Invoices</Link>
                : `Ask ${people.ownerName ?? 'the owner'} to add them in Team settings, Invoices.`}
            </div>
          </div>
        )}
        {r.amount == null && (
          <p className="m-0 text-[14px] text-[var(--note-fg)]">Set the amount on Finances (the pencil next to it) before raising an invoice.</p>
        )}

        <Card className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">Bill to (one line each: name, address, email)</span>
            <textarea rows={3} value={billTo} onChange={(e) => setBillTo(e.target.value)} placeholder={r.payer === 'Landlord' ? 'The landlord\'s name and address' : r.payer}
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {!raised ? (
              <Button variant="primary" disabled={!full || r.amount == null || raise.isPending} onClick={onRaise}>
                <Icon name="file" size={16} />{raise.isPending ? 'Raising…' : 'Raise invoice'}
              </Button>
            ) : (
              <>
                <Button variant="primary" onClick={() => window.print()}><Icon name="printer" size={16} />Print or save as PDF</Button>
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" onClick={() => sent('on WhatsApp')} className={linkButton}>
                    <Icon name="chat" size={14} />Send on WhatsApp
                  </a>
                )}
                {mail && email && (
                  <a href={`mailto:${email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`} onClick={() => sent('by email')} className={linkButton}>
                    <Icon name="mail" size={14} />Email it
                  </a>
                )}
                {billDirty && (
                  <Button className={small} disabled={saveBillTo.isPending} onClick={() => saveBillTo.mutate({ r, billTo }, {
                    onSuccess: () => toast('Saved who the invoice is to', 'success'), onError: (e) => toast((e as Error).message, 'danger'),
                  })}>Save bill to</Button>
                )}
              </>
            )}
            <span className="text-[13px] text-[var(--ink-muted)]">
              {raised ? `Raised ${r.invoiced_on ? fullDate(r.invoiced_on) : ''}. Choose Save as PDF in the print window to attach it to an email or WhatsApp.`
                : 'Raising gives it the next invoice number and today\'s date.'}
            </span>
          </div>
        </Card>
      </div>

      <article className="invoice-sheet w-full rounded-lg border border-[var(--line)] p-5 shadow-[var(--shadow-card)] sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid h-6 w-6 shrink-0 rotate-45 place-items-center rounded-[5px] bg-[var(--accent)]"><span className="h-2 w-2 rounded-[2px] bg-[var(--surface)]" /></span>
              <span className="font-[var(--font-display)] text-[20px] font-bold text-[var(--ink)]">{inv.from[0] ?? 'Keel Lettings'}</span>
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-[var(--ink-muted)]">{inv.from.slice(1).map((l, i) => <div key={i}>{l}</div>)}</div>
          </div>
          <div className="sm:text-right">
            <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Invoice</h1>
            <div className="font-mono text-[15px] text-[var(--ink)]">{inv.number ?? 'Draft, not raised yet'}</div>
          </div>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Bill to</div>
            <div className="mt-1 text-[14px] leading-relaxed text-[var(--ink)]">{inv.billTo.map((l, i) => <div key={i} className="break-words">{l}</div>)}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Invoice date</div>
            <div className="mt-1 text-[14px] text-[var(--ink)]">{fullDate(inv.date)}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Due</div>
            <div className="mt-1 text-[14px] text-[var(--ink)]">{inv.due ?? 'On receipt'}</div>
          </div>
        </section>

        <table className="mt-8 w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b-2 border-[var(--line-strong)] text-left text-[12px] uppercase tracking-wide text-[var(--ink-muted)]">
              <th className="py-2 pr-3 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-[var(--line)] align-top">
                <td className="py-3 pr-3">
                  <div className="font-medium text-[var(--ink)]">{l.description}</div>
                  {l.detail.map((x, k) => <div key={k} className="text-[13px] text-[var(--ink-muted)]">{x}</div>)}
                </td>
                <td className="whitespace-nowrap py-3 text-right font-mono text-[var(--ink)]">{moneyExact(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {s.vatRegistered && (
              <>
                <tr><td className="pt-3 pr-3 text-right text-[var(--ink-muted)]">Subtotal</td><td className="pt-3 text-right font-mono">{moneyExact(inv.net)}</td></tr>
                <tr><td className="pt-1 pr-3 text-right text-[var(--ink-muted)]">VAT at 20%</td><td className="pt-1 text-right font-mono">{moneyExact(inv.vat)}</td></tr>
              </>
            )}
            <tr>
              <td className="pt-3 pr-3 text-right text-[15px] font-semibold text-[var(--ink)]">Total due</td>
              <td className="whitespace-nowrap pt-3 text-right font-mono text-[18px] font-bold text-[var(--ink)]">{r.amount != null ? moneyExact(inv.total) : '·'}</td>
            </tr>
          </tfoot>
        </table>

        {inv.payment.length > 0 && (
          <section className="mt-8 rounded-md bg-[var(--surface-2)] p-4 text-[14px] leading-relaxed text-[var(--ink)]">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Payment</div>
            {inv.payment.map((l, i) => <div key={i}>{l}</div>)}
          </section>
        )}

        {(inv.companyNumber || inv.vatNumber) && (
          <footer className="mt-8 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--ink-muted)]">
            {[inv.from[0], inv.companyNumber ? `Company number ${inv.companyNumber}` : null, inv.vatNumber ? `VAT number ${inv.vatNumber}` : null].filter(Boolean).join(' · ')}
          </footer>
        )}
      </article>
    </div>
  );
}

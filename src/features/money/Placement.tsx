import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon, UpdateNote, useToast } from '../../components/ui';
import { useSavePlacement } from '../../lib/hooks';
import { money, shortDate } from '../../lib/format';
import { shortAddress } from '../../lib/progress';
import { FEE_TYPE_WORDS, INVOICER_WORDS, moneyLine, ROUTE_WORDS } from '../../lib/placements';
import type { FeeType, Invoicer, Placement, PlacementFlag, PlacementRoute, PlacementView } from '../../lib/placements';
import type { Provider } from '../../lib/types';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const TONE: Record<PlacementFlag['tone'], { bg: string; fg: string; icon: 'x' | 'alert' | 'clock' }> = {
  red: { bg: 'var(--danger-soft)', fg: 'var(--danger)', icon: 'x' },
  amber: { bg: 'var(--note-bg)', fg: 'var(--note-fg)', icon: 'alert' },
  grey: { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)', icon: 'clock' },
};

export function PlacementFlags({ flags }: { flags: PlacementFlag[] }) {
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span key={f.key} className="inline-flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: TONE[f.tone].bg, color: TONE[f.tone].fg }}>
          <Icon name={TONE[f.tone].icon} size={12} className="mt-[2px] shrink-0" />{f.words}
        </span>
      ))}
    </div>
  );
}

/** One placement: who pays whom, the split, Keel's share, and the money as Finances holds it. Edit fills in the details. */
export function PlacementPanel({ view, full, providers, clientName, council }: { view: PlacementView; full: boolean; providers: Provider[]; clientName?: string; council?: string | null }) {
  const [editing, setEditing] = useState(false);
  const p = view.placement;
  const lines = [
    moneyLine(view.incentive, `incentive from ${view.incentive?.payer ?? 'the council'}`),
    moneyLine(view.fee, `letting fee from ${view.fee?.payer ?? 'the provider'}`),
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[15px] font-semibold text-[var(--ink)]">
          {clientName ? <><Link to={`/applicants/${view.deal.applicant_id}`} className="hover:underline">{clientName}</Link> · </> : 'Placement · '}
          {shortAddress(view.deal.address)}
        </span>
        {view.deal.move_in_on && <span className="text-[13px] text-[var(--ink-muted)]">moved in {shortDate(view.deal.move_in_on)}</span>}
        {full && <Button className={`${small} ml-auto`} aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Icon name="pencil" size={14} />{p ? 'Edit' : 'Fill in'}</Button>}
      </div>
      <PlacementFlags flags={view.flags} />
      <dl className="m-0 grid gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-2">
        <Row k="Partner">{view.partner?.name ?? 'None'}</Row>
        <Row k="Route">{p?.route ? ROUTE_WORDS[p.route] : 'Not set'}</Row>
        <Row k="Keel is paid">{p?.fee_type ? FEE_TYPE_WORDS[p.fee_type] : 'Not set'}</Row>
        <Row k="Invoices the council">{p?.invoiced_by ? INVOICER_WORDS[p.invoiced_by] : 'Not set'}</Row>
        <Row k="Split in writing">
          {p?.split_agreed_in_writing ? (p.split_document_url ? <a href={p.split_document_url} target="_blank" rel="noreferrer" className="text-[var(--link)] hover:underline">Yes: open the agreement</a> : 'Yes, no link yet') : 'No'}
        </Row>
        <Row k="Keel's share">{p?.keel_share_pct != null ? `${p.keel_share_pct}%${view.keelShare != null ? `, ${money(view.keelShare)}` : ''}` : view.keelShare != null ? money(view.keelShare) : 'Not set'}</Row>
        <Row k="Renters' Rights sheet">{p?.renters_rights_sheet_on ? `Given ${shortDate(p.renters_rights_sheet_on)}` : 'Not recorded'}</Row>
        <Row k="Council">{p?.council ?? council ?? 'Not set'}</Row>
      </dl>
      <div className="text-[13px] text-[var(--ink-muted)]">
        {lines.length ? lines.join(' · ') : 'Nothing on Finances for this placement yet.'}
        {view.keelIncome != null && <span className="text-[var(--ink)]"> · Keel's income {money(view.keelIncome)}</span>}
      </div>
      {!full && <UpdateNote title="Who invoices and the split need a one-off database update." file="0021_placements.sql" />}
      {editing && <PlacementEditor view={view} providers={providers} council={council ?? null} onDone={() => setEditing(false)} />}
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div className="flex min-w-0 gap-1.5"><dt className="shrink-0 text-[var(--ink-muted)]">{k}:</dt><dd className="m-0 min-w-0 break-words text-[var(--ink)]">{children}</dd></div>;
}

function PlacementEditor({ view, providers, council, onDone }: { view: PlacementView; providers: Provider[]; council: string | null; onDone: () => void }) {
  const save = useSavePlacement();
  const { toast } = useToast();
  const p = view.placement;
  const [f, setF] = useState({
    route: (p?.route ?? '') as PlacementRoute | '', provider_id: p?.provider_id ?? '', fee_type: (p?.fee_type ?? '') as FeeType | '',
    invoiced_by: (p?.invoiced_by ?? '') as Invoicer | '', keel_share_pct: p?.keel_share_pct == null ? '' : String(p.keel_share_pct),
    split_agreed_in_writing: p?.split_agreed_in_writing ?? false, split_document_url: p?.split_document_url ?? '',
    renters_rights_sheet_on: p?.renters_rights_sheet_on ?? '', council: p?.council ?? council ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const urlOk = !f.split_document_url.trim() || /^https?:\/\/\S+$/.test(f.split_document_url.trim());
  const pct = f.keel_share_pct.trim() === '' ? null : Number(f.keel_share_pct);
  const pctOk = pct === null || (Number.isFinite(pct) && pct >= 0 && pct <= 100);
  const go = () => {
    const patch: Partial<Placement> = {
      route: f.route || null, provider_id: f.provider_id || null, fee_type: f.fee_type || null, invoiced_by: f.invoiced_by || null,
      keel_share_pct: pct, split_agreed_in_writing: f.split_agreed_in_writing, split_document_url: f.split_document_url.trim() || null,
      renters_rights_sheet_on: f.renters_rights_sheet_on || null, council: f.council.trim() || null,
    };
    if (p) for (const k of Object.keys(patch) as Array<keyof Placement>) if ((p[k] ?? null) === (patch[k] ?? null)) delete patch[k];
    if (p && Object.keys(patch).length === 0) { onDone(); return; }
    save.mutate({ deal: view.deal, before: p, patch }, {
      onSuccess: () => { toast('Placement saved', 'success'); onDone(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Partner">
          <select value={f.provider_id} onChange={(e) => set('provider_id', e.target.value)} className={box}>
            <option value="">None</option>
            {providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Route">
          <select value={f.route} onChange={(e) => set('route', e.target.value as PlacementRoute | '')} className={box}>
            <option value="">Not set</option>
            {(Object.keys(ROUTE_WORDS) as PlacementRoute[]).map((r) => <option key={r} value={r}>{ROUTE_WORDS[r]}</option>)}
          </select>
        </Field>
        <Field label="Keel is paid">
          <select value={f.fee_type} onChange={(e) => set('fee_type', e.target.value as FeeType | '')} className={box}>
            <option value="">Not set</option>
            {(Object.keys(FEE_TYPE_WORDS) as FeeType[]).map((r) => <option key={r} value={r}>{FEE_TYPE_WORDS[r]}</option>)}
          </select>
        </Field>
        <Field label="Who invoices the council" hint="The council pays whoever is on the paperwork">
          <select value={f.invoiced_by} onChange={(e) => set('invoiced_by', e.target.value as Invoicer | '')} className={box}>
            <option value="">Not set</option>
            {(Object.keys(INVOICER_WORDS) as Invoicer[]).map((r) => <option key={r} value={r}>{INVOICER_WORDS[r]}</option>)}
          </select>
        </Field>
        <Field label="Keel's share of the incentive (%)" hint={pctOk ? (pct !== null && view.incentive?.amount != null ? `${money(Math.round(view.incentive.amount * pct) / 100)} of ${money(view.incentive.amount)}` : undefined) : 'A number from 0 to 100'}>
          <input inputMode="decimal" value={f.keel_share_pct} onChange={(e) => set('keel_share_pct', e.target.value)} placeholder="e.g. 50" className={`${box} font-mono`} />
        </Field>
        <Field label="Renters' Rights information sheet given">
          <input type="date" value={f.renters_rights_sheet_on} onChange={(e) => set('renters_rights_sheet_on', e.target.value)} className={box} />
        </Field>
        <label className="flex items-center gap-2 text-[14px] text-[var(--ink)] sm:col-span-2">
          <input type="checkbox" checked={f.split_agreed_in_writing} onChange={(e) => set('split_agreed_in_writing', e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          The split is agreed in writing
        </label>
        <Field label="Link to the agreement" wide hint={urlOk ? 'A shared document or email link' : 'Paste the full link, starting https://'}>
          <input type="url" value={f.split_document_url} onChange={(e) => set('split_document_url', e.target.value)} placeholder="https://" className={box} />
        </Field>
        <Field label="Council"><input value={f.council} onChange={(e) => set('council', e.target.value)} className={box} /></Field>
      </div>
      <p className="m-0 text-[12px] text-[var(--ink-muted)]">Amounts, invoices and payments come from Finances: change them there, not here.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className={small} disabled={!urlOk || !pctOk || save.isPending} onClick={go}>{save.isPending ? 'Saving…' : 'Save the placement'}</Button>
        <Button className={small} onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function Field({ label, hint, wide = false, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

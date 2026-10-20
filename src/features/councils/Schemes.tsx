import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, Icon, UpdateNote, useToast } from '../../components/ui';
import { copyText } from '../../lib/clipboard';
import { money, shortDate } from '../../lib/format';
import { todayIso } from '../../lib/calls';
import { boroughOf, focusRank } from '../../lib/councils';
import type { CouncilScheme } from '../../lib/councils';
import { useCouncilSchemes, useSaveScheme, useSettings } from '../../lib/hooks';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';

/** Procurement and landlord schemes: register once per council. Focus boroughs first, then the wish-list, each shown even before it is set up. */
export function SchemesView() {
  const { schemes, ready } = useCouncilSchemes();
  const { settings } = useSettings();
  const [adding, setAdding] = useState<string | null>(null);
  const groups = useMemo(() => {
    const rank = (s: CouncilScheme) => focusRank(boroughOf({ council: s.council }));
    const sorted = [...schemes].sort((a, b) => rank(a) - rank(b) || a.council.localeCompare(b.council));
    const covered = new Set(schemes.map((s) => boroughOf({ council: s.council }) ?? s.council));
    const missing = [...settings.focusBoroughs, ...settings.wishlistBoroughs].filter((b) => !covered.has(b));
    return { sorted, missing };
  }, [schemes, settings.focusBoroughs, settings.wishlistBoroughs]);
  const registered = schemes.filter((s) => s.registered).length;

  if (!ready) return <UpdateNote title="Council schemes need a one-off database update." file="0020_council_contacts.sql" />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 flex-1 basis-[240px] text-[14px] text-[var(--ink-muted)]">
          {registered} of {schemes.length} {schemes.length === 1 ? 'scheme' : 'schemes'} registered. Register once per council; the route mailbox is where listings for that scheme go.
        </p>
        <Button className={small} onClick={() => setAdding('')}><Icon name="plus" size={14} />Add a scheme</Button>
      </div>
      {adding !== null && <SchemeEditor scheme={null} council={adding} onDone={() => setAdding(null)} />}
      {groups.missing.length > 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <div className="text-[14px] font-medium text-[var(--ink)]">Not set up yet</div>
          <div className="flex flex-wrap gap-1.5">
            {groups.missing.map((b) => (
              <button key={b} type="button" onClick={() => setAdding(b)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
                <Icon name="plus" size={12} />{focusRank(b) === 0 ? '★ ' : ''}{b}
              </button>
            ))}
          </div>
        </Card>
      )}
      {groups.sorted.map((s) => <SchemeCard key={s.id} s={s} />)}
    </div>
  );
}

function SchemeCard({ s }: { s: CouncilScheme }) {
  const save = useSaveScheme();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const focus = focusRank(boroughOf({ council: s.council })) === 0;
  const quick = (patch: Partial<CouncilScheme>, done: string) => save.mutate({ before: s, patch }, {
    onSuccess: () => toast(done, 'success'), onError: (e) => toast((e as Error).message, 'danger'),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-semibold text-[var(--ink)]">{focus ? '★ ' : ''}{s.council}</span>
            {s.scheme_name && <span className="text-[14px] text-[var(--ink-muted)]">{s.scheme_name}</span>}
            <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold"
              style={s.registered ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
              {s.registered ? `Registered${s.registered_on ? ` ${shortDate(s.registered_on)}` : ''}` : 'Not registered'}
            </span>
          </div>
          <dl className="m-0 mt-1 grid gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-2">
            <Row k="Route mailbox">{s.route_mailbox ? <span className="break-all">{s.route_mailbox}</span> : 'Not known'}</Row>
            <Row k="Most it pays">{s.max_incentive != null ? money(s.max_incentive) : 'Not known'}</Row>
            <Row k="Incentive terms">{s.incentive_terms || 'Not known'}</Row>
            <Row k="Documents needed">{s.documents_required || 'Not known'}</Row>
            <Row k="Last contact">{s.last_contact ? shortDate(s.last_contact) : 'None yet'}</Row>
            {s.notes && <Row k="Notes">{s.notes}</Row>}
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!s.registered && <Button busy={save.isPending} className={small} disabled={save.isPending} onClick={() => quick({ registered: true, registered_on: todayIso() }, `Registered with ${s.council}`)}>Mark as registered</Button>}
          <Button busy={save.isPending} className={small} disabled={save.isPending || s.last_contact === todayIso()} onClick={() => quick({ last_contact: todayIso() }, `${s.council}: contacted today`)}>Contacted today</Button>
          {s.route_mailbox && (
            <Button className={small} onClick={async () => { const ok = await copyText(s.route_mailbox!); toast(ok ? 'Mailbox copied' : 'Could not copy', ok ? 'success' : 'danger'); }}>
              <Icon name="mail" size={14} />Copy mailbox
            </Button>
          )}
          <Button className={small} aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Icon name="pencil" size={14} />Edit</Button>
        </div>
      </div>
      {editing && <div className="border-t border-[var(--line)] p-4"><SchemeEditor scheme={s} council={s.council} onDone={() => setEditing(false)} /></div>}
    </Card>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div className="flex min-w-0 gap-1.5"><dt className="shrink-0 text-[var(--ink-muted)]">{k}:</dt><dd className="m-0 min-w-0 text-[var(--ink)]">{children}</dd></div>;
}

function SchemeEditor({ scheme, council, onDone }: { scheme: CouncilScheme | null; council: string; onDone: () => void }) {
  const save = useSaveScheme();
  const { toast } = useToast();
  const [f, setF] = useState({
    council: scheme?.council ?? council, scheme_name: scheme?.scheme_name ?? '', route_mailbox: scheme?.route_mailbox ?? '',
    registered: scheme?.registered ?? false, registered_on: scheme?.registered_on ?? '', incentive_terms: scheme?.incentive_terms ?? '',
    max_incentive: scheme?.max_incentive == null ? '' : String(scheme.max_incentive), documents_required: scheme?.documents_required ?? '',
    last_contact: scheme?.last_contact ?? '', notes: scheme?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const mailboxOk = !f.route_mailbox.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.route_mailbox.trim());
  const go = () => {
    const max = f.max_incentive.trim() === '' ? null : Math.max(0, Number(f.max_incentive.replace(/[£,\s]/g, '')) || 0);
    const patch: Partial<CouncilScheme> = {
      council: f.council.trim(), scheme_name: f.scheme_name.trim() || null, route_mailbox: f.route_mailbox.trim() || null,
      registered: f.registered, registered_on: f.registered ? f.registered_on || todayIso() : null, incentive_terms: f.incentive_terms.trim() || null,
      max_incentive: max, documents_required: f.documents_required.trim() || null, last_contact: f.last_contact || null, notes: f.notes.trim() || null,
      // kept in step with the focus boroughs in Team settings
      focus_borough: focusRank(boroughOf({ council: f.council })) === 0,
    };
    if (scheme) for (const k of Object.keys(patch) as Array<keyof CouncilScheme>) if ((scheme[k] ?? null) === (patch[k] ?? null)) delete patch[k];
    if (scheme && Object.keys(patch).length === 0) { onDone(); return; }
    save.mutate({ before: scheme, patch }, {
      onSuccess: () => { toast(scheme ? 'Saved' : `${f.council.trim()} scheme added`, 'success'); onDone(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Council"><input value={f.council} onChange={(e) => set('council')(e.target.value)} placeholder="e.g. Islington" className={box} /></Field>
        <Field label="Scheme name"><input value={f.scheme_name} onChange={(e) => set('scheme_name')(e.target.value)} placeholder="e.g. Private sector lettings" className={box} /></Field>
        <Field label="Route mailbox" hint={mailboxOk ? 'Where listings for this scheme go' : 'That does not look like an email address'}>
          <input type="email" value={f.route_mailbox} onChange={(e) => set('route_mailbox')(e.target.value)} placeholder="e.g. rental.alert@islington.gov.uk" className={box} />
        </Field>
        <Field label="Most it pays (£)"><input inputMode="decimal" value={f.max_incentive} onChange={(e) => set('max_incentive')(e.target.value)} placeholder="e.g. 5000" className={`${box} font-mono`} /></Field>
        <Field label="Incentive terms" wide><input value={f.incentive_terms} onChange={(e) => set('incentive_terms')(e.target.value)} placeholder="What they pay, to whom, and when" className={box} /></Field>
        <Field label="Documents needed" wide><input value={f.documents_required} onChange={(e) => set('documents_required')(e.target.value)} placeholder="e.g. gas, EICR, EPC, licence, landlord ID" className={box} /></Field>
        <label className="flex items-center gap-2 text-[14px] text-[var(--ink)]">
          <input type="checkbox" checked={f.registered} onChange={(e) => set('registered')(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> Registered with this scheme
        </label>
        {f.registered && <Field label="Registered on"><input type="date" value={f.registered_on} onChange={(e) => set('registered_on')(e.target.value)} className={box} /></Field>}
        <Field label="Last contact"><input type="date" value={f.last_contact} onChange={(e) => set('last_contact')(e.target.value)} className={box} /></Field>
        <Field label="Notes" wide><input value={f.notes} onChange={(e) => set('notes')(e.target.value)} className={box} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button busy={save.isPending} variant="primary" className={small} disabled={!f.council.trim() || !mailboxOk || save.isPending} onClick={go}>{save.isPending ? 'Saving…' : scheme ? 'Save changes' : 'Add the scheme'}</Button>
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

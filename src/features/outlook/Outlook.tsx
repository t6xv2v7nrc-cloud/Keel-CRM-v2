import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import {
  lastOutlookCheck, OUTLOOK_UPDATE, useAddOutlookOfficers, useApplicants, useFileOutlookMessage, useFindOutlookOfficers, useOfficers, useOutlook,
  useOutlookMessages, useOutlookSync, useSendFromOutlook,
} from '../../lib/hooks';
import type { OutlookCheck, OutlookMessageRow } from '../../lib/hooks';
import { redirectUri } from '../../lib/outlook';
import type { FoundAddress } from '../../lib/outlookMail';
import type { AppSettings } from '../../lib/settings';
import { copyText } from '../../lib/clipboard';
import { clockTime, shortDate } from '../../lib/format';
import { orgOfEmail } from '../../lib/search';
import { boroughOf, recordFor } from '../../lib/councils';
import type { Applicant } from '../../lib/types';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const when = (iso: string) => `${shortDate(iso)}, ${clockTime(iso)}`;
const checkWords = (c: OutlookCheck | null) => !c ? 'Not checked yet on this device'
  : c.error ? `Last check ${when(c.at)}: ${c.error}`
  : `Last checked ${when(c.at)}: ${[c.replies ? `${c.replies} on clients' timelines` : null, c.bin ? `${c.bin} to the Bin` : null, c.waiting ? `${c.waiting} waiting` : null].filter(Boolean).join(', ') || 'nothing new from officers'}`;

// ── Sending ────────────────────────────────────────────────────────

/** "Send from Outlook": shown only to someone with Outlook connected on this device. Asks first, then sends from
 *  their own mailbox (kept in their Sent Items). Several addresses go in Bcc, with the sender in To. */
export function OutlookSendButton({ to, subject, body, what, onSent, disabled = false, className = '' }: {
  to: string[]; subject: string; body: string; what: string; onSent?: () => void; disabled?: boolean; className?: string;
}) {
  const { account } = useOutlook();
  const send = useSendFromOutlook();
  const { toast } = useToast();
  if (!account) return null;
  const several = to.length > 1;
  const go = () => {
    if (!window.confirm(`Send ${what} from your Outlook (${account.email})${several ? `, with the ${to.length} addresses in Bcc` : ''}?`)) return;
    send.mutate({ to: several ? [account.email] : to, bcc: several ? to : [], subject, body }, {
      onSuccess: () => { toast('Sent from Outlook', 'success'); onSent?.(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  return (
    <Button variant="primary" className={`${small} ${className}`} disabled={disabled || !to.length || send.isPending} onClick={go}>
      <Icon name="send" size={14} />{send.isPending ? 'Sending…' : 'Send from Outlook'}
    </Button>
  );
}

// ── Settings ───────────────────────────────────────────────────────

/** Team settings: Keel's app in Microsoft Entra, set up once by the owner, with the steps. */
export function OutlookTeamCard({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const { toast } = useToast();
  const o = draft.outlook;
  const ok = !!o.clientId.trim() && !!o.tenantId.trim();
  const uri = redirectUri();
  return (
    <Card fold="settings.outlook" startsFolded>
      <CardHeader icon="mail" title="Outlook" sub={ok ? 'Set up' : 'Not set up'} help="outlook" />
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0 text-[15px] text-[var(--ink-muted)]">
          Lets each of you connect your work Outlook to Keel: send Mailer emails and officer updates from it, bring officers' emails in, and add the officers you email to the officer list. Set it up once here; then each person connects under My settings.
        </p>
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] text-[var(--ink)]">
          <li>Go to <a href="https://entra.microsoft.com" target="_blank" rel="noreferrer" className="text-[var(--link)] hover:underline">entra.microsoft.com</a> and sign in with Keel's Microsoft 365 admin account.</li>
          <li>Open <strong>Applications</strong>, then <strong>App registrations</strong>, then <strong>New registration</strong>.</li>
          <li>Name it <strong>Keel CRM</strong>. Under who can use it, pick <strong>Accounts in this organizational directory only</strong>.</li>
          <li>Under Redirect URI pick <strong>Single-page application (SPA)</strong> and paste this address, then press <strong>Register</strong>:
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-[var(--paper-2)] px-2 py-1 font-mono text-[13px]">{uri}</code>
              <Button className={small} onClick={async () => toast(await copyText(uri) ? 'Address copied' : 'Could not copy', 'success')}>Copy</Button>
            </span>
          </li>
          <li>Open <strong>API permissions</strong>, <strong>Add a permission</strong>, <strong>Microsoft Graph</strong>, <strong>Delegated permissions</strong>. Tick <strong>Mail.Read</strong> and <strong>Mail.Send</strong>, press <strong>Add permissions</strong>, then <strong>Grant admin consent</strong> and <strong>Yes</strong>.</li>
          <li>Open <strong>Overview</strong>. Copy the two IDs into the boxes below, then press <strong>Save team settings</strong>.</li>
        </ol>
        <div className="grid gap-3 sm:grid-cols-2">
          <IdBox label="Application (client) ID" value={o.clientId} onChange={(v) => set('outlook', { ...o, clientId: v })} />
          <IdBox label="Directory (tenant) ID" value={o.tenantId} onChange={(v) => set('outlook', { ...o, tenantId: v })} />
        </div>
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">
          These two IDs are not passwords and no secret is made. Nobody's Outlook password ever reaches Keel: each person signs in with Microsoft in Microsoft's own window, and Keel can only read and send their mail while they are signed in on that device.
        </p>
      </div>
    </Card>
  );
}

function IdBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onChange(v.trim())}
        placeholder="e.g. 0a1b2c3d-…" spellCheck={false} className={`${box} font-mono`} />
    </label>
  );
}

/** My settings: connect this person's Outlook on this device, or disconnect it. */
export function OutlookConnectCard() {
  const { configured, account, checking, connect, disconnect } = useOutlook();
  const sync = useOutlookSync();
  const { toast } = useToast();
  const [check, setCheck] = useState(() => lastOutlookCheck(account?.email));
  useEffect(() => setCheck(lastOutlookCheck(account?.email)), [account?.email, sync.isSuccess, sync.isError]);
  return (
    <Card fold="settings.myoutlook">
      <CardHeader icon="mail" title="Your Outlook" sub={account ? `Connected: ${account.email}` : configured ? 'Not connected' : 'Not set up yet'} help="outlook" />
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        {!configured ? (
          <p className="m-0 text-[var(--ink-muted)]">Outlook is not set up for Keel yet. The owner sets it up once in Team settings, under Outlook; then you can connect here.</p>
        ) : account ? (
          <>
            <p className="m-0 text-[var(--ink)]">Connected as <strong>{account.email}</strong> on this device.</p>
            <p className="m-0 text-[13px] text-[var(--ink-muted)]">{checkWords(check)}</p>
            <div className="flex flex-wrap gap-2">
              <Button className={small} disabled={!sync.ready || sync.isPending} onClick={() => sync.mutate(undefined, {
                onSuccess: (t) => toast(t.replies + t.bin + t.waiting ? 'Outlook checked' : 'Nothing new from officers', 'success'),
                onError: (e) => toast((e as Error).message, 'danger'),
              })}>{sync.isPending ? 'Checking…' : 'Check Outlook now'}</Button>
              <Button variant="ghost" className={small} disabled={disconnect.isPending} onClick={() => {
                if (window.confirm('Disconnect Outlook on this device? Your mail stays as it is; you can connect again any time.')) disconnect.mutate(undefined, { onSuccess: () => toast('Outlook disconnected on this device', 'success') });
              }}>Disconnect on this device</Button>
            </div>
          </>
        ) : (
          <>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] text-[var(--ink)]">
              <li>Send Mailer emails and officer updates from your own Outlook, recorded as they go.</li>
              <li>Officers' replies about a client go on that client's timeline; their nominations go to the Bin.</li>
              <li>Add the council officers you email to the officer list.</li>
            </ul>
            <p className="m-0 text-[13px] text-[var(--ink-muted)]">You sign in with Microsoft in Microsoft's window. Keel only reads emails from officers and councils, never the rest of your mail.</p>
            <div><Button variant="primary" className={small} disabled={checking || connect.isPending} onClick={() => connect.mutate(undefined, {
              onSuccess: (a) => { if (a) toast(`Outlook connected: ${a.email}`, 'success'); },
              onError: (e) => toast(/popup|cancel|user_cancelled/i.test((e as Error).message) ? 'Sign-in closed before it finished. Try again, and allow the Microsoft window.' : (e as Error).message, 'danger'),
            })}><Icon name="mail" size={14} />{connect.isPending ? 'Signing in…' : 'Connect Outlook'}</Button></div>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Bringing officer emails in ─────────────────────────────────────

/** Checks Outlook for officer emails while Keel is open: soon after it opens, then every 5 minutes. Silent. Only for
 *  someone with Outlook connected on this device; for anyone else nothing loads. */
export function OutlookAutoSync() {
  const { account } = useOutlook();
  return account ? <AutoSyncRunner /> : null;
}

function AutoSyncRunner() {
  const sync = useOutlookSync();
  const run = useRef(sync.mutate);
  run.current = sync.mutate;
  const { ready } = sync;
  useEffect(() => {
    if (!ready) return;
    const go = () => { if (document.visibilityState === 'visible') run.current(); };
    const first = setTimeout(go, 4_000);
    const every = setInterval(go, 5 * 60_000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [ready]);
  return null;
}

/** On the Bin: Outlook's last check, Check now, and officer emails waiting to be filed. */
export function OutlookInbox() {
  const { configured, account } = useOutlook();
  const sync = useOutlookSync();
  const { pending, ready } = useOutlookMessages();
  const { toast } = useToast();
  const check = useMemo(() => lastOutlookCheck(account?.email), [account?.email, sync.isSuccess, sync.isError]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!configured) return null;
  return (
    <Card fold="bin.outlook">
      <CardHeader icon="mail" title="Officer emails from Outlook" help="outlook" sub={pending.length ? `${pending.length} waiting` : account ? 'Nothing waiting' : 'Not connected'}>
        {account && ready && (
          <Button className={small} disabled={!sync.ready || sync.isPending} onClick={() => sync.mutate(undefined, { onError: (e) => toast((e as Error).message, 'danger') })}>
            {sync.isPending ? 'Checking…' : 'Check Outlook now'}
          </Button>
        )}
      </CardHeader>
      <div className="flex flex-col gap-3 px-5 py-4">
        {!ready ? (
          <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>{OUTLOOK_UPDATE}</p>
        ) : !account ? (
          <p className="m-0 text-[14px] text-[var(--ink-muted)]">Connect your Outlook in <Link to="/settings" className="text-[var(--link)] hover:underline">Settings, My settings</Link> and officers' emails come in by themselves: replies about a client go on their timeline, nominations come here to the Bin.</p>
        ) : (
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">{checkWords(check)}. Replies about a client go on their timeline and nominations come to the Bin by themselves; the rest wait here.</p>
        )}
        {pending.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {pending.map((m) => <WaitingEmail key={m.message_id} row={m} />)}
          </ul>
        )}
      </div>
    </Card>
  );
}

function WaitingEmail({ row }: { row: OutlookMessageRow }) {
  const file = useFileOutlookMessage();
  const { data: applicants = [] } = useApplicants();
  const { officers } = useOfficers();
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  const listed = recordFor({ email: row.from_address, phone: null }, officers);
  const council = (listed ? boroughOf(listed) : null) ?? orgOfEmail(row.from_address);
  const client: Applicant | undefined = applicants.find((a) => a.full_name.toLowerCase() === name.trim().toLowerCase());
  const act = (to: 'client' | 'bin' | 'ignore', applicant?: Applicant) => file.mutate({ row, to, applicant }, {
    onSuccess: () => toast(to === 'client' ? `On ${applicant?.full_name.split(' ')[0]}'s timeline` : to === 'bin' ? 'Sent to the Bin to review' : 'Ignored', 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[15px] font-medium text-[var(--ink)]">{row.from_name ?? row.from_address}</span>
        <span className="text-[13px] text-[var(--ink-muted)]">{council ? `${council} · ` : ''}{when(row.received_at)}</span>
      </div>
      {row.subject && <div className="text-[14px] text-[var(--ink)]">{row.subject}</div>}
      {row.snippet && <div className="text-[13px] text-[var(--ink-muted)] [overflow-wrap:anywhere]">{row.snippet}</div>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button className={small} disabled={file.isPending} onClick={() => act('bin')}>Send to the Bin</Button>
        {!picking ? (
          <Button className={small} disabled={file.isPending} onClick={() => setPicking(true)}>File on a client</Button>
        ) : (
          <span className="flex min-w-0 flex-1 basis-[260px] flex-wrap items-center gap-2">
            <input list={`clients-${row.message_id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Type the client's name" aria-label="Client to file it on"
              className="h-9 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <datalist id={`clients-${row.message_id}`}>{applicants.map((a) => <option key={a.id} value={a.full_name} />)}</datalist>
            <Button className={small} disabled={!client || file.isPending} onClick={() => client && act('client', client)}>{client ? `File on ${client.full_name.split(' ')[0]}` : 'File'}</Button>
          </span>
        )}
        <button type="button" disabled={file.isPending} onClick={() => act('ignore')} className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]">Ignore</button>
      </div>
    </li>
  );
}

// ── Officer addresses from Outlook ─────────────────────────────────

/** On Councils: the council officers in your Outlook who are not on the list yet, to add in one go. */
export function OutlookImport() {
  const { configured, account } = useOutlook();
  const find = useFindOutlookOfficers();
  const add = useAddOutlookOfficers();
  const { toast } = useToast();
  const [off, setOff] = useState<Set<string>>(new Set());
  if (!configured) return null;
  const found = find.data ?? [];
  const chosen = found.filter((f) => !off.has(f.address));
  const pick = (f: FoundAddress, on: boolean) => setOff((s) => { const n = new Set(s); if (on) n.delete(f.address); else n.add(f.address); return n; });
  return (
    <Card fold="councils.outlook">
      <CardHeader icon="mail" title="Officers from your Outlook" help="outlook" sub={find.isSuccess ? `${found.length} not on the list` : undefined} />
      <div className="flex flex-col gap-3 px-5 py-4">
        {!account ? (
          <p className="m-0 text-[14px] text-[var(--ink-muted)]">Connect your Outlook in <Link to="/settings" className="text-[var(--link)] hover:underline">Settings, My settings</Link> to find the council officers you email.</p>
        ) : (
          <>
            <p className="m-0 text-[14px] text-[var(--ink-muted)]">Looks at who you emailed at councils, and who emailed you, over the last 12 months (addresses and dates only). Anyone already on the list is left out.</p>
            <div><Button className={small} disabled={find.isPending} onClick={() => { setOff(new Set()); find.mutate(undefined, { onError: (e) => toast((e as Error).message, 'danger') }); }}>
              {find.isPending ? 'Looking…' : find.isSuccess ? 'Look again' : 'Look through my Outlook'}
            </Button></div>
          </>
        )}
        {find.isSuccess && found.length === 0 && <p className="m-0 text-[14px] text-[var(--ink)]">Everyone you email at councils is already on the list.</p>}
        {found.length > 0 && (
          <>
            <ul className="m-0 flex max-h-[420px] list-none flex-col divide-y divide-[var(--line)] overflow-y-auto p-0">
              {found.map((f) => (
                <li key={f.address}>
                  <label className="flex items-start gap-2 py-2 text-[14px] text-[var(--ink)]">
                    <input type="checkbox" checked={!off.has(f.address)} onChange={(e) => pick(f, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                    <span className="min-w-0">
                      {f.name ?? f.address}{f.council ? <span className="text-[var(--ink-muted)]">, {f.council}</span> : null}
                      <span className="block break-all text-[12px] text-[var(--ink-muted)]">{f.address}</span>
                      <span className="block text-[12px] text-[var(--ink-muted)]">
                        {[f.sent ? `you emailed ${f.sent}` : null, f.received ? `they emailed ${f.received}` : null].filter(Boolean).join(', ')}{f.last ? ` · last ${shortDate(f.last)}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" className={small} disabled={!chosen.length || add.isPending} onClick={() => add.mutate(chosen, {
                onSuccess: () => { toast(`Added ${chosen.length} to the officer list`, 'success'); find.reset(); },
                onError: (e) => toast((e as Error).message, 'danger'),
              })}>{add.isPending ? 'Adding…' : `Add ${chosen.length} to the officer list`}</Button>
              <span className="text-[12px] text-[var(--ink-muted)]">Added as housing officers who have not opted in: never sent property emails until they opt in or refer a client.</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// Outlook, through Microsoft Graph, from this browser. Each person connects their own work Outlook (Settings, My
// settings): they sign in with Microsoft themselves, in Microsoft's own window, and Keel never sees their password.
// Keel asks only to read mail and to send mail as them; the sign-in is kept on this device and can be removed from
// the same card. The app details (an app registered once in Microsoft Entra) are in Team settings, Outlook.
//
// Nothing here runs until those details are filled in; the sign-in library loads only then.

import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import type { GraphMessage } from './outlookMail';

export interface OutlookApp { clientId: string; tenantId: string }

/** What Keel asks Microsoft for: who you are, read your mail, send mail as you. */
export const SCOPES = ['User.Read', 'Mail.Read', 'Mail.Send'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

export const redirectUri = () => `${window.location.origin}/outlook-redirect.html`;
export const outlookConfigured = (a: Partial<OutlookApp> | null | undefined): a is OutlookApp => !!a?.clientId?.trim() && !!a?.tenantId?.trim();

// The harness (screen checks without Microsoft) puts a stand-in here; the app never does.
interface TestDouble { account: { username: string; name?: string } | null; graph: (path: string, init?: RequestInit) => Promise<unknown> }
let testDouble: TestDouble | null = null;
export function setOutlookTestDouble(d: TestDouble | null) { testDouble = d; }

let pca: Promise<IPublicClientApplication> | null = null;
let pcaFor = '';

/** The sign-in library, made once per app details; it also finishes a sign-in that went round by redirect. */
function client(app: OutlookApp): Promise<IPublicClientApplication> {
  const key = `${app.clientId.trim()}|${app.tenantId.trim()}`;
  if (!pca || pcaFor !== key) {
    pcaFor = key;
    pca = import('@azure/msal-browser').then(async ({ createStandardPublicClientApplication }) => {
      const c = await createStandardPublicClientApplication({
        auth: { clientId: app.clientId.trim(), authority: `https://login.microsoftonline.com/${app.tenantId.trim()}`, redirectUri: redirectUri() },
        cache: { cacheLocation: 'localStorage' },
      });
      const back = await c.handleRedirectPromise().catch(() => null);
      if (back?.account) c.setActiveAccount(back.account);
      if (!c.getActiveAccount()) c.setActiveAccount(c.getAllAccounts()[0] ?? null);
      return c;
    });
    pca.catch(() => { pca = null; });
  }
  return pca;
}

export interface Connected { email: string; name: string | null }
const connected = (a: AccountInfo | null): Connected | null => (a ? { email: a.username, name: a.name ?? null } : null);

/** Who is connected on this device, if anyone. */
export async function outlookAccount(app: OutlookApp): Promise<Connected | null> {
  if (testDouble) return testDouble.account ? { email: testDouble.account.username, name: testDouble.account.name ?? null } : null;
  const c = await client(app);
  return connected(c.getActiveAccount());
}

/** Sign in with Microsoft: a Microsoft window, or the whole page in the home-screen app (where windows do not work). */
export async function connectOutlook(app: OutlookApp): Promise<Connected | null> {
  if (testDouble) return outlookAccount(app);
  const c = await client(app);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) { await c.loginRedirect({ scopes: SCOPES, prompt: 'select_account' }); return null; }
  const r = await c.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
  c.setActiveAccount(r.account);
  return connected(r.account);
}

/** Forget the sign-in on this device (Outlook itself is untouched). */
export async function disconnectOutlook(app: OutlookApp): Promise<void> {
  if (testDouble) { testDouble.account = null; return; }
  const c = await client(app);
  const account = c.getActiveAccount();
  await c.clearCache(account ? { account } : undefined);
  c.setActiveAccount(null);
}

export class OutlookNeedsSignIn extends Error {
  constructor() { super('Outlook needs you to sign in again: Settings, My settings, Outlook, Connect.'); }
}

/** A token for Graph. Asked for by a button (`interactive`), a Microsoft window may open; in the background, never. */
async function token(app: OutlookApp, interactive: boolean): Promise<string> {
  const c = await client(app);
  const account = c.getActiveAccount();
  if (!account) throw new OutlookNeedsSignIn();
  try {
    return (await c.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (e) {
    const { InteractionRequiredAuthError } = await import('@azure/msal-browser');
    if (!(e instanceof InteractionRequiredAuthError) || !interactive) throw e instanceof InteractionRequiredAuthError ? new OutlookNeedsSignIn() : e;
    return (await c.acquireTokenPopup({ scopes: SCOPES, account })).accessToken;
  }
}

async function graph<T>(app: OutlookApp, path: string, init: RequestInit = {}, interactive = false): Promise<T> {
  if (testDouble) return await testDouble.graph(path, init) as T;
  const t = await token(app, interactive);
  const r = await fetch(path.startsWith('https://') ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (r.status === 202 || r.status === 204) return undefined as T;
  if (!r.ok) {
    let why = `${r.status}`;
    try { const j = await r.json() as { error?: { message?: string } }; if (j.error?.message) why = j.error.message; } catch { /* keep the status */ }
    if (r.status === 401) throw new OutlookNeedsSignIn();
    throw new Error(`Outlook said: ${why}`);
  }
  return await r.json() as T;
}

/** Send one email as the connected person, kept in their Sent Items. Several officers go in Bcc, with you in To. */
export async function sendFromOutlook(app: OutlookApp, m: { to: string[]; bcc?: string[]; subject: string; body: string }): Promise<void> {
  const rcpt = (xs: string[]) => xs.map((address) => ({ emailAddress: { address } }));
  await graph<void>(app, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: { subject: m.subject, body: { contentType: 'Text', content: m.body }, toRecipients: rcpt(m.to), bccRecipients: rcpt(m.bcc ?? []) },
      saveToSentItems: true,
    }),
  }, true);
}

interface Page { value: GraphMessage[]; '@odata.nextLink'?: string }

async function pages(app: OutlookApp, first: string, max: number, headers: Record<string, string> = {}, interactive = false): Promise<GraphMessage[]> {
  const out: GraphMessage[] = [];
  let next: string | undefined = first;
  while (next && out.length < max) {
    const p: Page = await graph<Page>(app, next, { headers }, interactive);
    out.push(...p.value);
    next = p['@odata.nextLink'];
  }
  return out.slice(0, max);
}

/** Emails that arrived in the inbox since a time, oldest first, as plain text (at most `max`). */
export function inboxSince(app: OutlookApp, since: string, max = 200): Promise<GraphMessage[]> {
  const q = new URLSearchParams({
    $filter: `receivedDateTime ge ${since}`, $orderby: 'receivedDateTime asc', $top: '50',
    $select: 'id,internetMessageId,subject,from,receivedDateTime,bodyPreview,body',
  });
  return pages(app, `/me/mailFolders/inbox/messages?${q}`, max, { Prefer: 'outlook.body-content-type="text"' });
}

/** Who you emailed and who emailed you over the last months: addresses and dates only, never the emails themselves. */
export async function addressesSince(app: OutlookApp, since: string, max = 1500): Promise<{ sent: GraphMessage[]; received: GraphMessage[] }> {
  const sentQ = new URLSearchParams({ $filter: `sentDateTime ge ${since}`, $top: '100', $select: 'toRecipients,ccRecipients,sentDateTime' });
  const inQ = new URLSearchParams({ $filter: `receivedDateTime ge ${since}`, $top: '100', $select: 'from,receivedDateTime' });
  const [sent, received] = await Promise.all([
    pages(app, `/me/mailFolders/sentitems/messages?${sentQ}`, max, {}, true),
    pages(app, `/me/mailFolders/inbox/messages?${inQ}`, max, {}, true),
  ]);
  return { sent, received };
}

/** One email found by its internet message id (to send a waiting one to the Bin in full), or null. */
export async function messageByInternetId(app: OutlookApp, internetMessageId: string): Promise<GraphMessage | null> {
  const q = new URLSearchParams({
    $filter: `internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`, $top: '1',
    $select: 'id,internetMessageId,subject,from,receivedDateTime,bodyPreview,body',
  });
  const p = await graph<Page>(app, `/me/messages?${q}`, { headers: { Prefer: 'outlook.body-content-type="text"' } }, true);
  return p.value[0] ?? null;
}

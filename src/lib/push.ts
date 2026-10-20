// Notifications on this device (push): turned on per device from Settings, My settings. The device asks the browser's
// own push service for an address, Keel keeps it in push_subscriptions (0027; each person sees only their own), and the
// server sends to it every 10 minutes when something needs you (netlify/functions/push-send.ts, the same rules as the
// bell). On an iPhone this only works in Keel opened from the Home Screen (iOS 16.4 or later).

import { supabase } from './supabase';

export type PushState =
  | { kind: 'unsupported'; why: string }
  | { kind: 'blocked' }
  | { kind: 'off' }
  | { kind: 'on'; endpoint: string };

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The offline helper (sw.js) that receives the notifications; only on the live site, never in a preview. */
async function worker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Whether this device can have notifications, and whether it has them. */
export async function pushState(): Promise<PushState> {
  if (isIos() && !standalone()) return { kind: 'unsupported', why: 'On iPhone, notifications only work in Keel opened from your Home Screen.' };
  if (!('Notification' in window) || !('PushManager' in window)) return { kind: 'unsupported', why: 'This browser cannot show notifications from websites.' };
  const reg = await worker();
  if (!reg) return { kind: 'unsupported', why: 'Notifications work on keelcrm.netlify.app once it has opened once; reload Keel and try again.' };
  if (Notification.permission === 'denied') return { kind: 'blocked' };
  const sub = await reg.pushManager.getSubscription();
  return sub ? { kind: 'on', endpoint: sub.endpoint } : { kind: 'off' };
}

const authHeader = async (): Promise<Record<string, string>> => {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
};

/** The server's answer as an error in words. */
async function failed(r: Response): Promise<Error> {
  try { const j = await r.json() as { error?: string }; return new Error(j.error ?? `The server said ${r.status}`); } catch { return new Error(`The server said ${r.status}`); }
}

const keyBytes = (base64url: string) => {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** "iPhone", "Android phone", "Mac", "Windows computer": so you can tell your devices apart. */
export function deviceName(ua = navigator.userAgent): string {
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/macintosh|mac os x/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows computer';
  return 'This device';
}

/** Ask to show notifications, then sign this device up. Returns the new state. */
export async function turnOnPush(): Promise<PushState> {
  const reg = await worker();
  if (!reg) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? { kind: 'blocked' } : { kind: 'off' };
  const r = await fetch('/api/push-key', { headers: await authHeader() });
  if (!r.ok) throw await failed(r);
  const { publicKey } = await r.json() as { publicKey: string };
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', device: deviceName() }, { onConflict: 'endpoint' });
  if (error) {
    await sub.unsubscribe().catch(() => {});
    throw new Error(/push_subscriptions/.test(error.message) ? 'Notifications need a one-off database update: run 0027_push.sql in the Supabase SQL Editor.' : error.message);
  }
  return { kind: 'on', endpoint: j.endpoint };
}

/** Stop notifications on this device (other devices keep theirs). */
export async function turnOffPush(): Promise<PushState> {
  const reg = await worker();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  return pushState();
}

/** A test notification to every device you turned on. */
export async function sendTestPush(): Promise<number> {
  const r = await fetch('/api/push-test', { method: 'POST', headers: await authHeader() });
  if (!r.ok) throw await failed(r);
  return ((await r.json()) as { sent: number }).sent;
}

// Reading a Bin screenshot with Claude, through the read-screenshot Netlify
// function. It comes back as the same Extraction the on-device reader makes;
// when Claude is not set up (no Anthropic key in Netlify), is busy or slow,
// this returns null and the Bin reads the screenshot on the device instead.

import { supabase } from './supabase';
import { cleanExtraction } from '../types/extraction';
import type { Extraction } from '../types/extraction';
import { tidyReading } from './extract';

const OFF_KEY = 'keel.claudeRead.off'; // set for the rest of the visit once the function says it is not set up

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(r.error ?? new Error('Could not read the image'));
  r.readAsDataURL(blob);
});

/** Claude's reading of a screenshot, or null to read it on the device. */
export async function readWithClaude(image: Blob, hint?: string): Promise<Extraction | null> {
  try { if (sessionStorage.getItem(OFF_KEY)) return null; } catch { /* private window */ }
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  try {
    const res = await fetch('/api/read-screenshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ image: await toBase64(image), hint: hint || undefined }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 501 || res.status === 404) {
      try { sessionStorage.setItem(OFF_KEY, '1'); } catch { /* fine */ }
      return null;
    }
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const raw = typeof body === 'object' && body !== null && 'extraction' in body ? body.extraction : null;
    const e = cleanExtraction(raw);
    return e ? tidyReading(e) : null;
  } catch {
    return null; // offline, timed out, or not JSON: read it on the device
  }
}

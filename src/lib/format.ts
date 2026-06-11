/** Normalise a UK phone number to E.164 (+44...). Returns null if not parseable. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+44') && digits.length === 13) return digits;
  if (digits.startsWith('44') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('07') && digits.length === 11) return `+44${digits.slice(1)}`;
  if (digits.startsWith('0') && digits.length === 11) return `+44${digits.slice(1)}`;
  return null;
}

/** Format money as GBP without pence: 1250 → £1,250 */
export function money(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** ISO date → "12 Jun 2026" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Relative time: "2h ago", "3d ago" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/** Normalise a UK postcode to "N17 9LP" form (uppercase, single space). */
export function normalisePostcode(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, '');
  if (s.length < 5) return raw.toUpperCase().trim();
  return `${s.slice(0, -3)} ${s.slice(-3)}`;
}

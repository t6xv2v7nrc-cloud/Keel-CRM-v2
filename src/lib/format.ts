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
  if (amount == null) return '·';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A YYYY-MM-DD day is read as that day wherever the phone is; anything else as the moment it names. */
const asDate = (iso: string | Date) => (iso instanceof Date ? iso : new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso));

/** "12 Jun 2026", written the same on every phone and browser. */
export function shortDate(iso: string | Date | null | undefined): string {
  if (!iso) return '·';
  const d = asDate(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Saturday 10 October" */
export function longDay(iso: string | Date): string {
  const d = asDate(iso);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** "Saturday" */
export const weekdayName = (iso: string | Date) => WEEKDAYS_LONG[asDate(iso).getDay()];

/** "Wed 30 Sep", written the same on every phone and browser (they disagree on "Sept" and commas). */
export function shortDay(iso: string | Date): string {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "6 October 2026", for invoices. */
export function fullDate(iso: string): string {
  const d = asDate(iso);
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "October 2026" from "2026-10" */
export function monthName(ym: string, short = false): string {
  const [y, m] = ym.split('-').map(Number);
  return short ? MONTHS[m - 1] : `${MONTHS_LONG[m - 1]} ${y}`;
}

/** Pounds and pence: 288.461 → £288.46 (for invoices and fees worked out from the rent). */
export function moneyExact(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

/** £288.46 when there are pence, £300 when there are none. */
export function moneyFee(amount: number | null | undefined): string {
  if (amount == null) return '·';
  return Math.round(amount * 100) % 100 === 0 ? money(amount) : moneyExact(amount);
}

/** Short pounds for tight spaces: £950, £1.3k, £12k */
export function moneyShort(amount: number): string {
  if (amount < 1000) return `£${Math.round(amount)}`;
  const k = amount / 1000;
  return `£${k < 10 ? Math.round(k * 10) / 10 : Math.round(k)}k`;
}

/** "2pm", "10:30am" */
export function clockTime(iso: string | Date): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/** Relative time: "2h ago", "3d ago" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '·';
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

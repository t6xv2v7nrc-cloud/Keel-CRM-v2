// Editing a saved property: reading a typed rent, and saying in words what changed so it can go on the property's history.

import type { Property } from './types';
import { money, shortDate } from './format';
import { ACCOMMODATION_LABEL, BILLS_LABEL, SUITS_LABEL } from './propertyChecks';

/** Letting details and safety papers (0019): only sent once the columns exist. */
export const CHECK_FIELDS = [
  'accommodation_type', 'bills_included', 'floor', 'lift', 'suitable_for', 'gas_expiry', 'no_gas', 'eicr_expiry', 'epc_rating', 'epc_sap',
  'licence_needed', 'licence_no', 'licence_expiry', 'alarms_checked', 'photo_count', 'prs_landlord_id', 'prs_property_id',
] as const;
type CheckField = typeof CHECK_FIELDS[number];

export type EditableProperty = Pick<Property,
  'address_line' | 'postcode' | 'area' | 'borough' | 'property_type' | 'bedrooms' | 'rent_pcm' | 'rent_text' | 'bills' | 'furnished' | 'available_from' | 'notes'>
  & Partial<Pick<Property, CheckField | 'photo_urls'>>;

export const EDITABLE: ReadonlyArray<keyof EditableProperty> = [
  'address_line', 'postcode', 'area', 'borough', 'property_type', 'bedrooms', 'rent_pcm', 'rent_text', 'bills', 'furnished', 'available_from', 'notes',
  ...CHECK_FIELDS, 'photo_urls',
];

/** Whether a saved property has the 0024 photo links (a property only on this device can always hold them). */
export const hasPhotoLinks = (p: Partial<Property>, local = false) => local || 'photo_urls' in p;

/** Whether a saved property has the 0019 columns (a property only on this device can always hold them). */
export const hasCheckFields = (p: Partial<Property>, local = false) => local || 'gas_expiry' in p;

/** The usual property types, for picking from a list. */
export const TYPE_OPTIONS = ['Room', 'En-suite Room', 'HMO Room', 'Studio', 'En-suite Studio', 'Self-Contained Studio', '1-Bed Flat', '2-Bed Flat', '3-Bed Flat', '2-Bed House', '3-Bed House', '4-Bed House'];

/** Bedrooms from a type label: "2-Bed Flat" is 2; rooms and studios are 0; anything else is not known. */
export function bedsOfType(t: string | null): number | null {
  if (!t) return null;
  const m = /(\d)\s*-?\s*bed/i.exec(t);
  if (m) return Number(m[1]);
  return /\b(room|studio|bedsit|hmo)\b/i.test(t) ? 0 : null;
}

/** A typed rent: "£950 pcm" is 950 a month, "£220 pw" is 953, "1-Bed LHA" has no figure (it is paid at the LHA rate). */
export function rentFrom(text: string): { rent_text: string | null; rent_pcm: number | null } {
  const v = text.trim();
  if (!v) return { rent_text: null, rent_pcm: null };
  const pounds = /£?\s?(\d[\d,]*(?:\.\d+)?)/.exec(v);
  const weekly = /\bp\/?w\b|\bpw\b|week/i.test(v);
  const pcm = /lha/i.test(v) || !pounds ? null : Math.round(Number(pounds[1].replace(/,/g, '')) * (weekly ? 52 / 12 : 1));
  return { rent_text: v, rent_pcm: pcm };
}

/** The rent as it should show in the edit box. */
export const rentWords = (p: Pick<Property, 'rent_text' | 'rent_pcm'>) => p.rent_text ?? (p.rent_pcm ? `${money(p.rent_pcm)} pcm` : '');

const LABEL: Record<keyof EditableProperty, string> = {
  address_line: 'Address', postcode: 'Postcode', area: 'Area', borough: 'Borough', property_type: 'Type', bedrooms: 'Bedrooms',
  rent_pcm: 'Rent', rent_text: 'Rent', bills: 'Bills', furnished: 'Furnished', available_from: 'Available from', notes: 'Notes',
  accommodation_type: 'Kind', bills_included: 'Bills included', floor: 'Floor', lift: 'Lift', suitable_for: 'Suits',
  gas_expiry: 'Gas certificate', no_gas: 'No gas', eicr_expiry: 'EICR', epc_rating: 'EPC', epc_sap: 'SAP score',
  licence_needed: 'Licence needed', licence_no: 'Licence number', licence_expiry: 'Licence', alarms_checked: 'Alarms checked',
  photo_count: 'Photos', prs_landlord_id: 'PRS landlord ID', prs_property_id: 'PRS property ID', photo_urls: 'Photo links',
};
const DATES = new Set<keyof EditableProperty>(['available_from', 'gas_expiry', 'eicr_expiry', 'licence_expiry', 'alarms_checked']);
const label = (map: Record<string, string>, v: string) => map[v] ?? v;

const shown = (k: keyof EditableProperty, v: unknown): string => {
  if (Array.isArray(v)) {
    if (v.length === 0) return 'none';
    if (k === 'photo_urls') return `${v.length} ${v.length === 1 ? 'link' : 'links'}`;
    const map: Record<string, string> = k === 'suitable_for' ? SUITS_LABEL : k === 'bills_included' ? BILLS_LABEL : {};
    return v.map((x) => label(map, String(x))).join(', ');
  }
  if (v == null || v === '') return 'not set';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (k === 'rent_pcm') return `${money(Number(v))} pcm`;
  if (DATES.has(k)) return shortDate(String(v));
  if (k === 'accommodation_type') return label(ACCOMMODATION_LABEL, String(v));
  if (k === 'notes') return String(v).length > 40 ? `${String(v).slice(0, 40)}…` : String(v);
  return String(v);
};

const same = (a: unknown, b: unknown) => (Array.isArray(a) || Array.isArray(b)
  ? JSON.stringify([...((a as unknown[]) ?? [])].sort()) === JSON.stringify([...((b as unknown[]) ?? [])].sort())
  : a === b);

/** Only the fields that really changed, ready to save. A field left out of `after` is not touched. */
export function changedFields(before: EditableProperty, after: EditableProperty): Partial<EditableProperty> {
  const out: Partial<EditableProperty> = {};
  for (const k of EDITABLE) {
    if (!(k in after)) continue;
    const a = before[k] ?? null, b = after[k] ?? null;
    if (!same(a, b)) (out as Record<string, unknown>)[k] = b;
  }
  return out;
}

/** What changed, in words: "Rent £1,000 pcm → £1,100 pcm; Type Studio → En-suite Studio". Bedrooms follow the type, so they are not repeated. */
export function changeWords(before: EditableProperty, patch: Partial<EditableProperty>): string {
  const keys = (Object.keys(patch) as Array<keyof EditableProperty>)
    .filter((k) => !(k === 'bedrooms' && 'property_type' in patch))
    .filter((k) => !(k === 'rent_text' && 'rent_pcm' in patch && patch.rent_pcm != null));
  return keys.map((k) => (k === 'notes' ? 'Notes changed' : `${LABEL[k]} ${shown(k, before[k])} → ${shown(k, patch[k])}`)).join('; ');
}

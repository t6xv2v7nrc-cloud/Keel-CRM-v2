import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, useToast } from '../../components/ui';
import { useUpdateProperty } from '../../lib/hooks';
import { BOROUGHS } from '../../lib/london';
import { normalisePostcode } from '../../lib/format';
import { bedsOfType, rentFrom, rentWords, TYPE_OPTIONS } from '../../lib/propertyEdit';
import type { EditableProperty } from '../../lib/propertyEdit';
import type { Property } from '../../lib/types';

const FURNISHED = ['Furnished', 'Part furnished', 'Unfurnished'];
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';

/** Change a saved property's details. Matches, the LHA check and the map follow the new details straight away. */
export function EditProperty({ p, onDone }: { p: Property; onDone: () => void }) {
  const update = useUpdateProperty();
  const { toast } = useToast();
  const [f, setF] = useState({
    address_line: p.address_line, postcode: p.postcode ?? '', area: p.area ?? '', borough: p.borough ?? '',
    property_type: p.property_type ?? '', rent: rentWords(p), bills: p.bills ?? '', furnished: p.furnished ?? '',
    available_from: p.available_from ?? '', notes: p.notes ?? '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const rent = rentFrom(f.rent);

  const save = () => {
    const typeChanged = (f.property_type || null) !== (p.property_type ?? null);
    const next: EditableProperty = {
      address_line: f.address_line.trim(),
      postcode: f.postcode.trim() ? normalisePostcode(f.postcode) : null,
      area: f.area.trim() || null,
      borough: f.borough || null,
      property_type: f.property_type || null,
      // bedrooms follow the type when it changes; otherwise they stay as they were
      bedrooms: typeChanged ? bedsOfType(f.property_type || null) ?? p.bedrooms : p.bedrooms,
      // an untouched rent box keeps the rent exactly as saved
      ...(f.rent === rentWords(p) ? { rent_text: p.rent_text, rent_pcm: p.rent_pcm } : rent),
      bills: f.bills.trim() || null,
      furnished: f.furnished || null,
      available_from: f.available_from || null,
      notes: f.notes.trim() || null,
    };
    update.mutate({ p, next }, {
      onSuccess: (n) => { toast(n ? `Saved ${p.address_line.split(',')[0]}` : 'Nothing changed', 'success'); onDone(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Address" wide>
          <input value={f.address_line} onChange={(e) => set('address_line')(e.target.value)} className={box} aria-label="Address" />
        </Labelled>
        <Labelled label="Postcode">
          <input value={f.postcode} onChange={(e) => set('postcode')(e.target.value)} className={`${box} uppercase`} aria-label="Postcode" />
        </Labelled>
        <Labelled label="Area">
          <input value={f.area} onChange={(e) => set('area')(e.target.value)} placeholder="e.g. Willesden" className={box} aria-label="Area" />
        </Labelled>
        <Labelled label="Borough">
          <select value={f.borough} onChange={(e) => set('borough')(e.target.value)} className={box} aria-label="Borough">
            <option value="">Not set</option>
            {[...new Set([...(f.borough ? [f.borough] : []), ...BOROUGHS])].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Labelled>
        <Labelled label="Type">
          <select value={f.property_type} onChange={(e) => set('property_type')(e.target.value)} className={box} aria-label="Type">
            <option value="">Not set</option>
            {[...new Set([...(f.property_type ? [f.property_type] : []), ...TYPE_OPTIONS])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Labelled>
        <Labelled label="Rent" hint={f.rent && rent.rent_pcm == null && !/lha/i.test(f.rent) ? 'No figure found: type it like £950 pcm or £220 pw' : rent.rent_pcm && /week|pw/i.test(f.rent) ? `£${rent.rent_pcm} a month` : undefined}>
          <input value={f.rent} onChange={(e) => set('rent')(e.target.value)} placeholder="£950 pcm, £220 pw or 1-Bed LHA" className={`${box} font-mono`} aria-label="Rent" />
        </Labelled>
        <Labelled label="Bills">
          <input value={f.bills} onChange={(e) => set('bills')(e.target.value)} placeholder="e.g. included, or excluded" className={box} aria-label="Bills" />
        </Labelled>
        <Labelled label="Furnished">
          <select value={f.furnished} onChange={(e) => set('furnished')(e.target.value)} className={box} aria-label="Furnished">
            <option value="">Not said</option>
            {[...new Set([...(f.furnished ? [f.furnished] : []), ...FURNISHED])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Labelled>
        <Labelled label="Available from">
          <input type="date" value={f.available_from} onChange={(e) => set('available_from')(e.target.value)} className={box} aria-label="Available from" />
        </Labelled>
        <Labelled label="Notes" wide>
          <textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} rows={2} placeholder="e.g. ground floor, shared kitchen, no pets"
            className={`${box} h-auto py-2`} aria-label="Notes" />
        </Labelled>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className="min-h-0 px-4 py-2 text-[14px]" disabled={update.isPending || !f.address_line.trim()} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button className="min-h-0 px-4 py-2 text-[14px]" disabled={update.isPending} onClick={onDone}>Cancel</Button>
        <span className="text-[12px] text-[var(--ink-muted)]">Matches and the LHA check update straight away. Status and provider are changed on the card.</span>
      </div>
    </div>
  );
}

function Labelled({ label, hint, wide = false, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

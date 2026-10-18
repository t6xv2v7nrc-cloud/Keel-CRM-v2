import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Help, UpdateNote, useToast } from '../../components/ui';
import { useUpdateProperty } from '../../lib/hooks';
import { isLocalProperty } from '../../lib/localProperties';
import { ACCOMMODATION_LABEL, accommodationOf, BILLS, BILLS_LABEL, SUITS, SUITS_LABEL } from '../../lib/propertyChecks';
import { BOROUGHS } from '../../lib/london';
import { normalisePostcode } from '../../lib/format';
import { bedsOfType, hasCheckFields, hasPhotoLinks, rentFrom, rentWords, TYPE_OPTIONS } from '../../lib/propertyEdit';
import type { EditableProperty } from '../../lib/propertyEdit';
import type { AccommodationType, Property } from '../../lib/types';

const FURNISHED = ['Furnished', 'Part furnished', 'Unfurnished'];
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const chip = (on: boolean) => `inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${on
  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`;
const yesNo = (v: boolean | null | undefined) => (v == null ? '' : v ? 'yes' : 'no');
const fromYesNo = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null);
const whole = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

/** The letting details and safety papers as they sit in the form. */
function checkForm(p: Property) {
  return {
    accommodation_type: (p.accommodation_type ?? '') as AccommodationType | '', bills_included: p.bills_included ?? [], floor: p.floor == null ? '' : String(p.floor),
    lift: yesNo(p.lift), suitable_for: p.suitable_for ?? [], gas_expiry: p.gas_expiry ?? '', no_gas: !!p.no_gas, eicr_expiry: p.eicr_expiry ?? '',
    epc_rating: p.epc_rating ?? '', epc_sap: p.epc_sap == null ? '' : String(p.epc_sap), licence_needed: yesNo(p.licence_needed),
    licence_no: p.licence_no ?? '', licence_expiry: p.licence_expiry ?? '', alarms_checked: p.alarms_checked ?? '',
    photo_count: p.photo_count == null ? '' : String(p.photo_count), prs_landlord_id: p.prs_landlord_id ?? '', prs_property_id: p.prs_property_id ?? '',
  };
}
type CheckForm = ReturnType<typeof checkForm>;

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
  // letting details and safety papers: only once 0019 is run (a property only on this device can always hold them)
  const canCheck = hasCheckFields(p, isLocalProperty(p.id));
  const [c, setC] = useState<CheckForm>(() => checkForm(p));
  const setCheck = <K extends keyof CheckForm>(k: K, v: CheckForm[K]) => setC((x) => ({ ...x, [k]: v }));
  const toggle = (k: 'bills_included' | 'suitable_for', v: string) => setC((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const guess = accommodationOf({ property_type: f.property_type || null, notes: f.notes || null });
  // photo links for alerts: only once 0024 is run
  const canLink = hasPhotoLinks(p, isLocalProperty(p.id));
  const [links, setLinks] = useState<string[]>(() => [0, 1, 2].map((i) => p.photo_urls?.[i] ?? ''));
  const linksOk = links.every((l) => !l.trim() || /^https?:\/\/\S+$/.test(l.trim()));

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
      ...(canCheck ? {
        accommodation_type: c.accommodation_type || null, bills_included: c.bills_included, floor: whole(c.floor), lift: fromYesNo(c.lift),
        suitable_for: c.suitable_for, gas_expiry: c.no_gas ? null : c.gas_expiry || null, no_gas: c.no_gas, eicr_expiry: c.eicr_expiry || null,
        epc_rating: c.epc_rating || null, epc_sap: whole(c.epc_sap), licence_needed: fromYesNo(c.licence_needed), licence_no: c.licence_no.trim() || null,
        licence_expiry: c.licence_expiry || null, alarms_checked: c.alarms_checked || null, photo_count: whole(c.photo_count),
        prs_landlord_id: c.prs_landlord_id.trim() || null, prs_property_id: c.prs_property_id.trim() || null,
      } : {}),
      ...(canLink ? { photo_urls: links.map((l) => l.trim()).filter(Boolean) } : {}),
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

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink)]">Letting details and safety papers <Help topic="propertyChecks" /></div>
        {!canCheck ? (
          <UpdateNote title="Letting details and safety papers need a one-off database update." file="0019_property_checks.sql" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Kind of place" hint={!c.accommodation_type && guess ? `Looks like ${ACCOMMODATION_LABEL[guess.type].toLowerCase()} from its type` : undefined}>
              <select value={c.accommodation_type} onChange={(e) => setCheck('accommodation_type', e.target.value as AccommodationType | '')} className={box} aria-label="Kind of place">
                <option value="">Not set</option>
                {(Object.keys(ACCOMMODATION_LABEL) as AccommodationType[]).map((t) => <option key={t} value={t}>{ACCOMMODATION_LABEL[t]}</option>)}
              </select>
            </Labelled>
            <Labelled label="Photos ready to send" hint="Optional: the supplier has the photos">
              <input type="number" min={0} inputMode="numeric" value={c.photo_count} onChange={(e) => setCheck('photo_count', e.target.value)} className={box} aria-label="Photos ready to send" />
            </Labelled>
            {canLink && (
              <Labelled label="Photo links for alerts (up to 3)" wide hint={linksOk ? 'A shared album or photo link each, starting https://' : 'Each link must start https://'}>
                <div className="flex flex-col gap-2">
                  {links.map((l, i) => (
                    <input key={i} type="url" value={l} placeholder="https://" aria-label={`Photo link ${i + 1}`} className={box}
                      onChange={(e) => setLinks((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
                  ))}
                </div>
              </Labelled>
            )}
            <Group label="Suits" wide>
              {SUITS.map((s) => (
                <button key={s} type="button" aria-pressed={c.suitable_for.includes(s)} className={chip(c.suitable_for.includes(s))} onClick={() => toggle('suitable_for', s)}>{SUITS_LABEL[s]}</button>
              ))}
            </Group>
            <Group label="Bills included in the rent" wide>
              {BILLS.map((b) => (
                <button key={b} type="button" aria-pressed={c.bills_included.includes(b)} className={chip(c.bills_included.includes(b))} onClick={() => toggle('bills_included', b)}>{BILLS_LABEL[b]}</button>
              ))}
            </Group>
            <Labelled label="Floor">
              <select value={c.floor} onChange={(e) => setCheck('floor', e.target.value)} className={box} aria-label="Floor">
                <option value="">Not said</option>
                <option value="-1">Basement</option>
                <option value="0">Ground floor</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>Floor {n}</option>)}
              </select>
            </Labelled>
            <Labelled label="Lift">
              <select value={c.lift} onChange={(e) => setCheck('lift', e.target.value)} className={box} aria-label="Lift">
                <option value="">Not said</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Labelled>
            <Group label="Gas safety certificate runs out">
              <input type="date" value={c.gas_expiry} disabled={c.no_gas} onChange={(e) => setCheck('gas_expiry', e.target.value)} className={`${box} disabled:opacity-50`} aria-label="Gas safety certificate runs out" />
              <label className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
                <input type="checkbox" checked={c.no_gas} onChange={(e) => setCheck('no_gas', e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> No gas supply
              </label>
            </Group>
            <Labelled label="Electrical report (EICR) runs out">
              <input type="date" value={c.eicr_expiry} onChange={(e) => setCheck('eicr_expiry', e.target.value)} className={box} aria-label="Electrical report runs out" />
            </Labelled>
            <Labelled label="EPC rating">
              <select value={c.epc_rating} onChange={(e) => setCheck('epc_rating', e.target.value)} className={box} aria-label="EPC rating">
                <option value="">Not set</option>
                {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Labelled>
            <Labelled label="EPC SAP score">
              <input type="number" min={1} max={150} inputMode="numeric" value={c.epc_sap} onChange={(e) => setCheck('epc_sap', e.target.value)} placeholder="e.g. 68" className={box} aria-label="EPC SAP score" />
            </Labelled>
            <Labelled label="Licence needed" hint={c.accommodation_type === 'hmo_room' || (!c.accommodation_type && guess?.type === 'hmo_room') ? 'HMO rooms always need one' : 'HMO or selective licensing'}>
              <select value={c.licence_needed} onChange={(e) => setCheck('licence_needed', e.target.value)} className={box} aria-label="Licence needed">
                <option value="">Not known</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Labelled>
            <Labelled label="Licence number">
              <input value={c.licence_no} onChange={(e) => setCheck('licence_no', e.target.value)} className={box} aria-label="Licence number" />
            </Labelled>
            <Labelled label="Licence runs out">
              <input type="date" value={c.licence_expiry} onChange={(e) => setCheck('licence_expiry', e.target.value)} className={box} aria-label="Licence runs out" />
            </Labelled>
            <Labelled label="Smoke and CO alarms last checked" hint="Counts for a year">
              <input type="date" value={c.alarms_checked} onChange={(e) => setCheck('alarms_checked', e.target.value)} className={box} aria-label="Alarms last checked" />
            </Labelled>
            <Labelled label="PRS database landlord ID" hint="Needed on adverts once the database starts">
              <input value={c.prs_landlord_id} onChange={(e) => setCheck('prs_landlord_id', e.target.value)} className={`${box} font-mono`} aria-label="PRS database landlord ID" />
            </Labelled>
            <Labelled label="PRS database property ID">
              <input value={c.prs_property_id} onChange={(e) => setCheck('prs_property_id', e.target.value)} className={`${box} font-mono`} aria-label="PRS database property ID" />
            </Labelled>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className="min-h-0 px-4 py-2 text-[14px]" disabled={update.isPending || !f.address_line.trim() || !linksOk} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button className="min-h-0 px-4 py-2 text-[14px]" disabled={update.isPending} onClick={onDone}>Cancel</Button>
        <span className="text-[12px] text-[var(--ink-muted)]">Matches and the LHA check update straight away. Status and provider are changed on the card.</span>
      </div>
    </div>
  );
}

function Group({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
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

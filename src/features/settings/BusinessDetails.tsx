import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui';
import type { AppSettings, BusinessDetails } from '../../lib/settings';
import { missingBusiness } from '../../lib/business';

const FIELDS: Array<{ key: keyof BusinessDetails; label: string; placeholder: string; hint?: string }> = [
  { key: 'redressScheme', label: 'Redress scheme', placeholder: 'e.g. The Property Ombudsman' },
  { key: 'redressNumber', label: 'Redress membership number', placeholder: 'e.g. D12345' },
  { key: 'clientMoneyProtection', label: 'Client money protection', placeholder: 'Scheme and number, or Not required', hint: 'Write Not required if Keel holds no client money' },
  { key: 'llasNumber', label: 'LLAS number', placeholder: 'London Landlord Accreditation Scheme' },
  { key: 'icoNumber', label: 'ICO registration', placeholder: 'e.g. ZA123456' },
  { key: 'fees', label: 'Fee list', placeholder: 'A link to the fees page, or a short line' },
  { key: 'unsubscribeEmail', label: 'Unsubscribe email', placeholder: 'Blank uses the email on invoices', hint: 'Where officers write to stop property emails' },
  { key: 'website', label: 'Website', placeholder: 'e.g. keellettings.com', hint: 'Put in the message clients forward to friends' },
];

/** Team settings: Keel's credentials, printed at the foot of every Mailer email and on email signatures. Blank ones are left out. */
export function BusinessDetailsCard({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const missing = missingBusiness(draft.business);
  return (
    <Card fold="settings.business" startsFolded>
      <CardHeader icon="file" title="Business details" sub={missing.length ? `${missing.length} still to add` : 'All filled in'} help="mailer" />
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0 text-[15px] text-[var(--ink-muted)]">
          Printed at the foot of every property alert and digest, and under email signatures. Leave a box blank until Keel has joined: blank ones are left out.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Text key={f.key} label={f.label} placeholder={f.placeholder} hint={f.hint} value={draft.business[f.key]}
              onChange={(v) => set('business', { ...draft.business, [f.key]: v })} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function Text({ label, value, placeholder, hint, onChange }: { label: string; value: string; placeholder: string; hint?: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== value && onChange(v.trim())}
        className="h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
      {hint && <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

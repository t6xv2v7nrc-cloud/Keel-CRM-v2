import { useMemo } from 'react';
import { useApplicants, useContacts } from '../../lib/hooks';
import { Card } from '../../components/ui';
import type { Contact } from '../../lib/types';

const TYPE_LABEL: Record<Contact['type'], string> = {
  housing_officer: 'Officer',
  partner: 'Partner',
  landlord: 'Landlord',
  other: 'Other',
};

/** Contacts (§8.5): grouped by borough; per-contact referral count. */
export function ContactsPage() {
  const { data: contacts = [], isLoading } = useContacts();
  const { data: applicants = [] } = useApplicants();

  // Referral counts: how many applicants each contact referred.
  const referralCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of applicants) {
      if (a.referred_by) map.set(a.referred_by, (map.get(a.referred_by) ?? 0) + 1);
    }
    return map;
  }, [applicants]);

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  const boroughs = [...new Set(contacts.map((c) => c.borough ?? 'Unknown'))].sort();

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 p-6 pb-24">
      <header>
        <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Contacts</h1>
        <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
          {contacts.length} officers, partners and landlords
        </p>
      </header>

      {contacts.length === 0 && (
        <p className="text-[15px] text-[var(--ink-muted)]">No contacts yet.</p>
      )}

      {boroughs.map((borough) => {
        const rows = contacts.filter((c) => (c.borough ?? 'Unknown') === borough);
        return (
          <Card key={borough}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <h3 className="m-0 text-[18px] font-semibold text-[var(--ink)]">{borough}</h3>
              <span className="font-mono text-[13px] text-[var(--ink-muted)]">{rows.length}</span>
            </div>
            <ul className="m-0 list-none p-0">
              {rows.map((c) => {
                const refs = referralCounts.get(c.id) ?? 0;
                return (
                  <li key={c.id} className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-b-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--paper)] text-[13px] font-semibold text-[var(--ink-muted)]">
                      {c.full_name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] text-[var(--ink)]">{c.full_name}</div>
                      <div className="font-mono text-[13px] text-[var(--ink-muted)]">
                        {[TYPE_LABEL[c.type], c.organisation, c.phone].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {refs > 0 && (
                      <span className="rounded bg-[var(--stage-referred-bg)] px-2 py-0.5 text-[13px] text-[var(--stage-referred-fg)]">
                        {refs} referral{refs > 1 ? 's' : ''}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

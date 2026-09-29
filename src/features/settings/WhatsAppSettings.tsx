import { Card, CardHeader } from '../../components/ui';
import { usePeople } from '../../lib/hooks';
import { useState } from 'react';
import { DEFAULT_VIEWING_CANCELLED, DEFAULT_VIEWING_MOVED, DEFAULT_WHATSAPP_MESSAGE, DEFAULT_WHATSAPP_REMINDER } from '../../lib/settings';
import type { AppSettings } from '../../lib/settings';
import { clientMessage, viewingMessage } from '../../lib/whatsapp';

type ViewingKey = 'whatsappReminder' | 'whatsappViewingMoved' | 'whatsappViewingCancelled';
const VIEWING_KINDS: Array<[ViewingKey, string, string]> = [
  ['whatsappReminder', 'Reminder', DEFAULT_WHATSAPP_REMINDER],
  ['whatsappViewingMoved', 'Viewing moved', DEFAULT_VIEWING_MOVED],
  ['whatsappViewingCancelled', 'Viewing cancelled', DEFAULT_VIEWING_CANCELLED],
];

const SAMPLE = {
  address_line: 'Ballards Lane, North Finchley N12 0DA', postcode: 'N12 0DA', borough: 'Barnet', property_type: 'Studio',
  bedrooms: 0, rent_pcm: 1100, rent_text: '£1,100 pcm', bills: 'Included', furnished: 'Furnished', available_from: null,
};

const PLACEHOLDERS: Array<[string, string]> = [
  ['{first name}', "the client's first name"],
  ['{a property}', '"a property", or "3 properties" when sending several'],
  ['{properties}', 'the details: type, address, rent, bills'],
  ['{my name}', 'whoever sends it (their name under My settings)'],
];

/** Team settings: the wording used when a property is sent to a client on WhatsApp. */
export function WhatsAppSettings({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const { myName } = usePeople();
  const [viewingKind, setViewingKind] = useState<ViewingKey>('whatsappReminder');
  const [, viewingLabel, viewingDefault] = VIEWING_KINDS.find(([k]) => k === viewingKind)!;
  return (
    <Card>
      <CardHeader icon="chat" title="WhatsApp message" help="whatsapp" />
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="wa-message" className="text-[15px] font-medium text-[var(--ink)]">Wording for clients</label>
          <textarea id="wa-message" rows={8} value={draft.whatsappMessage} onChange={(e) => set('whatsappMessage', e.target.value)}
            className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-[var(--ink-muted)]">
            {PLACEHOLDERS.map(([k, v]) => <li key={k}><code className="font-mono text-[var(--ink)]">{k}</code> {v}</li>)}
          </ul>
          {draft.whatsappMessage !== DEFAULT_WHATSAPP_MESSAGE && (
            <button type="button" onClick={() => set('whatsappMessage', DEFAULT_WHATSAPP_MESSAGE)} className="self-start text-[13px] text-[var(--link)] hover:underline">
              Use the standard wording
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-medium text-[var(--ink)]">How it looks</span>
          <div className="whitespace-pre-wrap rounded-lg rounded-tr-none bg-[var(--accent-soft)] p-3 text-[14px] leading-relaxed text-[var(--ink)]">
            {/* WhatsApp shows *this* in bold */}
            {clientMessage('Sam Taylor', [SAMPLE], myName ?? 'Ridwan', draft.whatsappMessage).split(/\*([^*\n]+)\*/)
              .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}
          </div>
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">
            WhatsApp opens with this typed in. Nothing is sent until you press send there. Sharing a property without a client sends only the details.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-5 md:col-span-2 md:grid md:grid-cols-2 md:gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-medium text-[var(--ink)]">Viewing messages to clients</span>
            <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="tablist" aria-label="Viewing message">
              {VIEWING_KINDS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={viewingKind === k} onClick={() => setViewingKind(k)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium ${viewingKind === k ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <textarea rows={4} value={draft[viewingKind]} onChange={(e) => set(viewingKind, e.target.value)} aria-label={`Wording for ${viewingLabel.toLowerCase()}`}
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <p className="m-0 text-[13px] text-[var(--ink-muted)]">
              <code className="font-mono text-[var(--ink)]">{'{address}'}</code> the property, <code className="font-mono text-[var(--ink)]">{'{when}'}</code> the day and time,{' '}
              <code className="font-mono text-[var(--ink)]">{'{old when}'}</code> the time before it moved or was cancelled.
              Sent from a booked viewing on the client's page or on Home.
            </p>
            {draft[viewingKind] !== viewingDefault && (
              <button type="button" onClick={() => set(viewingKind, viewingDefault)} className="self-start text-[13px] text-[var(--link)] hover:underline">
                Use the standard wording
              </button>
            )}
          </div>
          <div className="whitespace-pre-wrap self-start rounded-lg rounded-tr-none bg-[var(--accent-soft)] p-3 text-[14px] leading-relaxed text-[var(--ink)]">
            {viewingMessage(draft[viewingKind], { clientName: 'Sam Taylor', address: 'Ballards Lane, North Finchley N12 0DA', when: 'Thursday 2 October, 2pm', oldWhen: 'Wednesday 1 October, 11am', myName: myName ?? 'Ridwan' })}
          </div>
        </div>
      </div>
    </Card>
  );
}

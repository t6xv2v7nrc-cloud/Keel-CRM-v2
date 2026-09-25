import { Card, CardHeader } from '../../components/ui';
import { usePeople } from '../../lib/hooks';
import { DEFAULT_WHATSAPP_MESSAGE } from '../../lib/settings';
import type { AppSettings } from '../../lib/settings';
import { clientMessage } from '../../lib/whatsapp';

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
      </div>
    </Card>
  );
}

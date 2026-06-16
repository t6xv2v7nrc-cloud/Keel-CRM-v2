import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Field, TierBadge } from '../../components/ui';
import { useToast } from '../../components/ui';
import { APPLICANT_STAGES } from '../../types/extraction';
import type { ApplicantStage, Extraction } from '../../types/extraction';
import type { MatchResult } from '../../lib/matching';
import { signedBinUrl } from './capture';
import { confirmInboxItem } from './confirm';
import type { ConfirmChoice } from './confirm';
import { money } from '../../lib/format';
import { HOUSEHOLD_LABEL, WORK_STATUS_LABEL, URGENCY_LABEL } from '../../lib/tiering';

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--ink-muted)]">
      {children}
    </span>
  );
}

interface ReviewCardProps {
  itemId: string;
  imagePath: string | null;
  extraction: Extraction;
  matches: MatchResult | null;
  onDone: () => void;
  onDiscard: () => void;
}

/** The heart of the app (§5.3): screenshot left, editable fields right,
 *  matching proposal with radio choices, Confirm / Discard. */
export function ReviewCard({ itemId, imagePath, extraction, matches, onDone, onDiscard }: ReviewCardProps) {
  const { toast } = useToast();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editable copy of the extraction
  const [draft, setDraft] = useState<Extraction>(extraction);

  // Match choices — default to the strongest match, else "create"
  const bestApplicant = matches?.applicant[0];
  const bestContact = matches?.contact[0];
  const [applicantTarget, setApplicantTarget] = useState<string>(
    bestApplicant ? bestApplicant.id : draft.applicant?.full_name ? 'create' : 'note_only',
  );
  const [contactTarget, setContactTarget] = useState<string>(
    bestContact ? bestContact.id : draft.contact?.full_name ? 'create' : 'none',
  );
  const [advanceStage, setAdvanceStage] = useState<ApplicantStage | ''>('');

  useEffect(() => {
    if (imagePath) signedBinUrl(imagePath).then(setImgUrl);
  }, [imagePath]);

  const a = draft.applicant ?? {};
  const setA = (k: string, v: string) => setDraft((d) => ({ ...d, applicant: { ...d.applicant, [k]: v } }));

  const confirmLabel = useMemo(() => {
    if (applicantTarget === 'create' && a.full_name) return `Confirm and create ${a.full_name.split(' ')[0]}`;
    if (applicantTarget !== 'create' && applicantTarget !== 'note_only') {
      const m = matches?.applicant.find((x) => x.id === applicantTarget);
      return `Confirm and update ${m?.label.split(' ')[0] ?? 'record'}`;
    }
    return 'Confirm and log note';
  }, [applicantTarget, a.full_name, matches]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const choice: ConfirmChoice = {
        applicantTarget,
        contactTarget,
        advanceStage: advanceStage || null,
      };
      const out = await confirmInboxItem({ inboxItemId: itemId, extraction: draft, choice });
      toast(
        out.applicantName ? `Saved — ${out.applicantName} (${out.activityCount} activity)` : 'Saved',
        'success',
      );
      onDone();
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-2">
        {/* Source: screenshot, or text for email/webhook enquiries */}
        <div className="border-b border-[var(--line)] bg-[var(--paper)] p-4 md:border-b-0 md:border-r">
          <div className="mb-2 text-[13px] font-medium text-[var(--ink-muted)]">
            {imagePath ? 'Screenshot' : 'Source text'}
          </div>
          {imagePath ? (
            imgUrl ? (
              <img src={imgUrl} alt="Pasted screenshot" className="max-h-[420px] w-full rounded-md border border-[var(--line)] object-contain" />
            ) : (
              <div className="grid h-40 place-items-center text-[var(--ink-muted)]">Loading image…</div>
            )
          ) : (
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-[13px] text-[var(--ink)]">
              {draft.transcription || '(no text)'}
            </pre>
          )}
          {imagePath && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] text-[var(--ink-muted)]">Raw text</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--surface)] p-2 font-mono text-[13px] text-[var(--ink-muted)]">
                {draft.transcription || '(no text found)'}
              </pre>
            </details>
          )}
        </div>

        {/* Fields + proposal */}
        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[var(--stage-referred-bg)] px-2 py-0.5 text-[13px] font-medium text-[var(--stage-referred-fg)]">
                {draft.doc_type.replace(/_/g, ' ')}
              </span>
              <span className="font-mono text-[13px] text-[var(--ink-muted)]">
                confidence {Math.round(draft.confidence * 100)}%
              </span>
            </div>
            <p className="mt-2 mb-0 text-[15px] text-[var(--ink)]">{draft.summary}</p>
          </div>

          {/* Applicant fields (always editable) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={a.full_name ?? ''} onChange={(e) => setA('full_name', e.target.value)} />
            <Field label="Phone" mono value={a.phone ?? ''} onChange={(e) => setA('phone', e.target.value)} />
            <Field label="Borough / council" value={a.referring_borough ?? a.council ?? ''} onChange={(e) => setA('referring_borough', e.target.value)} />
            <Field label="Budget pcm" mono value={a.budget_pcm != null ? String(a.budget_pcm) : ''} onChange={(e) => setA('budget_pcm', e.target.value)} />
          </div>

          {/* Referral triage summary (read-only — full edit on the applicant page) */}
          {(a.tier != null || a.household_type || a.on_uc != null || a.officer_name) && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--paper)] p-3">
              <div className="mb-2 flex items-center gap-2">
                {a.tier != null && <TierBadge tier={a.tier} />}
                <span className="text-[13px] text-[var(--ink-muted)]">Referral triage</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {a.household_type && <Chip>{HOUSEHOLD_LABEL[a.household_type] ?? a.household_type}</Chip>}
                {a.on_uc != null && <Chip>UC: {a.on_uc ? 'Yes' : 'No'}</Chip>}
                {a.pip != null && <Chip>PIP: {a.pip ? 'Yes' : 'No'}</Chip>}
                {a.lcwra != null && <Chip>LCWRA: {a.lcwra ? 'Yes' : 'No'}</Chip>}
                {a.council_registered != null && <Chip>Council-reg: {a.council_registered ? 'Yes' : 'No'}</Chip>}
                {a.work_status && <Chip>{WORK_STATUS_LABEL[a.work_status] ?? a.work_status}</Chip>}
                {a.urgency && a.urgency !== 'none' && <Chip>{URGENCY_LABEL[a.urgency] ?? a.urgency}</Chip>}
              </div>
              {a.officer_name && (
                <div className="mt-2 text-[13px] text-[var(--ink-muted)]">
                  Officer: <span className="text-[var(--ink)]">{a.officer_name}</span>
                  {(a.officer_email || a.officer_phone) && ` · ${[a.officer_email, a.officer_phone].filter(Boolean).join(' / ')}`}
                </div>
              )}
            </div>
          )}

          {draft.money?.fee_amount != null && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-[15px]">
              Fee detected: <strong className="font-mono">{money(draft.money.fee_amount)}</strong>
            </div>
          )}

          {/* Matching proposal */}
          <div className="rounded-md border border-[var(--line)] p-3">
            <div className="mb-2 text-[13px] font-medium text-[var(--ink-muted)]">What should happen?</div>

            <fieldset className="flex flex-col gap-1.5">
              {matches?.applicant.map((m) => (
                <Radio key={m.id} name="app" checked={applicantTarget === m.id} onChange={() => setApplicantTarget(m.id)}>
                  Update <strong>{m.label}</strong> <span className="text-[var(--ink-muted)]">({m.reason}, {Math.round(m.score * 100)}%)</span>
                </Radio>
              ))}
              {a.full_name && (
                <Radio name="app" checked={applicantTarget === 'create'} onChange={() => setApplicantTarget('create')}>
                  Create new applicant <strong>{a.full_name}</strong>
                </Radio>
              )}
              <Radio name="app" checked={applicantTarget === 'note_only'} onChange={() => setApplicantTarget('note_only')}>
                Just log a note
              </Radio>
            </fieldset>

            {/* Stage advance */}
            {applicantTarget !== 'note_only' && (
              <label className="mt-3 flex items-center gap-2 text-[15px]">
                <span className="text-[var(--ink-muted)]">Set stage:</span>
                <select
                  value={advanceStage}
                  onChange={(e) => setAdvanceStage(e.target.value as ApplicantStage | '')}
                  className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px]"
                >
                  <option value="">(no change)</option>
                  {APPLICANT_STAGES.filter((s) => s !== 'lost').map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Contact proposal */}
            {(draft.contact?.full_name || (matches?.contact.length ?? 0) > 0) && (
              <fieldset className="mt-3 flex flex-col gap-1.5 border-t border-[var(--line)] pt-3">
                <div className="text-[13px] text-[var(--ink-muted)]">Referring contact</div>
                {matches?.contact.map((m) => (
                  <Radio key={m.id} name="con" checked={contactTarget === m.id} onChange={() => setContactTarget(m.id)}>
                    Link <strong>{m.label}</strong> <span className="text-[var(--ink-muted)]">({m.reason})</span>
                  </Radio>
                ))}
                {draft.contact?.full_name && (
                  <Radio name="con" checked={contactTarget === 'create'} onChange={() => setContactTarget('create')}>
                    Create contact <strong>{draft.contact.full_name}</strong>
                  </Radio>
                )}
                <Radio name="con" checked={contactTarget === 'none'} onChange={() => setContactTarget('none')}>
                  No contact
                </Radio>
              </fieldset>
            )}
          </div>

          <div className="mt-auto flex items-center justify-end gap-2">
            <Button variant="danger" onClick={onDiscard} disabled={busy}>Discard</Button>
            <Button variant="primary" onClick={handleConfirm} disabled={busy}>
              {busy ? 'Saving…' : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Radio({
  name, checked, onChange, children,
}: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[15px]">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-[var(--hull)]" />
      <span>{children}</span>
    </label>
  );
}

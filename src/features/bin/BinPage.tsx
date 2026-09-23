import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardHeader, Field, Icon, PageHeader, useToast } from '../../components/ui';
import { extractFromText } from '../../lib/extract';
import { parseEnquiryEmail } from '../../lib/parseEnquiry';
import { runMatching } from '../../lib/matching';
import { compressImage, uploadToBin } from './capture';
import { useInbox, useCreateInboxItem, useUpdateInboxItem } from './useInbox';
import type { InboxItem } from './useInbox';
import { ReviewCard } from './ReviewCard';
import { confirmInboxItem } from './confirm';
import { defaultChoice, withMessageNotes } from './defaults';
import type { CardState } from './defaults';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';

type Stage = 'idle' | 'staging' | 'processing';

export function BinPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: inbox = [] } = useInbox();
  const createItem = useCreateInboxItem();
  const updateItem = useUpdateInboxItem();

  // After a confirm (which writes directly to Supabase), refresh everything it touched.
  const refreshAfterConfirm = () => {
    qc.invalidateQueries({ queryKey: ['inbox'] });
    qc.invalidateQueries({ queryKey: ['applicants'] });
  };

  // ── Confirm all ──
  // Each card reports its current draft + choice; untouched items use the same
  // default a card starts with. So "Confirm all" saves exactly what the cards show.
  const cardStates = useRef(new Map<string, CardState>());
  const onCardState = useCallback((id: string, state: CardState | null) => {
    if (state) cardStates.current.set(id, state); else cardStates.current.delete(id);
  }, []);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const confirmAll = async (items: InboxItem[]) => {
    const plan = items
      .filter((i) => i.extraction)
      .map((i) => ({ item: i, state: cardStates.current.get(i.id) ?? { extraction: withMessageNotes(i.extraction!), choice: defaultChoice(i.extraction!, i.matches) } }));
    const creates = plan.filter((x) => x.state.choice.applicantTarget === 'create').length;
    const notes = plan.filter((x) => x.state.choice.applicantTarget === 'note_only').length;
    const updates = plan.length - creates - notes;
    const summary = [
      creates && `${creates} new ${creates === 1 ? 'client' : 'clients'}`,
      updates && `${updates} ${updates === 1 ? 'update' : 'updates'} to existing clients`,
      notes && `${notes} ${notes === 1 ? 'note' : 'notes'}`,
    ].filter(Boolean).join(', ');
    if (!window.confirm(`Confirm all ${plan.length} items?\n\nThis saves ${summary}, each using the choice shown on its card (including any edits you have made).`)) return;

    let ok = 0;
    const failed: string[] = [];
    setBulk({ done: 0, total: plan.length });
    for (const { item, state } of plan) {
      try {
        await confirmInboxItem({ inboxItemId: item.id, extraction: state.extraction, choice: state.choice });
        ok += 1;
      } catch (e) {
        failed.push(`${state.extraction.applicant?.full_name ?? state.extraction.summary}: ${(e as Error).message}`);
      }
      setBulk({ done: ok + failed.length, total: plan.length });
    }
    setBulk(null);
    refreshAfterConfirm();
    if (failed.length) toast(`Saved ${ok}. ${failed.length} could not be saved and are still in the Bin: ${failed[0]}`, 'danger');
    else toast(`Saved all ${ok} items`, 'success');
  };

  const [stage, setStage] = useState<Stage>('idle');
  const [staged, setStaged] = useState<{ file: Blob; preview: string } | null>(null);
  const [hint, setHint] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const stageImage = useCallback((file: Blob) => {
    setStaged({ file, preview: URL.createObjectURL(file) });
    setStage('staging');
  }, []);

  // Paste-anywhere (§5.1)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      if (item) {
        const file = item.getAsFile();
        if (file) stageImage(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [stageImage]);

  const process = async () => {
    if (!staged) return;
    setStage('processing');
    try {
      // 1. Compress
      setProgressLabel('Compressing…');
      const blob = await compressImage(staged.file);

      // 2. OCR (the slow step on first run — downloads language data).
      //    Lazy-loaded so Tesseract is not in the main bundle.
      setProgressLabel('Reading text…');
      const { ocrImage } = await import('../../lib/ocr');
      const text = await ocrImage(blob, (f) => setProgress(f));

      // 3. Extract + match
      setProgressLabel('Extracting…');
      const extraction = extractFromText(text, hint || undefined);
      const matches = await runMatching(extraction);

      // 4. Upload + persist
      setProgressLabel('Saving…');
      const path = await uploadToBin(blob);
      await createItem.mutateAsync({
        image_path: path,
        source_hint: hint || undefined,
        status: 'review',
        detected_type: extraction.doc_type,
        raw_text: text,
        extraction,
        matches,
      });

      toast('Screenshot read. Review it below', 'success');
      reset();
    } catch (e) {
      toast(`Failed: ${(e as Error).message}`, 'danger');
      setStage('staging');
    }
  };

  const reset = () => {
    if (staged) URL.revokeObjectURL(staged.preview);
    setStaged(null);
    setHint('');
    setProgress(0);
    setProgressLabel('');
    setStage('idle');
  };

  // Paste a website enquiry email body → structured review item (no OCR).
  const [enquiryText, setEnquiryText] = useState('');
  const processEnquiry = async () => {
    const extraction = parseEnquiryEmail(enquiryText);
    if (!extraction) {
      toast('Could not find an enquiry. Paste the full email including "First Name:".', 'danger');
      return;
    }
    try {
      const matches = await runMatching(extraction);
      await createItem.mutateAsync({
        image_path: '',
        source_hint: 'Website enquiry',
        status: 'review',
        detected_type: extraction.doc_type,
        raw_text: extraction.transcription,
        extraction,
        matches,
      });
      setEnquiryText('');
      toast('Enquiry parsed. Review it below', 'success');
    } catch (e) {
      toast(`Failed: ${(e as Error).message}`, 'danger');
    }
  };

  const reviewItems = inbox.filter((i) => i.status === 'review');
  const doneItems = inbox.filter((i) => i.status === 'confirmed').slice(0, 8);

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-6 pb-24">
      <PageHeader icon="inbox" title="The Bin" sub="Paste a screenshot anywhere with Ctrl/Cmd+V. It gets read, classified and matched to your records." />

      {/* Capture zone */}
      {stage === 'idle' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) stageImage(file);
          }}
          className="grid place-items-center rounded-lg border-2 border-dashed p-12 text-center transition-colors"
          style={{ borderColor: dragOver ? 'var(--accent)' : 'var(--line-strong)', background: dragOver ? 'var(--accent-soft)' : 'var(--surface-2)' }}
        >
          <div className="flex flex-col items-center">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-card)]"><Icon name="inbox" size={26} /></span>
            <div className="text-[18px] font-semibold text-[var(--ink)]">Paste, drop, or pick a screenshot</div>
            <p className="mt-1 text-[15px] text-[var(--ink-muted)]">WhatsApp messages, referral forms, officer emails, property details</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) stageImage(f); }}
            />
            <Button variant="primary" className="mt-4" onClick={() => fileRef.current?.click()}><Icon name="plus" size={16} />Choose image</Button>
          </div>
        </div>
      )}

      {/* Paste a website enquiry email (structured — no OCR needed) */}
      {stage === 'idle' && (
        <Card>
          <CardHeader title="Paste a website enquiry" sub="from keellettings.com" />
          <div className="flex flex-col gap-3 p-4">
            <textarea
              value={enquiryText}
              onChange={(e) => setEnquiryText(e.target.value)}
              placeholder={'Paste the enquiry email body here, e.g.\n\nFirst Name: Omar\nLast Name: Mohamed\nEmail: ...\nPhone: ...\nMessage: ...'}
              rows={5}
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 font-mono text-[13px] text-[var(--ink)] outline-none focus:border-[var(--hull)]"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 text-[13px] text-[var(--ink-muted)]">
                Parses name, phone, household and budget instantly. For hands-off sync, see the Netlify webhook setup.
              </p>
              <Button variant="primary" onClick={processEnquiry} disabled={!enquiryText.trim()}>Parse enquiry</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Staging — add a hint, then process */}
      {stage === 'staging' && staged && (
        <Card className="p-4">
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <img src={staged.preview} alt="Staged" className="max-h-48 w-full rounded-md border border-[var(--line)] object-contain" />
            <div className="flex flex-col gap-3">
              <Field
                label="Source hint (optional)"
                placeholder="e.g. from Debby, Harrow"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
              />
              <p className="m-0 text-[13px] text-[var(--ink-muted)]">
                First read downloads the OCR engine (~10MB), then it is cached. Subsequent reads are fast.
              </p>
              <div className="mt-auto flex justify-end gap-2">
                <Button onClick={reset}>Cancel</Button>
                <Button variant="primary" onClick={process}>Read screenshot</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Processing */}
      {stage === 'processing' && (
        <Card className="p-6">
          <div className="text-[15px] font-medium text-[var(--ink)]">{progressLabel}</div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--paper)]">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--brass)' }} />
          </div>
        </Card>
      )}

      {/* Review queue */}
      {reviewItems.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[22px] font-semibold text-[var(--ink)]">To review ({reviewItems.length})</h2>
            {reviewItems.length > 1 && (
              <Button variant="primary" onClick={() => confirmAll(reviewItems)} disabled={bulk !== null}>
                {bulk ? `Saving ${bulk.done} of ${bulk.total}…` : `Confirm all ${reviewItems.length}`}
              </Button>
            )}
          </div>
          {reviewItems.map((item) => (
            <ReviewCard
              key={item.id}
              itemId={item.id}
              imagePath={item.image_path}
              extraction={item.extraction!}
              matches={item.matches}
              onDone={refreshAfterConfirm}
              onDiscard={() => updateItem.mutate({ id: item.id, status: 'discarded' })}
              onStateChange={onCardState}
            />
          ))}
        </section>
      )}

      {/* Recently confirmed */}
      {doneItems.length > 0 && (
        <Card>
          <CardHeader title="Recently filed" sub={`${doneItems.length}`} />
          <ul className="m-0 list-none p-0">
            {doneItems.map((item: InboxItem) => (
              <li key={item.id} className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-b-0">
                <span className="rounded bg-[var(--stage-placed-bg)] px-2 py-0.5 text-[13px] text-[var(--stage-placed-fg)]">
                  {item.detected_type?.replace(/_/g, ' ') ?? 'filed'}
                </span>
                <span className="text-[15px] text-[var(--ink)]">{item.extraction?.summary ?? '—'}</span>
                <span className="ml-auto font-mono text-[13px] text-[var(--ink-muted)]">{timeAgo(item.confirmed_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Empty state */}
      {inbox.length === 0 && stage === 'idle' && (
        <p className="text-center text-[15px] text-[var(--ink-muted)]">No items yet. Paste your first screenshot to begin.</p>
      )}

      <DiscardCleanup inbox={inbox} />
    </div>
  );
}

/** Frees storage when an item is discarded — deletes the screenshot blob. */
function DiscardCleanup({ inbox }: { inbox: InboxItem[] }) {
  useEffect(() => {
    const orphans = inbox.filter((i) => i.status === 'discarded' && i.image_path);
    if (orphans.length === 0) return;
    const paths = orphans.map((i) => i.image_path!).filter(Boolean);
    supabase.storage.from('bin').remove(paths).then(() => {
      supabase.from('inbox_items').update({ image_path: null }).in('id', orphans.map((o) => o.id));
    });
  }, [inbox]);
  return null;
}

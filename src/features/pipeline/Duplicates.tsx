import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Empty, Icon, StageBadge, UpdateNote, useToast } from '../../components/ui';
import { useMergeClients, useMergeReady } from '../../lib/hooks';
import { shortDate } from '../../lib/format';
import { dismissGroup, groupId } from '../../lib/duplicates';
import type { DuplicateGroup } from '../../lib/duplicates';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';

/** Clients who look like the same person entered twice, with one tap to fold them into one record. */
export function DuplicatesBox({ groups, onClose, onChange }: { groups: DuplicateGroup[]; onClose: () => void; onChange: () => void }) {
  const ready = useMergeReady();
  return (
    <Card>
      <CardHeader icon="users" title="Possible duplicates" sub={String(groups.length)} help="duplicates">
        <button type="button" onClick={onClose} aria-label="Close duplicates" title="Close"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
          <Icon name="x" size={16} />
        </button>
      </CardHeader>
      <div className="flex flex-col gap-3 p-4">
        {!ready && <UpdateNote title="Merging needs a one-off database update." file="0014_merge_clients.sql" />}
        {groups.length === 0
          ? <Empty icon="check" title="No duplicates">Nobody shares a phone, email or name with another client.</Empty>
          : groups.map((g) => <GroupCard key={groupId(g)} g={g} ready={ready} onChange={onChange} />)}
      </div>
    </Card>
  );
}

function GroupCard({ g, ready, onChange }: { g: DuplicateGroup; ready: boolean; onChange: () => void }) {
  const merge = useMergeClients();
  const { toast } = useToast();
  const [keep, setKeep] = useState(g.keep.id);
  const kept = g.clients.find((c) => c.id === keep) ?? g.keep;
  const others = g.clients.filter((c) => c.id !== kept.id);
  const first = (n: string) => n.split(' ')[0];

  const go = () => {
    const names = others.map((c) => c.full_name).join(' and ');
    if (!window.confirm(`Merge ${names} into ${kept.full_name}? Their calls, properties, fees and timeline move across, missing details are filled in, notes are joined, and the other record is deleted. This cannot be undone.`)) return;
    merge.mutate({ keep: kept.id, gone: others.map((c) => c.id) }, {
      onSuccess: (n) => { toast(`Merged ${n} ${n === 1 ? 'record' : 'records'} into ${kept.full_name}`, 'success'); onChange(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {g.reasons.map((r) => (
          <span key={r} className="rounded px-1.5 py-0.5 text-[12px] font-semibold"
            style={r === 'same name' ? { background: 'var(--chip-bg)', color: 'var(--chip-fg)' } : { background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </span>
        ))}
        {!g.sure && <span className="text-[12px] text-[var(--ink-muted)]">Two people can share a name: check before merging.</span>}
      </div>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 text-[13px] text-[var(--ink-muted)]">Keep</legend>
        {g.clients.map((c) => (
          <label key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 ${c.id === kept.id ? 'bg-[var(--accent-soft)]' : ''}`}>
            <input type="radio" name={`keep-${groupId(g)}`} checked={c.id === kept.id} onChange={() => setKeep(c.id)} className="h-4 w-4 accent-[var(--accent)]" />
            <span className="min-w-0 flex-1 basis-[160px] text-[15px] font-medium text-[var(--ink)]">{c.full_name}</span>
            <StageBadge stage={c.stage} />
            <span className="text-[13px] text-[var(--ink-muted)]">{[c.phone, c.email, `added ${shortDate(c.created_at)}`].filter(Boolean).join(' · ')}</span>
            <Link to={`/applicants/${c.id}`} className="text-[13px] text-[var(--link)] hover:underline">Open</Link>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className={small} disabled={!ready || merge.isPending} onClick={go}>
          {merge.isPending ? 'Merging…' : `Merge into ${first(kept.full_name)}`}
        </Button>
        <Button className={small} disabled={merge.isPending} onClick={() => { dismissGroup(groupId(g)); onChange(); }}>Not the same person</Button>
      </div>
    </div>
  );
}

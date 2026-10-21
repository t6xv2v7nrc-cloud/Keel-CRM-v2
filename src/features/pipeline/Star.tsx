import { useState } from 'react';
import { Icon, useToast } from '../../components/ui';
import { useSettings, useStarClient } from '../../lib/hooks';
import type { Applicant } from '../../lib/types';

/** Star a client: pinned to the top of this person's Pipeline. Each person keeps their own stars. */
export function StarButton({ applicant, size = 18, className = '' }: { applicant: Pick<Applicant, 'id' | 'full_name'>; size?: number; className?: string }) {
  const { settings } = useSettings();
  const star = useStarClient();
  const { toast } = useToast();
  const [popped, setPopped] = useState(false);
  const on = settings.starredClients.includes(applicant.id);
  const first = applicant.full_name.trim().split(/\s+/)[0] || 'this client';
  const flip = () => {
    setPopped(!on);
    star.mutate({ id: applicant.id, on: !on }, { onError: (e) => toast(`Could not save the star: ${(e as Error).message}`, 'danger') });
  };
  return (
    <button type="button" onClick={flip} aria-pressed={on} aria-label={on ? `Unstar ${first}` : `Star ${first}`}
      title={on ? 'Starred: pinned to the top of your Pipeline. Tap to unstar.' : 'Star: pin to the top of your Pipeline'}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--surface-2)] ${on ? 'text-[var(--accent)]' : 'text-[var(--line-strong)] hover:text-[var(--ink-muted)]'} ${className}`}>
      <Icon name="star" size={size} filled={on} strokeWidth={on ? 1.6 : 1.9} className={popped && on ? 'keel-pop' : ''} />
    </button>
  );
}

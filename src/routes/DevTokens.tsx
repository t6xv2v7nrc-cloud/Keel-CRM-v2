import { useState } from 'react';
import { APPLICANT_STAGES } from '../types/extraction';
import { Badge, Button, Card, CardHeader, Field, KeelLine, StageBadge, useToast } from '../components/ui';
import { money, toE164, shortDate } from '../lib/format';

const COLOUR_TOKENS = [
  ['--paper', 'App background'],
  ['--surface', 'Cards, panels'],
  ['--ink', 'Primary text'],
  ['--ink-muted', 'Secondary text'],
  ['--hull', 'Primary buttons'],
  ['--brass', 'Signature accent'],
  ['--brass-ink', 'Brass as text'],
  ['--link', 'Links'],
  ['--danger', 'Errors'],
  ['--success', 'Success'],
] as const;

/** /dev/tokens — Phase 0 styleguide. Every token, type style and primitive
 *  rendered live so design drift is visible at a glance. */
export default function DevTokens() {
  const { toast } = useToast();
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
  };

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 p-6 pb-24">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Keel tokens</h1>
          <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
            Design system reference — §7 of the build plan
          </p>
        </div>
        <Button onClick={toggleTheme}>{dark ? 'Switch to light' : 'Switch to dark'}</Button>
      </header>

      <Card>
        <CardHeader title="Colour" sub="WCAG-verified pairs" />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 md:grid-cols-5">
          {COLOUR_TOKENS.map(([token, use]) => (
            <div key={token} className="flex flex-col gap-1.5">
              <span
                className="h-14 rounded-md border border-[var(--line)]"
                style={{ background: `var(${token})` }}
              />
              <code className="font-mono text-[13px] text-[var(--ink)]">{token}</code>
              <span className="text-[13px] text-[var(--ink-muted)]">{use}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Type" sub="Bricolage Grotesque · IBM Plex Sans · IBM Plex Mono" />
        <div className="flex flex-col gap-3 p-5">
          <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Display 28 — Bricolage Grotesque</h1>
          <h2 className="m-0 text-[22px] font-semibold text-[var(--ink)]">Heading 22 — section titles</h2>
          <h3 className="m-0 text-[18px] font-semibold text-[var(--ink)]">Heading 18 — card titles</h3>
          <p className="m-0 text-[15px] text-[var(--ink)]">
            Body 15 — IBM Plex Sans. Calm, civic, dense-data friendly. Sentence case everywhere.
          </p>
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">Small 13 — captions and hints.</p>
          <p className="m-0 font-mono text-[15px] text-[var(--ink)]">
            Mono — {money(1250)} · {toE164('07700 900123')} · N17 9LP · {shortDate('2026-06-11')}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Stage badges" sub="all AA+" />
        <div className="flex flex-wrap gap-2 p-5">
          {APPLICANT_STAGES.map((s) => (
            <StageBadge key={s} stage={s} />
          ))}
          <Badge>neutral badge</Badge>
        </div>
      </Card>

      <Card>
        <CardHeader title="Buttons" sub="44px min touch targets" />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Button variant="primary" onClick={() => toast('Applicant updated', 'success')}>
            Confirm and update Lubna
          </Button>
          <Button variant="brass" onClick={() => toast('Brass action fired')}>
            Paste a screenshot
          </Button>
          <Button onClick={() => toast('Secondary action')}>Review later</Button>
          <Button variant="ghost">Dismiss</Button>
          <Button variant="danger" onClick={() => toast('Item discarded', 'danger')}>
            Discard item
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="The Keel Line" sub="§7.3 — the one flourish" />
          <div className="p-5">
            <KeelLine current="offer" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Fields" />
          <div className="flex flex-col gap-4 p-5">
            <Field label="Full name" placeholder="Lubna Hassan" />
            <Field label="Phone" mono placeholder="+44 7700 900123" hint="Normalised to E.164" />
          </div>
        </Card>
      </div>
    </div>
  );
}

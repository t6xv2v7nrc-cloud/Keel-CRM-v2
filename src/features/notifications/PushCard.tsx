import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { pushState, sendTestPush, turnOffPush, turnOnPush } from '../../lib/push';
import type { PushState } from '../../lib/push';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const WORDS: Record<PushState['kind'], string> = { on: 'On on this device', off: 'Off on this device', blocked: 'Blocked in this browser', unsupported: 'Not available here' };

/** My settings: notifications on this device, sent when Keel is closed. */
export function PushCard() {
  const { toast } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | null>(null);
  useEffect(() => { pushState().then(setState, () => setState({ kind: 'unsupported', why: 'Could not check this device.' })); }, []);
  const run = async (what: 'on' | 'off' | 'test') => {
    setBusy(what);
    try {
      if (what === 'test') {
        const n = await sendTestPush();
        toast(n ? `Test sent to ${n} ${n === 1 ? 'device' : 'devices'}` : 'No device to send to: turn notifications on first', n ? 'success' : 'danger');
      } else {
        const next = what === 'on' ? await turnOnPush() : await turnOffPush();
        setState(next);
        if (what === 'on') toast(next.kind === 'on' ? 'Notifications on for this device' : next.kind === 'blocked' ? 'Notifications were blocked' : 'Not turned on', next.kind === 'on' ? 'success' : 'danger');
        else toast('Notifications off for this device', 'success');
      }
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  };
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <Card id="notifications" fold="settings.notifications" startsFolded className="scroll-mt-28">
      <CardHeader icon="bell" title="Notifications on this device" help="notifications" sub={state ? WORDS[state.kind] : 'Checking…'} />
      <div className="flex flex-col gap-3 p-5 text-[15px]">
        <p className="m-0 text-[var(--ink-muted)]">When Keel is closed, a notification tells you when something needs you. The bell at the top shows the same while Keel is open.</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px] text-[var(--ink)]">
          {[
            ['inbox', 'Something new in the Bin, like a nomination from Outlook'],
            ['mail', 'A nomination waiting on its first reply, and officers emailing about a client'],
            ['calendar', 'A viewing within the hour, then asking how it went'],
            ['sparkle', 'A client back from ice, and a short summary each working morning'],
          ].map(([icon, words]) => (
            <li key={words} className="flex items-start gap-2"><Icon name={icon as 'inbox'} size={15} className="mt-[3px] text-[var(--accent)]" />{words}</li>
          ))}
        </ul>
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">First names and short addresses only, as they can show on a locked screen.</p>

        {state?.kind === 'unsupported' && (
          <div className="rounded-md px-3 py-2.5 text-[14px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
            <p className="m-0 font-semibold">{state.why}</p>
            {ios && (
              <ol className="m-0 mt-1.5 flex list-decimal flex-col gap-1 pl-5">
                <li>Open keelcrm.netlify.app in Safari.</li>
                <li>Tap the Share button, then <strong>Add to Home Screen</strong>.</li>
                <li>Open Keel from its icon on your Home Screen and sign in.</li>
                <li>Come back here and press <strong>Turn on notifications</strong>.</li>
              </ol>
            )}
          </div>
        )}
        {state?.kind === 'blocked' && (
          <p className="m-0 rounded-md px-3 py-2.5 text-[14px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
            This browser has been told not to show Keel's notifications. Allow them for keelcrm.netlify.app in the browser's site settings (on an iPhone: Settings, Notifications, Keel), then come back.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {state?.kind === 'off' && <Button variant="primary" className={small} busy={busy === 'on'} onClick={() => run('on')}><Icon name="bell" size={14} />Turn on notifications</Button>}
          {state?.kind === 'on' && (
            <>
              <Button className={small} busy={busy === 'test'} onClick={() => run('test')}>Send me a test</Button>
              <Button variant="ghost" className={small} busy={busy === 'off'} onClick={() => run('off')}>Turn off on this device</Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

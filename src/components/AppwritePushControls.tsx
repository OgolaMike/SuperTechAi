import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  disableAppwritePush, enableAppwritePush, getPushState, isAppwritePushEnabled, sendAppwritePushTest,
  type AppwritePushState,
} from '@/lib/appwritePush';

export function AppwritePushControls() {
  const [state, setState] = useState<AppwritePushState>('off');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = getPushState();
      setState(next);
      if (next === 'off' || next === 'on') {
        try {
          const active = await isAppwritePushEnabled();
          if (!cancelled) { setEnabled(active); setState(active ? 'on' : 'off'); }
        } catch (error) {
          if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not check this device registration.');
        }
      }
    };
    void refresh();
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    setBusy(true); setMessage('');
    try {
      await enableAppwritePush();
      setEnabled(true); setState('on');
      setMessage('This device is registered. Send a test to confirm delivery.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not enable push notifications.');
      setState(getPushState());
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setMessage('');
    try { await disableAppwritePush(); setEnabled(false); setState('off'); setMessage('Push notifications are disabled on this device.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not disable push notifications.'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setMessage('');
    try {
      const delivered = await sendAppwritePushTest();
      setMessage(delivered > 0 ? 'Test sent successfully. Check your Android notification tray.' : 'No active device received the test.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Test notification failed.'); }
    finally { setBusy(false); }
  };

  const unsupported = state === 'unsupported';
  const blocked = state === 'blocked';
  return (
    <section className="mt-8 rounded-2xl border border-line/15 bg-surface/[.035] p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          {enabled ? <Bell className="h-5 w-5"/> : <BellOff className="h-5 w-5"/>}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">Push notifications</h2>
          <p className="mt-1 text-sm leading-6 text-ink-2">
            {unsupported ? 'This browser does not support web push.' : blocked ? 'Android has blocked notifications for this site. Allow them in Android site settings.' : enabled ? 'This device is registered with your Appwrite account.' : 'Register this device to receive alerts when SuperTech AI is not open.'}
          </p>
        </div>
        {enabled && <CheckCircle2 className="h-5 w-5 shrink-0 text-up"/>}
      </div>
      {message && <p role="status" className="mt-4 rounded-xl border border-line/10 bg-surface/[.04] px-3 py-2 text-sm text-ink-2">{message}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {!enabled ? <button type="button" disabled={busy || unsupported || blocked} onClick={enable} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-canvas disabled:opacity-40">
          {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : <Bell className="mr-2 inline h-4 w-4"/>} Enable on this device
        </button> : <>
          <button type="button" disabled={busy} onClick={test} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-canvas disabled:opacity-40">
            {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : <Send className="mr-2 inline h-4 w-4"/>} Send test notification
          </button>
          <button type="button" disabled={busy} onClick={disable} className="rounded-xl border border-line/20 px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-40">Turn off</button>
        </>}
      </div>
      <p className="mt-4 text-xs leading-5 text-ink-3">For delivery while the app is closed, keep Android notifications enabled for this site or installed app. Battery restrictions may delay background delivery.</p>
    </section>
  );
}

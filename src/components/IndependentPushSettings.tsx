import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  getIndependentPushStatus, getIndependentPushPublicKey, registerIndependentPushSubscription,
  removeIndependentPushSubscription, sendIndependentPushTest,
} from '@/lib/independentApi';

type State = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on' | 'working';
function decodeVapidKey(value: string): Uint8Array {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export function IndependentPushSettings() {
  const [state, setState] = useState<State>('checking');
  const [devices, setDevices] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    void getIndependentPushStatus().then(async result => {
      if (!active) return;
      setDevices(result.devices);
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      setState(result.enabled && subscription ? 'on' : 'off');
    }).catch(cause => {
      if (active) { setState('off'); setError(cause instanceof Error ? cause.message : 'Could not check push status.'); }
    });
    return () => { active = false; };
  }, []);

  const enable = async () => {
    setState('working'); setError(''); setMessage('');
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('This browser does not support push notifications.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        throw new Error('Allow notifications for SuperTech AI in Android site settings, then try again.');
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { publicKey } = await getIndependentPushPublicKey();
      if (!publicKey) throw new Error('Push service public key is not configured yet.');
      const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Android returned an incomplete push subscription.');
      await registerIndependentPushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      const result = await getIndependentPushStatus();
      setDevices(result.devices); setState('on');
      setMessage('This device is registered. Send a test notification to verify delivery.');
    } catch (cause) {
      setState(Notification.permission === 'denied' ? 'blocked' : 'off');
      setError(cause instanceof Error ? cause.message : 'Could not enable push notifications.');
    }
  };

  const test = async () => {
    setState('working'); setError(''); setMessage('');
    try {
      const result = await sendIndependentPushTest();
      setState('on');
      setMessage(`Test sent to ${result.sent} device(s). Check your Android notification tray.`);
    } catch (cause) {
      setState('on');
      setError(cause instanceof Error ? cause.message : 'Test notification failed.');
    }
  };

  const disable = async () => {
    setState('working'); setError(''); setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await removeIndependentPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setDevices(0); setState('off'); setMessage('Push notifications are disabled on this device.');
    } catch (cause) {
      setState('on');
      setError(cause instanceof Error ? cause.message : 'Could not disable push notifications.');
    }
  };

  const statusText: Record<State, string> = {
    checking: 'Checking this device…',
    unsupported: 'This browser does not support web push.',
    blocked: 'Notifications are blocked in Android or browser settings.',
    off: 'This device is not registered for push notifications.',
    on: `Push notifications are enabled · ${devices} registered device(s)`,
    working: 'Working…',
  };
  const busy = state === 'checking' || state === 'working';

  return <section className="mt-6 rounded-2xl border border-cyan-300/15 bg-[#0b1724] p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
        {state === 'on' ? <Bell size={20}/> : <BellOff size={20}/>}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-white">Android push notifications</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">{statusText[state]}</p>
      </div>
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
    {message && <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200"><CheckCircle2 size={15} className="mt-0.5 shrink-0"/>{message}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {state === 'on' ? <>
        <button type="button" onClick={() => void test()} disabled={busy} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">
          {busy ? <Loader2 className="mr-2 inline animate-spin" size={14}/> : <Send className="mr-2 inline" size={14}/>} Send test notification
        </button>
        <button type="button" onClick={() => void disable()} disabled={busy} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-300 disabled:opacity-50">Disable on this device</button>
      </> : <button type="button" onClick={() => void enable()} disabled={busy || state === 'unsupported' || state === 'blocked'} className="rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">
        {busy && <Loader2 className="mr-2 inline animate-spin" size={14}/>} Enable push notifications
      </button>}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-slate-500">Push delivery is separate from in-app alerts. The test verifies the device subscription and push provider while SuperTech AI is in the background.</p>
  </section>;
}

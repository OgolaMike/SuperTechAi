import { supabase } from '@/lib/supabase';

export type BoolPrefKey = 'signals' | 'targets' | 'stops' | 'limitOrders' | 'pendingOrders' | 'superSignals' | 'income' | 'business';

export type PushPrefs = Record<BoolPrefKey, boolean> & {
  symbols: string[] | null;
};

export const DEFAULT_PUSH_PREFS: PushPrefs = { signals: false, targets: false, stops: false, limitOrders: false, pendingOrders: false, superSignals: false, income: false, business: false, symbols: [] };

const PUSH_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/push`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToBytes(base64: string): BufferSource {
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function fetchPublicKey(): Promise<string> {
  const response = await fetch(PUSH_URL, {
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  });
  if (!response.ok) throw new Error(`Push setup is not ready (status ${response.status})`);
  const body = await response.json();
  if (typeof body?.publicKey !== 'string') throw new Error('Push setup returned an unexpected response');
  return body.publicKey;
}

async function postPushAction(payload: Record<string, unknown>, accessToken?: string): Promise<void> {
  const response = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken ?? ANON_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Notification server responded with status ${response.status}`);
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function saveSubscription(subscription: PushSubscription, prefs: PushPrefs): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to enable personal alerts.');
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Browser returned an incomplete subscription');
  await postPushAction({
    action: 'subscribe',
    subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    prefs,
  }, accessToken);
}

// Creates or reuses the browser subscription, then stores it on the server. Must be called from a user click.
export async function enablePush(prefs: PushPrefs): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(await fetchPublicKey()),
    }));
  await saveSubscription(subscription, prefs);
}

// Re-sends the current subscription so the server keeps fresh keys and preferences.
export async function refreshPush(prefs: PushPrefs): Promise<void> {
  const subscription = await getActiveSubscription();
  if (subscription) await saveSubscription(subscription, prefs);
}

export async function disablePush(): Promise<void> {
  const subscription = await getActiveSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to manage alerts.');
  await postPushAction({ action: 'unsubscribe', endpoint }, accessToken);
  await subscription.unsubscribe();
}

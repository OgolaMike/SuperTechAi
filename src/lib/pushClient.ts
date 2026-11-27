import {
  getIndependentPushPublicKey,
  registerIndependentPushSubscription,
  removeIndependentPushSubscription,
} from '@/lib/independentApi';

export type BoolPrefKey = 'signals' | 'targets' | 'stops' | 'limitOrders' | 'pendingOrders' | 'superSignals' | 'income' | 'business';

export type PushPrefs = Record<BoolPrefKey, boolean> & {
  symbols: string[] | null;
};

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  signals: false, targets: false, stops: false, limitOrders: false,
  pendingOrders: false, superSignals: false, income: false, business: false, symbols: [],
};

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToBytes(base64: string): BufferSource {
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function fetchPublicKey(): Promise<string> {
  const body = await getIndependentPushPublicKey();
  if (typeof body.publicKey !== 'string' || !body.publicKey) {
    throw new Error('The Appwrite notification service did not return a push key.');
  }
  return body.publicKey;
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function saveSubscription(subscription: PushSubscription, _prefs: PushPrefs): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser returned an incomplete push subscription.');
  }
  await registerIndependentPushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

// Browser permission must be requested from a direct user action.
export async function enablePush(prefs: PushPrefs): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site.');

  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(await fetchPublicKey()),
    }));
  await saveSubscription(subscription, prefs);
}

export async function refreshPush(prefs: PushPrefs): Promise<void> {
  const subscription = await getActiveSubscription();
  if (subscription) await saveSubscription(subscription, prefs);
}

export async function disablePush(): Promise<void> {
  const subscription = await getActiveSubscription();
  if (!subscription) return;
  await removeIndependentPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}

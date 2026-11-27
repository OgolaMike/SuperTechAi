import { appwriteAccount, appwriteRequest } from '@/lib/appwrite';

export type AppwritePushState = 'unsupported' | 'blocked' | 'off' | 'on';

type StoredDevice = {
  id: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  updatedAt: string;
};

type StoredPush = {
  enabled: boolean;
  devices: StoredDevice[];
};

const FUNCTION_ID = import.meta.env.VITE_APPWRITE_PUSH_FUNCTION_ID as string | undefined;
const PUBLIC_KEY = import.meta.env.VITE_APPWRITE_PUSH_VAPID_PUBLIC_KEY as string | undefined;
const PREFS_PATH = '/account/prefs';

export function getPushState(): AppwritePushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return 'off';
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function readPrefs(): Promise<Record<string, unknown>> {
  return appwriteRequest<Record<string, unknown>>(PREFS_PATH);
}

async function writePushPrefs(next: StoredPush): Promise<void> {
  const prefs = await readPrefs();
  await appwriteRequest(PREFS_PATH, { method: 'PUT', body: { ...prefs, supertechPush: next } });
}

async function callPushFunction(action: 'test'): Promise<{ ok: boolean; delivered?: number; error?: string }> {
  if (!FUNCTION_ID) throw new Error('The Appwrite push function has not been configured for this deployment.');
  const { jwt } = await appwriteAccount.createJWT();
  const execution = await appwriteRequest<{ responseBody?: string; status?: string }>(
    `/functions/${encodeURIComponent(FUNCTION_ID)}/executions`,
    {
      method: 'POST',
      headers: { 'X-Appwrite-JWT': jwt },
      body: { body: JSON.stringify({ action }), async: false, path: '/', method: 'POST' },
    },
  );
  if (execution.responseBody) {
    let result: { ok?: boolean; delivered?: number; error?: string };
    try { result = JSON.parse(execution.responseBody); } catch { throw new Error('Push service returned an unreadable response.'); }
    if (!result.ok) throw new Error(result.error || 'The test notification could not be delivered.');
    return { ok: true, delivered: result.delivered };
  }
  throw new Error('Push service did not return a completed delivery result.');
}

export async function enableAppwritePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('This browser does not support web push notifications.');
  }
  if (!PUBLIC_KEY) throw new Error('The Appwrite push public key is missing from the deployment configuration.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in Android site settings, then try again.');

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(PUBLIC_KEY) as BufferSource });
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys?.auth) throw new Error('Android returned an incomplete push subscription.');

  const prefs = await readPrefs();
  const current = (prefs.supertechPush && typeof prefs.supertechPush === 'object' ? prefs.supertechPush : {}) as Partial<StoredPush>;
  const devices = Array.isArray(current.devices) ? current.devices : [];
  const id = await deviceId(value.endpoint);
  const device: StoredDevice = {
    id,
    subscription: { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } },
    updatedAt: new Date().toISOString(),
  };
  await appwriteRequest(PREFS_PATH, {
    method: 'PUT',
    body: { ...prefs, supertechPush: { enabled: true, devices: [...devices.filter((item) => item.id !== id), device] } },
  });
}

async function deviceId(endpoint: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function disableAppwritePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  const prefs = await readPrefs();
  const current = (prefs.supertechPush && typeof prefs.supertechPush === 'object' ? prefs.supertechPush : {}) as Partial<StoredPush>;
  const endpoint = subscription?.endpoint;
  const devices = Array.isArray(current.devices) ? current.devices.filter((item) => item.subscription?.endpoint !== endpoint) : [];
  await appwriteRequest(PREFS_PATH, { method: 'PUT', body: { ...prefs, supertechPush: { enabled: devices.length > 0, devices } } });
  await subscription?.unsubscribe();
}

export async function sendAppwritePushTest(): Promise<number> {
  const result = await callPushFunction('test');
  return result.delivered ?? 0;
}

export async function isAppwritePushEnabled(): Promise<boolean> {
  const prefs = await readPrefs();
  const push = prefs.supertechPush as Partial<StoredPush> | undefined;
  if (!push?.enabled || !Array.isArray(push.devices)) return false;
  const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  return Boolean(subscription && push.devices.some((device) => device.subscription?.endpoint === subscription.endpoint));
}

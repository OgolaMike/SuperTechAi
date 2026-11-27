import { appwriteRequest } from '@/lib/appwrite';

const apiBase = (import.meta.env.VITE_INDEPENDENT_API_URL || 'https://supertechai-independent-api.mikedavid45.workers.dev').replace(/\/$/, '');

type ApiIdentity = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type IndependentProfile = {
  id: string;
  displayName: string;
  onboardingStatus: string;
};

async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new Error('The independent API has not been configured for this deployment.');

  const jwt = await appwriteRequest<{ jwt: string }>('/account/jwts', {
    method: 'POST',
    body: {},
  });

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt.jwt}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'The independent service could not complete your request.');
  }
  return payload as T;
}

export function getIndependentApiIdentity(): Promise<ApiIdentity> {
  return authenticatedRequest<ApiIdentity>('/api/me');
}

export function getIndependentProfile(): Promise<IndependentProfile> {
  return authenticatedRequest<IndependentProfile>('/api/profile');
}

export function updateIndependentProfile(displayName: string): Promise<IndependentProfile> {
  return authenticatedRequest<IndependentProfile>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export type CTraderConnectionStatus = {
  connected: boolean;
  status: string;
  tokenExpiresAt?: string | null;
};

export function getCTraderConnectionStatus(): Promise<CTraderConnectionStatus> {
  return authenticatedRequest<CTraderConnectionStatus>('/api/brokers/ctrader/status');
}

export function startCTraderConnection(redirectPath = '/'): Promise<{ authorizationUrl: string; expiresAt: string }> {
  return authenticatedRequest<{ authorizationUrl: string; expiresAt: string }>('/api/brokers/ctrader/connect', {
    method: 'POST',
    body: JSON.stringify({ redirectPath }),
  });
}

export function refreshCTraderConnection(): Promise<{ connected: boolean; refreshed: boolean; tokenExpiresAt?: string; status?: string }> {
  return authenticatedRequest<{ connected: boolean; refreshed: boolean; tokenExpiresAt?: string; status?: string }>('/api/brokers/ctrader/refresh', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function disconnectCTraderConnection(): Promise<{ disconnected: boolean; providerTokenRevoked: false; note: string }> {
  return authenticatedRequest<{ disconnected: boolean; providerTokenRevoked: false; note: string }>('/api/brokers/ctrader/disconnect', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export type PushSetup = { publicKey: string };
export type PushTestResult = { sent: number; total: number };

export function getPushSetup(): Promise<PushSetup> {
  return authenticatedRequest<PushSetup>('/api/push/config');
}

export function savePushSubscription(endpoint: string): Promise<{ subscribed: boolean }> {
  return authenticatedRequest<{ subscribed: boolean }>('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  });
}

export function sendPushTest(): Promise<PushTestResult> {
  return authenticatedRequest<PushTestResult>('/api/push/test', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function enableDevicePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('This browser does not support web push notifications.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission is blocked. Allow notifications for SuperTech AI in Android site settings.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const setup = await getPushSetup();
  const decode = (value: string) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  };
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decode(setup.publicKey),
  });
  await savePushSubscription(subscription.endpoint);
}

export type MemberReferralProfile = {
  assigned: boolean;
  referralCode?: string;
  sponsorUserId?: string;
  teamOwnerId?: string;
  role?: 'member' | 'owner';
  status?: string;
  reason?: string;
};
export type MemberNetwork = {
  teamOwnerId: string;
  directCount: number;
  teamCount: number;
  members: Array<{ memberId: string; sponsorId: string; role: string; joinedAt: string }>;
};
export function getMemberReferralProfile(): Promise<MemberReferralProfile> {
  return authenticatedRequest<MemberReferralProfile>('/api/referrals/me');
}
export function activateMemberReferral(referralCode: string): Promise<MemberReferralProfile> {
  return authenticatedRequest<MemberReferralProfile>('/api/referrals/activate', {
    method: 'POST',
    body: JSON.stringify({ referralCode }),
  });
}
export function getMemberNetwork(): Promise<MemberNetwork> {
  return authenticatedRequest<MemberNetwork>('/api/referrals/network');
}

export type MembershipStatus = { status: 'pending' | 'approved' | 'rejected' | 'suspended'; planCode: 'free' | 'standard_300' | 'automation_500'; isAdmin: boolean; createdAt?: string; reviewedAt?: string | null; reviewNote?: string | null };
export type AdminMember = { userId: string; email: string; status: string; planCode: string; createdAt: string; reviewedAt: string | null; reviewedBy: string | null; reviewNote: string };
export function getMembershipStatus(): Promise<MembershipStatus> { return authenticatedRequest<MembershipStatus>('/api/membership/status'); }
export async function listAdminMembers(): Promise<AdminMember[]> { const result = await authenticatedRequest<{members: AdminMember[]}>('/api/admin/members'); return result.members; }
export function reviewMembership(userId: string, action: 'approve' | 'reject' | 'suspend', planCode: 'free' | 'standard_300' | 'automation_500' = 'free', note = ''): Promise<{updated: boolean}> {
 return authenticatedRequest('/api/admin/members/' + encodeURIComponent(userId), { method: 'POST', body: JSON.stringify({ action, planCode, note }) });
}


export type IndependentAlertMode = 'full' | 'bubble' | 'muted';
export type IndependentAlertPreferences = {
  categories: Record<string, IndependentAlertMode>;
  assets: Record<string, IndependentAlertMode>;
  defaultAssetMode: IndependentAlertMode;
  updatedAt: string | null;
};
export function getIndependentAlertPreferences(): Promise<IndependentAlertPreferences> {
  return authenticatedRequest<IndependentAlertPreferences>('/api/preferences/alerts');
}
export function updateIndependentAlertPreferences(
  preferences: Partial<Pick<IndependentAlertPreferences, 'categories' | 'assets' | 'defaultAssetMode'>>,
): Promise<IndependentAlertPreferences> {
  return authenticatedRequest<IndependentAlertPreferences>('/api/preferences/alerts', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });
}

export type IndependentSignalRecord = {
  signal_key: string; symbol: string; asset_name: string; timeframe: string; granularity: number;
  digits: number; direction: 'BUY' | 'SELL'; signal_epoch: number; entry: number; stop_loss: number;
  tp1: number; tp2: number; tp3: number; band_mean: number; band_deviation: number;
  tp1_hit_epoch: number | null; tp2_hit_epoch: number | null; tp3_hit_epoch: number | null;
  sl_hit_epoch: number | null; status: 'Open' | 'TP1' | 'TP2' | 'TP3' | 'Stopped'; closed: boolean;
};
export async function getIndependentSignalRecords(): Promise<IndependentSignalRecord[]> {
  const result = await authenticatedRequest<{ rows: IndependentSignalRecord[] }>('/api/signals/history');
  return result.rows;
}
export async function saveIndependentSignalRecords(rows: IndependentSignalRecord[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 100) {
    await authenticatedRequest<{ saved: number }>('/api/signals/history', {
      method: 'POST',
      body: JSON.stringify({ rows: rows.slice(index, index + 100) }),
    });
  }
}

export type IndependentPayment = { id: string; planCode: string; amountUsd: number; currency: string; reference: string; status: string; submittedAt: string; reviewedAt?: string | null; reviewNote?: string | null };
export function listMyIndependentPayments(): Promise<{ payments: IndependentPayment[] }> {
  return authenticatedRequest('/api/payments/me');
}
export function submitIndependentPayment(planCode: 'standard_300' | 'automation_500', transactionReference: string): Promise<{ submitted: boolean; payment: { id: string; planCode: string; amountUsd: number; status: string } }> {
  return authenticatedRequest('/api/payments/submit', { method: 'POST', body: JSON.stringify({ planCode, currency: 'USDT-TRC20', transactionReference }) });
}
export type IndependentAdminPayment = IndependentPayment & { userId: string };
export function listIndependentAdminPayments(): Promise<{ payments: IndependentAdminPayment[] }> {
  return authenticatedRequest('/api/admin/payments');
}
export function reviewIndependentPayment(id: string, action: 'approve' | 'reject', note = ''): Promise<{ updated: boolean; status: string }> {
  return authenticatedRequest('/api/admin/payments/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify({ action, note }) });
}

export type IndependentAcademyProgress = { lessonId: string; progress: number; completedAt: string | null; updatedAt: string };
export function getIndependentAcademyProgress(): Promise<{ lessons: IndependentAcademyProgress[] }> {
  return authenticatedRequest('/api/academy/progress');
}
export function saveIndependentAcademyProgress(lessonId: string, progress: number): Promise<IndependentAcademyProgress> {
  return authenticatedRequest('/api/academy/progress', { method: 'PUT', body: JSON.stringify({ lessonId, progress }) });
}

export type IndependentLedgerEntry = { type: string; amount: number; currency: string; referenceId: string; status: string; createdAt: string };
export function getIndependentFinancialLedger(): Promise<{ entries: IndependentLedgerEntry[] }> {
  return authenticatedRequest('/api/finance/ledger');
}

export type IndependentCommission = { id: string; type: string; level: number | null; amount: number; currency: string; status: string; sourceUserId: string; referenceId: string; createdAt: string };
export function getIndependentCommissions(): Promise<{ commissions: IndependentCommission[] }> {
 return authenticatedRequest('/api/finance/commissions');
}

import { appwriteRequest } from '@/lib/appwrite';

const apiBase = (import.meta.env.VITE_INDEPENDENT_API_URL || '').replace(/\/$/, '');

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

export type CTraderAccount = {
  accountId: string;
  isLive: boolean;
  traderLogin: string | null;
  broker: string;
  accountType: string | null;
  permissionScope: string;
};

export type CTraderConnectionStatus = {
  connected: boolean;
  status: string;
  tokenExpiresAt?: string | null;
  accounts?: CTraderAccount[];
  selectedAccountId?: string | null;
  permissionScope?: string | null;
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

export function discoverCTraderAccounts(): Promise<{ accounts: CTraderAccount[]; permissionScope: string; tradingEnabled: false }> {
  return authenticatedRequest<{ accounts: CTraderAccount[]; permissionScope: string; tradingEnabled: false }>('/api/brokers/ctrader/discover', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function selectCTraderAccount(accountId: string): Promise<{ selectedAccount: CTraderAccount; tradingEnabled: false }> {
  return authenticatedRequest<{ selectedAccount: CTraderAccount; tradingEnabled: false }>('/api/brokers/ctrader/select-account', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
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

export function fetchIndependentSignalRecords(): Promise<{ records: Array<Record<string, unknown>> }> {
  return authenticatedRequest<{ records: Array<Record<string, unknown>> }>('/api/signals');
}

export function upsertIndependentSignalRecords(records: Array<Record<string, unknown>>): Promise<{ saved: number }> {
  return authenticatedRequest<{ saved: number }>('/api/signals', {
    method: 'POST',
    body: JSON.stringify({ records }),
  });
}

export type IndependentAlertPreferences = {
  categories: Record<string, string>;
  assets: Record<string, string>;
  defaultAssetMode: string;
};

export function fetchIndependentAlertPreferences(): Promise<{ settings: IndependentAlertPreferences; exists: boolean }> {
  return authenticatedRequest<{ settings: IndependentAlertPreferences; exists: boolean }>('/api/alert-preferences');
}

export function saveIndependentAlertPreferences(settings: IndependentAlertPreferences): Promise<{ settings: IndependentAlertPreferences }> {
  return authenticatedRequest<{ settings: IndependentAlertPreferences }>('/api/alert-preferences', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export function fetchIndependentSuperSignalRecords(): Promise<{ records: Array<Record<string, unknown>> }> {
  return authenticatedRequest<{ records: Array<Record<string, unknown>> }>('/api/super-signals');
}

export function upsertIndependentSuperSignalRecords(records: Array<Record<string, unknown>>): Promise<{ saved: number }> {
  return authenticatedRequest<{ saved: number }>('/api/super-signals', { method: 'POST', body: JSON.stringify({ records }) });
}

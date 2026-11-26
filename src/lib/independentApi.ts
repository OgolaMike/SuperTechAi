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

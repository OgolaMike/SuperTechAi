import { appwriteRequest } from '@/lib/appwrite';

const apiBase = (import.meta.env.VITE_INDEPENDENT_API_URL || '').replace(/\\/$/, '');

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

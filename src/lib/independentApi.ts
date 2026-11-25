import { appwriteRequest } from '@/lib/appwrite';

const apiBase = (import.meta.env.VITE_INDEPENDENT_API_URL || '').replace(/\/$/, '');

type ApiIdentity = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export async function getIndependentApiIdentity(): Promise<ApiIdentity> {
  if (!apiBase) throw new Error('The independent API has not been configured for this deployment.');

  const jwt = await appwriteRequest<{ jwt: string }>('/account/jwts', {
    method: 'POST',
    body: {},
  });

  const response = await fetch(`${apiBase}/api/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwt.jwt}` },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not verify your independent platform session.');
  }
  return payload as ApiIdentity;
}

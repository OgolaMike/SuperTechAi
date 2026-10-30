export type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
  isApproved: boolean;
};

const ADMIN_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/admin-users`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function adminRequest(accessToken: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<unknown> {
  const response = await fetch(ADMIN_URL, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (status ${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function fetchAdminUsers(accessToken: string): Promise<AdminUser[]> {
  const payload = (await adminRequest(accessToken, { method: 'GET' })) as { users?: unknown };
  if (!Array.isArray(payload?.users)) throw new Error('The user list came back in an unexpected format');
  return payload.users as AdminUser[];
}

export type AccessChange = { admin?: boolean; approved?: boolean };

export async function updateUserAccess(accessToken: string, userId: string, change: AccessChange): Promise<void> {
  await adminRequest(accessToken, { method: 'POST', body: { userId, ...change } });
}

import { supabase } from '@/lib/supabase';

export type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  confirmationSentAt: string | null;
  isAdmin: boolean;
  isApproved: boolean;
};

async function adminRequest(
  accessToken: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    method: init.method,
    ...(init.body !== undefined ? { body: init.body } : {}),
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const payload = context && typeof context.json === 'function'
      ? await context.clone().json().catch(() => null)
      : null;
    const message = typeof payload?.error === 'string' ? payload.error : error.message || 'The member administration service is unavailable.';
    throw new Error(message);
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') throw new Error(data.error);
  return data;
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

export async function resendMemberConfirmation(accessToken: string, user: AdminUser): Promise<void> {
  if (user.emailConfirmed) throw new Error('This member\'s email is already verified.');
  const key = `supertech-admin-resend:${user.id}`;
  const sentAt = Number(localStorage.getItem(key) || 0);
  const remaining = Math.ceil((sentAt + 60_000 - Date.now()) / 1000);
  if (remaining > 0) throw new Error(`Please wait ${remaining} seconds before resending to this member.`);
  localStorage.setItem(key, String(Date.now()));
  await adminRequest(accessToken, { method: 'POST', body: { action: 'resend-confirmation', userId: user.id } });
}

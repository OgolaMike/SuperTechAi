// Appwrite client for the independent SuperTech AI platform.
// Production requests use the same-origin Pages proxy so Appwrite session
// cookies remain first-party on mobile browsers. Local development can still
// target Appwrite directly.
const endpoint = (
  import.meta.env.DEV
    ? (import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1')
    : '/appwrite'
).replace(/\/$/, '');

const projectId =
  import.meta.env.VITE_APPWRITE_PROJECT_ID || '6b06de46003dde834eb6';

export const appwriteConfigured = Boolean(endpoint && projectId);
export const APPWRITE_ENDPOINT = endpoint;
export const APPWRITE_PROJECT_ID = projectId;

type AppwriteRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

export type AppwriteUser = {
  $id: string;
  $createdAt: string;
  name: string;
  email: string;
  emailVerification: boolean;
  status: boolean;
};

export type AppwriteSession = {
  $id: string;
  userId: string;
  expire: string;
};

export async function appwriteRequest<T>(
  path: string,
  options: AppwriteRequestOptions = {},
): Promise<T> {
  if (!appwriteConfigured) throw new Error('Appwrite is not configured.');

  const response = await fetch(`${endpoint}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      'X-Appwrite-Project': projectId,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload.message === 'string'
      ? payload.message
      : `Appwrite request failed (${response.status}).`;
    const error = new Error(message) as Error & { code?: string; type?: string; response?: unknown };
    error.code = payload?.code;
    error.type = payload?.type;
    error.response = payload;
    throw error;
  }
  return payload as T;
}

const accountPath = '/account';
const callbackUrl = (flow: 'verify' | 'recovery') => {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('auth', flow);
  return url.toString();
};

export const appwriteAccount = {
  get: () => appwriteRequest<AppwriteUser>(accountPath),

  create: async (email: string, password: string, name = '', prefs?: Record<string, unknown>) => {
    const userId = globalThis.crypto?.randomUUID?.();
    if (!userId) throw new Error('Secure account creation is unavailable in this browser. Please update your browser and try again.');
    const user = await appwriteRequest<AppwriteUser>(accountPath, {
      method: 'POST',
      body: { userId, email: email.trim().toLowerCase(), password, name: name.trim() || undefined },
    });
    await appwriteRequest<AppwriteSession>('/account/sessions/email', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
    });
    if (prefs) {
      await appwriteRequest('/account/prefs', {
        method: 'PUT',
        body: { prefs },
      });
    }
    await appwriteRequest('/account/verification', {
      method: 'POST',
      body: { url: callbackUrl('verify') },
    });
    await appwriteRequest<void>('/account/sessions/current', { method: 'DELETE' });
    return user;
  },

  signIn: async (email: string, password: string) => {
    await appwriteRequest<AppwriteSession>('/account/sessions/email', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
    });
    const user = await appwriteRequest<AppwriteUser>(accountPath);
    if (!user.emailVerification) {
      // A valid password proves account access. Use that short-lived session to
      // request a fresh verification message, then always close the session.
      let verificationResent = false;
      try {
        await appwriteRequest('/account/verification', {
          method: 'POST',
          body: { url: callbackUrl('verify') },
        });
        verificationResent = true;
      } catch {
        // Keep the original verification gate in place; the UI will explain
        // that the user should use the most recent message or check spam.
      }
      try {
        await appwriteRequest<void>('/account/sessions/current', { method: 'DELETE' });
      } catch {
        // The verification request is already complete; don't mask its result.
      }
      const error = new Error(
        verificationResent
          ? 'A fresh SuperTech AI verification email has been sent.'
          : 'Your email is not verified yet, and a new verification email could not be sent. Check your inbox and spam folder for the original message.',
      ) as Error & { code?: string; verificationResent?: boolean };
      error.code = 'email_not_confirmed';
      error.verificationResent = verificationResent;
      throw error;
    }
    return user;
  },

  signOut: () => appwriteRequest<void>('/account/sessions/current', { method: 'DELETE' }),

  requestPasswordRecovery: (email: string) =>
    appwriteRequest('/account/recovery', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), url: callbackUrl('recovery') },
    }),

  completePasswordRecovery: (userId: string, secret: string, password: string) =>
    appwriteRequest('/account/recovery', {
      method: 'PUT',
      body: { userId, secret, password, passwordAgain: password },
    }),

  completeEmailVerification: (userId: string, secret: string) =>
    appwriteRequest('/account/verification', {
      method: 'PUT',
      body: { userId, secret },
    }),
};

// Administrative database APIs are intentionally not exposed in the browser.
// Client-side members should only access documents granted to their Appwrite user role.

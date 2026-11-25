// Lightweight Appwrite REST client. Supabase remains the production source of truth.
const endpoint = (
  import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'
).replace(/\/$/, '');

const projectId =
  import.meta.env.VITE_APPWRITE_PROJECT_ID || '6b06de46003dde834eb6';

export const appwriteConfigured = Boolean(endpoint && projectId);
export const APPWRITE_ENDPOINT = endpoint;
export const APPWRITE_PROJECT_ID = projectId;

type AppwriteRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

export async function appwriteRequest<T>(
  path: string,
  options: AppwriteRequestOptions = {},
): Promise<T> {
  if (!appwriteConfigured) {
    throw new Error('Appwrite is not configured.');
  }

  const response = await fetch(`${endpoint}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      'X-Appwrite-Project': projectId,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload.message === 'string'
        ? payload.message
        : `Appwrite request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

// Read-only helpers for the initial parallel-backend verification phase.
export const appwriteAccount = {
  get: () => appwriteRequest<Record<string, unknown>>('/account'),
};

export const appwriteDatabases = {
  list: () => appwriteRequest<{ total: number; databases: unknown[] }>('/databases'),
};

export const appwriteTablesDB = {
  listRows: (databaseId: string, tableId: string) =>
    appwriteRequest<{ total: number; rows: unknown[] }>(
      `/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/rows`,
    ),
};

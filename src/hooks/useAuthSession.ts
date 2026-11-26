import { useCallback, useEffect, useState } from 'react';
import { appwriteAccount, type AppwriteUser } from '@/lib/appwrite';

type AppwriteIdentity = {
  user: {
    id: string;
    email: string;
    emailConfirmed: boolean;
  };
};

type AuthState = {
  ready: boolean;
  session: AppwriteIdentity | null;
  isAdmin: boolean;
  isApproved: boolean;
  accessError: boolean;
  isPasswordRecovery: boolean;
  isEmailConfirmed: boolean;
};

const emptyState: AuthState = {
  ready: false,
  session: null,
  isAdmin: false,
  isApproved: false,
  accessError: false,
  isPasswordRecovery: false,
  isEmailConfirmed: false,
};

function isUnauthenticated(error: unknown): boolean {
  const candidate = error as { code?: number | string; message?: string };
  return candidate?.code === 401 || candidate?.code === '401'
    || /unauthorized|missing.*session|not authenticated/i.test(candidate?.message ?? '');
}

function identity(user: AppwriteUser): AppwriteIdentity {
  return {
    user: {
      id: user.$id,
      email: user.email,
      emailConfirmed: user.emailVerification,
    },
  };
}

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>(emptyState);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get('auth');

    if (flow === 'recovery' && params.get('userId') && params.get('secret')) {
      setState({
        ...emptyState,
        ready: true,
        isPasswordRecovery: true,
      });
      return;
    }

    if (flow === 'verify') {
      const userId = params.get('userId');
      const secret = params.get('secret');
      if (!userId || !secret) {
        setState({ ...emptyState, ready: true, accessError: true });
        return;
      }
      try {
        await appwriteAccount.completeEmailVerification(userId, secret);
        setState({ ...emptyState, ready: true, isEmailConfirmed: true });
      } catch {
        setState({ ...emptyState, ready: true, accessError: true });
      }
      return;
    }

    try {
      const user = await appwriteAccount.get();
      if (!user.emailVerification) {
        await appwriteAccount.signOut().catch(() => undefined);
        setState({ ...emptyState, ready: true });
        return;
      }
      setState({
        ...emptyState,
        ready: true,
        session: identity(user),
      });
    } catch (error) {
      setState({
        ...emptyState,
        ready: true,
        accessError: !isUnauthenticated(error),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const retry = () => { if (navigator.onLine) void refresh(); };
    window.addEventListener('appwrite-auth-changed', retry);
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('appwrite-auth-changed', retry);
      window.removeEventListener('online', retry);
    };
  }, [refresh]);

  return state;
}

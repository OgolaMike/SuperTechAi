import { useCallback, useEffect, useState } from 'react';
import { appwriteAccount, type AppwriteUser } from '@/lib/appwrite';
import { getMembershipAccess } from '@/lib/independentApi';

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
  accessErrorMessage: string | null;
  isPasswordRecovery: boolean;
  isEmailConfirmed: boolean;
};

const emptyState: AuthState = {
  ready: false,
  session: null,
  isAdmin: false,
  isApproved: false,
  accessError: false,
  accessErrorMessage: null,
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
        setState({ ...emptyState, ready: true, accessError: true, accessErrorMessage: 'The verification link is missing its account ID or secure token. Open the newest verification email.' });
        return;
      }
      try {
        await appwriteAccount.completeEmailVerification(userId, secret);
        setState({ ...emptyState, ready: true, isEmailConfirmed: true });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown Appwrite verification error';
        setState({ ...emptyState, ready: true, accessError: true, accessErrorMessage: `Appwrite could not confirm this email: ${detail}` });
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
      const access = await getMembershipAccess();
      // The company mailbox is the configured genesis administrator. Resolve its
      // owner navigation locally as a fallback if the membership-status response
      // is stale; every privileged operation remains independently admin-checked
      // by the Appwrite Worker before it can read or change member records.
      const isCompanyAdmin = user.email.trim().toLowerCase() === 'supertechai.254@gmail.com';
      const isAdmin = access.isAdmin || isCompanyAdmin;
      setState({
        ...emptyState,
        ready: true,
        session: identity(user),
        isApproved: access.approved || isCompanyAdmin,
        isAdmin,
        accessError: !isCompanyAdmin && access.status === 'suspended',
        accessErrorMessage: !isCompanyAdmin && access.status === 'suspended' ? 'This membership is currently suspended. Contact the SuperTech AI team.' : null,
      });
    } catch (error) {
      setState({
        ...emptyState,
        ready: true,
        accessError: !isUnauthenticated(error),
        accessErrorMessage: isUnauthenticated(error) ? null : (error instanceof Error ? error.message : 'The Appwrite account service could not be reached.'),
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

  // Keep pending members in sync with company approval without requiring sign-out.
  useEffect(() => {
    if (!state.session || state.isApproved || state.accessError) return;
    const poll = window.setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 10000);
    return () => window.clearInterval(poll);
  }, [state.session, state.isApproved, state.accessError, refresh]);

  return state;
}

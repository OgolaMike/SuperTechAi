import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthState = {
  ready: boolean;
  session: Session | null;
  isAdmin: boolean;
  isApproved: boolean;
  accessError: boolean;
  isPasswordRecovery: boolean;
  isEmailConfirmed: boolean;
};

async function checkAccess(userId: string): Promise<{ isAdmin: boolean; isApproved: boolean }> {
  const admin = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (admin.error) throw admin.error;
  if (admin.data) return { isAdmin: true, isApproved: true };
  const member = await supabase.from('member_access').select('user_id').eq('user_id', userId).maybeSingle();
  if (member.error) throw member.error;
  return { isAdmin: false, isApproved: member.data !== null };
}

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({
    ready: false,
    session: null,
    isAdmin: false,
    isApproved: false,
    accessError: false,
    isPasswordRecovery: false,
    isEmailConfirmed: false,
  });

  useEffect(() => {
    let active = true;
    let recovery = new URLSearchParams(location.search).get('auth') === 'recovery';
    const emailConfirmed = new URLSearchParams(location.search).get('auth') === 'confirmed';

    const apply = async (session: Session | null, isRecovery = recovery) => {
      recovery = isRecovery;
      if (!session) {
        if (active) setState({
          ready: true, session: null, isAdmin: false, isApproved: false,
          accessError: false, isPasswordRecovery: isRecovery, isEmailConfirmed: emailConfirmed,
        });
        return;
      }
      try {
        const access = await checkAccess(session.user.id);
        if (active) setState({
          ready: true, session, ...access, accessError: false,
          isPasswordRecovery: isRecovery, isEmailConfirmed: emailConfirmed,
        });
      } catch {
        if (active) setState(s => ({
          ...s, ready: true, session, accessError: true,
          isPasswordRecovery: isRecovery, isEmailConfirmed: emailConfirmed,
        }));
      }
    };

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (active) setState(s => ({ ...s, ready: true, accessError: true, isEmailConfirmed: emailConfirmed }));
        return;
      }
      void apply(data.session, recovery);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') void apply(session, true);
      else if (event === 'SIGNED_OUT') void apply(null, false);
      else void apply(session, recovery);
    });

    const retry = () => {
      if (navigator.onLine) void supabase.auth.getSession().then(({ data }) => apply(data.session, recovery));
    };
    window.addEventListener('online', retry);
    return () => {
      active = false;
      window.removeEventListener('online', retry);
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = state.session?.user.id;
    if (!userId || state.isApproved || state.accessError || state.isPasswordRecovery || state.isEmailConfirmed) return;
    let active = true;
    const timer = window.setInterval(() => {
      checkAccess(userId).then(access => {
        if (active) setState(s => s.session?.user.id === userId ? { ...s, ...access, accessError: false } : s);
      }).catch(() => {
        if (active) setState(s => s.session?.user.id === userId ? { ...s, accessError: true } : s);
      });
    }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [state.session?.user.id, state.isApproved, state.accessError, state.isPasswordRecovery, state.isEmailConfirmed]);

  return state;
}

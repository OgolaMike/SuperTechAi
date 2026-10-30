import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthState = {
  ready: boolean;
  session: Session | null;
  isAdmin: boolean;
  isApproved: boolean;
};

async function checkAccess(userId: string): Promise<{ isAdmin: boolean; isApproved: boolean }> {
  const [admin, member] = await Promise.all([
    supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('member_access').select('user_id').eq('user_id', userId).maybeSingle(),
  ]);
  if (admin.error) throw admin.error;
  if (member.error) throw member.error;
  return { isAdmin: admin.data !== null, isApproved: member.data !== null };
}

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({ ready: false, session: null, isAdmin: false, isApproved: false });

  useEffect(() => {
    let active = true;

    const apply = (session: Session | null) => {
      (async () => {
        let access = { isAdmin: false, isApproved: false };
        if (session) {
          try {
            access = await checkAccess(session.user.id);
          } catch {
            access = { isAdmin: false, isApproved: false };
          }
        }
        if (active) setState({ ready: true, session, ...access });
      })();
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => apply(session));

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}

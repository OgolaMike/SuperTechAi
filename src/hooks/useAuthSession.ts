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
  // Check the administrator allow-list first. A member_access query must never
  // accidentally lock an administrator out of the full application.
  const admin = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (admin.error) throw admin.error;
  if (admin.data) return { isAdmin: true, isApproved: true };

  const member = await supabase
    .from('member_access')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (member.error) throw member.error;
  return { isAdmin: false, isApproved: member.data !== null };
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

  useEffect(() => {
    const userId = state.session?.user.id;
    if (!userId || state.isApproved) return;
    let active = true;
    const timer = window.setInterval(() => {
      checkAccess(userId)
        .then((access) => {
          if (active) {
            setState((current) => current.session?.user.id === userId ? { ...current, ...access } : current);
          }
        })
        .catch(() => {
          /* Keep the payment gate open and retry on the next interval. */
        });
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [state.session?.user.id, state.isApproved]);

  return state;
}

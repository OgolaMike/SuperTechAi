import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, UserCheck, UserX, Mail, MailCheck } from 'lucide-react';
import { useSession } from '@/lib/sessionContext';
import { formatLocalDateTime } from '@/lib/localTime';
import { getAdminMembers, setAdminMemberStatus, type AdminMember } from '@/lib/independentApi';

const FOUNDING_TEN = [
  { email: 'sir2mthomas1983@gmail.com', role: 'Member' },
  { email: 'bellwayua14@gmail.com', role: 'Member' },
  { email: 'kalukuamos87@gmail.com', role: 'Member' },
  { email: 'mammdyx@gmail.com', role: 'Member' },
  { email: 'patriciawambui021418@gmail.com', role: 'Admin' },
  { email: 'nelngumba@gmail.com', role: 'Admin' },
  { email: 'josephinewanjiru17@gmail.com', role: 'Admin' },
  { email: 'elishanyindha@gmail.com', role: 'Member' },
  { email: 'annzambezi@gmail.com', role: 'Admin' },
  { email: 'mikedavid45@gmail.com', role: 'Admin' },
] as const;

function formatWhen(iso: string | null): string {
  return iso ? formatLocalDateTime(iso) : 'Never';
}

export function AdminPanel() {
  const { session } = useSession();
  const [users, setUsers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers((await getAdminMembers()).members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => { void load(); }, [load]);

  const changeAccess = async (user: AdminMember, nextStatus: "approved" | "suspended") => {
    setPendingId(user.id); setError(null); setNotice(null);
    try {
      await setAdminMemberStatus(user.id, nextStatus);
      setNotice(nextStatus === "approved" ? `${user.email} is now active.` : `${user.email} has been deactivated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this member');
    } finally { setPendingId(null); }
  };

  const pendingCount = users.filter(user => user.status === 'pending').length;
  const inactiveCount = users.filter(user => user.status === 'suspended' || user.active === false).length;

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin</p>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Member approvals and access</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">Review new membership applications, approve verified members, and activate or deactivate existing accounts. {pendingCount} awaiting approval · {inactiveCount} deactivated.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.05] px-4 py-2 text-sm font-medium text-ink disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-up/30 bg-up/10 px-4 py-3 text-sm text-up">{notice}</div>}

      <div className="rounded-2xl border border-accent/20 bg-surface/[0.035] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Original founding cohort</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Founding 10 members</h3>
        <p className="mt-1 text-sm text-ink-2">Original roster, shown separately from live account records. Missing accounts are not automatically recreated.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs uppercase tracking-wider text-ink-3"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Original role</th><th className="px-3 py-3">Current account</th></tr></thead>
            <tbody>{FOUNDING_TEN.map((founder, index) => {
              const live = users.find(user => user.email.toLowerCase() === founder.email.toLowerCase());
              return <tr key={founder.email} className="border-b border-line/5 last:border-0">
                <td className="px-3 py-3 text-ink-3">{index + 1}</td><td className="px-3 py-3 font-medium text-ink">{founder.email}</td><td className="px-3 py-3 text-ink-2">{founder.role}</td>
                <td className="px-3 py-3">{live ? <span className="text-xs text-ink-2">Found · {live.emailConfirmed ? 'Verified' : 'Unverified'}</span> : <span className="text-xs text-ink-3">Not in Auth records</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      {loading && users.length === 0 ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-line/10 px-4 py-10 text-sm text-ink-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading members</div> : (
        <div className="grid min-w-0 gap-3">
          {users.map(user => {
            const self = user.id === session.user.id;
            const busy = pendingId === user.id;
            return <article key={user.id} className="min-w-0 rounded-2xl border border-line/10 bg-surface/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-ink">{user.email}{self && <span className="ml-2 text-xs font-normal text-ink-3">(you)</span>}</p>
                  <p className="mt-1 text-xs text-ink-3">Joined {formatWhen(user.createdAt)} · Last sign-in {formatWhen(user.lastSignInAt)}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-2">{user.status === 'approved' && user.active !== false ? 'Active' : user.status === 'suspended' || user.active === false ? 'Deactivated' : 'Pending approval'}</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${user.emailConfirmed ? 'border-up/30 bg-up/10 text-up' : 'border-down/25 bg-down/5 text-ink-2'}`}>
                  {user.emailConfirmed ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  {user.emailConfirmed ? 'Email verified' : 'Email unverified'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button"
                  onClick={() => changeAccess(user, user.status === 'approved' && user.active !== false ? 'suspended' : 'approved')}
                  disabled={pendingId !== null || user.isAdmin || self || (user.status === 'pending' && !user.emailConfirmed)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${user.status === 'approved' && user.active !== false ? 'border-down/30 bg-down/10 text-down' : 'border-up/30 bg-up/10 text-up'}`}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : user.status === 'approved' && user.active !== false ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  {user.status === 'pending' ? 'Approve application' : user.status === 'approved' && user.active !== false ? 'Deactivate member' : 'Reactivate member'}
                </button>
                {user.isAdmin && <span className="inline-flex items-center gap-1 text-xs text-accent"><ShieldCheck className="h-3.5 w-3.5" /> Company administrator</span>}
              </div>
              {user.status === 'pending' && !user.emailConfirmed && <p className="mt-2 text-xs text-ink-3">Approval is locked until this member verifies their email address.</p>}
            </article>;
          })}
          {!loading && users.length === 0 && !error && <p className="rounded-2xl border border-line/10 px-4 py-10 text-center text-sm text-ink-2">No members yet.</p>}
        </div>
      )}
    </section>
  );
}

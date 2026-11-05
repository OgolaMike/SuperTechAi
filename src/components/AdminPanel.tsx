import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { useSession } from '@/lib/sessionContext';
import { formatLocalDateTime } from '@/lib/localTime';
import { fetchAdminUsers, updateUserAccess, type AccessChange, type AdminUser } from '@/lib/adminUsers';


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
  if (!iso) return 'Never';
  return formatLocalDateTime(iso);
}

export function AdminPanel() {
  const { session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchAdminUsers(session.access_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    load();
  }, [load]);

  const changeAccess = async (user: AdminUser, change: AccessChange) => {
    setPendingId(user.id);
    setError(null);
    try {
      await updateUserAccess(session.access_token, user.id, change);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this user');
    } finally {
      setPendingId(null);
    }
  };

  const pendingCount = users.filter((user) => !user.isApproved).length;

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Admin</p>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Members and access</h2>
          <p className="max-w-2xl text-sm text-ink-2">
            New accounts wait here until you approve them. Approved members can sign in and use the dashboard. Admins can also manage other members.
            {pendingCount > 0 && ` ${pendingCount} waiting for approval.`}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.05] px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface/[0.09] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}

      <div className="rounded-2xl border border-accent/20 bg-surface/[0.035] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Original founding cohort</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">Founding 10 members</h3>
            <p className="mt-1 text-sm text-ink-2">The original ten accounts are listed here separately from live account records. Missing accounts are not automatically recreated.</p>
          </div>
          <span className="rounded-full border border-line/10 px-3 py-1.5 text-xs font-semibold text-ink-2">10 founding places</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs uppercase tracking-wider text-ink-3">
              <tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Email</th><th className="px-3 py-3">Original role</th><th className="px-3 py-3">Current account record</th></tr>
            </thead>
            <tbody>
              {FOUNDING_TEN.map((founder, index) => {
                const liveUser = users.find((user) => user.email.toLowerCase() === founder.email.toLowerCase());
                return (
                  <tr key={founder.email} className="border-b border-line/5 last:border-0">
                    <td className="px-3 py-3 text-ink-3">{index + 1}</td>
                    <td className="px-3 py-3 font-medium text-ink">{founder.email}{founder.email === session.user.email && <span className="ml-2 text-xs text-ink-3">(you)</span>}</td>
                    <td className="px-3 py-3 text-ink-2">{founder.role}</td>
                    <td className="px-3 py-3">
                      {liveUser ? (
                        <span className="inline-flex rounded-full border border-up/30 bg-up/10 px-2.5 py-1 text-xs font-semibold text-up">Account found · {liveUser.isApproved ? 'Approved' : 'Awaiting approval'}</span>
                      ) : (
                        <span className="inline-flex rounded-full border border-down/25 bg-down/5 px-2.5 py-1 text-xs font-medium text-ink-2">Not in current Auth records</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">This is a founding-member roster, not proof of account activation. The live member table below remains sourced from Supabase.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line/10 bg-surface/[0.03]">
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-ink-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading members
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">Last sign-in</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === session.user.id;
                const busy = pendingId === user.id;
                const adminLocked = isSelf && user.isAdmin;
                const approvalLocked = isSelf && user.isApproved;
                return (
                  <tr key={user.id} className="border-b border-line/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {user.email || 'No email'}
                      {isSelf && <span className="ml-2 text-xs text-ink-3">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{formatWhen(user.createdAt)}</td>
                    <td className="px-4 py-3 text-ink-2">{formatWhen(user.lastSignInAt)}</td>
                    <td className="px-4 py-3">
                      {user.isApproved ? (
                        <button
                          type="button"
                          onClick={() => changeAccess(user, { approved: false })}
                          disabled={approvalLocked || pendingId !== null}
                          title={approvalLocked ? 'You cannot revoke your own access' : 'Revoke access'}
                          className="inline-flex items-center gap-2 rounded-full border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-semibold text-up transition-colors hover:bg-down/10 hover:text-down disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                          Approved
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => changeAccess(user, { approved: true })}
                          disabled={pendingId !== null}
                          className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                          Approve
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => changeAccess(user, { admin: !user.isAdmin })}
                        disabled={adminLocked || pendingId !== null}
                        title={adminLocked ? 'You cannot remove your own admin access' : undefined}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          user.isAdmin
                            ? 'border-accent/40 bg-accent/10 text-accent'
                            : 'border-line/10 bg-surface/[0.02] text-ink-2 hover:text-ink'
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : user.isAdmin ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldOff className="h-3.5 w-3.5" />
                        )}
                        {user.isAdmin ? 'Admin' : 'Member'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && users.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-2">No members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, UserCheck, UserX, ShieldAlert } from 'lucide-react';
import { getAdminMembers, setAdminMemberStatus, type AdminMember } from '@/lib/independentApi';

export function AppwriteMembershipAdmin() {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { const result = await getAdminMembers(); setMembers(result.members); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load member accounts.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const update = async (member: AdminMember, status: 'approved' | 'pending' | 'suspended') => {
    setBusy(member.id); setError(null); setNotice(null);
    try {
      const result = await setAdminMemberStatus(member.id, status);
      setMembers(previous => previous.map(item => item.id === member.id ? { ...item, status: result.status } : item));
      setNotice(`${member.email} updated: ${result.status}.`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Membership update failed.'); }
    finally { setBusy(null); }
  };

  const pending = members.filter(m => m.status === 'pending').length;
  return <section className="mt-8 flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Secure administration</p><h2 className="mt-1 text-xl font-semibold text-ink">Membership approvals</h2><p className="mt-1 text-sm text-ink-2">{pending} pending · {members.length} accounts listed</p></div>
      <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-4 py-2 text-sm text-ink disabled:opacity-50"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}/>Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm text-down">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-up/30 bg-up/10 p-3 text-sm text-up">{notice}</p>}
    {loading && !members.length ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink-2"><Loader2 className="h-4 w-4 animate-spin"/>Loading accounts</div> : members.map(member => <article key={member.id} className="rounded-xl border border-line/15 bg-surface/[.035] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-semibold text-ink">{member.email}</p><p className="mt-1 text-xs text-ink-3">{member.emailConfirmed ? 'Email verified' : 'Email not verified'} · {member.isAdmin ? 'Administrator' : 'Member'}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${member.status === 'approved' ? 'border-up/30 bg-up/10 text-up' : member.status === 'suspended' ? 'border-down/30 bg-down/10 text-down' : 'border-line/15 text-ink-2'}`}>{member.status === 'approved' ? 'Approved' : member.status === 'suspended' ? 'Suspended' : 'Pending'}</span></div>
      {!member.isAdmin && <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy !== null || !member.emailConfirmed} onClick={() => void update(member,'approved')} className="inline-flex items-center gap-1 rounded-full bg-up/10 px-3 py-2 text-xs font-semibold text-up disabled:opacity-40"><UserCheck className="h-3.5 w-3.5"/>Approve</button>
        <button disabled={busy !== null} onClick={() => void update(member,'pending')} className="inline-flex items-center gap-1 rounded-full border border-line/15 px-3 py-2 text-xs font-semibold text-ink-2 disabled:opacity-40"><UserX className="h-3.5 w-3.5"/>Set pending</button>
        <button disabled={busy !== null} onClick={() => void update(member,'suspended')} className="inline-flex items-center gap-1 rounded-full border border-down/20 px-3 py-2 text-xs font-semibold text-down disabled:opacity-40"><ShieldAlert className="h-3.5 w-3.5"/>Suspend</button>
      </div>}
    </article>)}
    {!loading && !members.length && !error && <p className="rounded-xl border border-line/15 p-8 text-center text-sm text-ink-2">No Appwrite accounts found.</p>}
    <p className="text-xs leading-5 text-ink-3">Approval is performed by the secured server. Email-unverified accounts cannot be approved. Administrator accounts are protected from self-revocation.</p>
  </section>;
}

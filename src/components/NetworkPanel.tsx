import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Loader2, Network as NetworkIcon, RefreshCw, Search, Users, UserCheck, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/sessionContext';
import { formatLocalDateTime } from '@/lib/localTime';

type NetworkMember = {
  user_id: string;
  sponsor_user_id: string;
  depth: number;
  referral_code: string;
  created_at: string;
  display_name: string;
  membership_active: boolean;
  approved_at: string | null;
  sponsor_account_code?: string | null;
};
type NetworkResponse = {
  profile: { referral_code: string; sponsor_user_id: string | null };
  members: NetworkMember[];
  allMembers?: NetworkMember[] | null;
};
type TreeProps = {
  member: NetworkMember;
  childrenBySponsor: Map<string, NetworkMember[]>;
  visibleIds: Set<string> | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
};

function MemberNode({ member, childrenBySponsor, visibleIds, expandedIds, onToggle }: TreeProps) {
  const children = childrenBySponsor.get(member.user_id) ?? [];
  const visibleChildren = visibleIds ? children.filter((child) => visibleIds.has(child.user_id)) : children;
  const expanded = expandedIds.has(member.user_id);
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.035] p-3">
        <button type="button" onClick={() => onToggle(member.user_id)} disabled={visibleChildren.length === 0} aria-label={expanded ? 'Collapse member branch' : 'Expand member branch'} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-line/10 text-ink-2 disabled:opacity-30">
          {visibleChildren.length > 0 ? (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <UserRound className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{member.display_name}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${member.membership_active ? 'border-up/30 bg-up/10 text-up' : 'border-line/15 bg-surface/[0.05] text-ink-3'}`}>
              {member.membership_active ? 'Active access' : 'Awaiting activation'}
            </span>
            <span className="rounded-full border border-accent/20 px-2 py-0.5 text-[10px] text-accent">Level {member.depth}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
            <span>Code: {member.referral_code}</span>
            <span>{children.length} direct {children.length === 1 ? 'member' : 'members'}</span>
            <span>Joined {formatLocalDateTime(member.created_at)}</span>
          </div>
        </div>
      </div>
      {expanded && visibleChildren.length > 0 && (
        <div className="ml-4 mt-2 space-y-2 border-l border-accent/20 pl-3 sm:ml-7 sm:pl-4">
          {visibleChildren.map((child) => (
            <MemberNode key={child.user_id} member={child} childrenBySponsor={childrenBySponsor} visibleIds={visibleIds} expandedIds={expandedIds} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NetworkPanel() {
  const { session, isAdmin } = useSession();
  const [members, setMembers] = useState<NetworkMember[]>([]);
  const [allMembers, setAllMembers] = useState<NetworkMember[]>([]);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'structure' | 'members'>('structure');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Your sign-in session has expired. Please sign in again.');
      const { data, error: invokeError } = await supabase.functions.invoke('network', {
        body: {},
        headers: { Authorization: `Bearer ${token}` },
      });
      if (invokeError) {
        const context = (invokeError as { context?: Response }).context;
        const details = context ? await context.clone().json().catch(() => null) : null;
        throw new Error(details?.error || invokeError.message || 'Network service unavailable.');
      }
      if (data?.error) throw new Error(data.error);
      const result = data as NetworkResponse;
      setMembers(result.members ?? []);
      setAllMembers(result.allMembers ?? []);
      setReferralCode(result.profile?.referral_code ?? '');
      setExpandedIds(new Set((result.members ?? []).filter((member) => member.depth === 1).map((member) => member.user_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your network.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const childrenBySponsor = useMemo(() => {
    const map = new Map<string, NetworkMember[]>();
    for (const member of members) {
      const children = map.get(member.sponsor_user_id) ?? [];
      children.push(member);
      map.set(member.sponsor_user_id, children);
    }
    for (const children of map.values()) children.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return map;
  }, [members]);

  const levelCounts = useMemo(() => Array.from({ length: 5 }, (_, index) => ({
    level: index + 1,
    count: members.filter((member) => member.depth === index + 1).length,
  })), [members]);
  const activeCount = members.filter((member) => member.membership_active).length;
  const directCount = childrenBySponsor.get(session.user.id)?.length ?? 0;

  const visibleIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    const visible = new Set<string>();
    for (const member of members) {
      if (member.display_name.toLowerCase().includes(term) || member.referral_code.toLowerCase().includes(term)) {
        let current: NetworkMember | undefined = member;
        while (current && !visible.has(current.user_id)) {
          visible.add(current.user_id);
          current = members.find((candidate) => candidate.user_id === current?.sponsor_user_id);
        }
      }
    }
    return visible;
  }, [members, search]);

  const directoryMembers = isAdmin && mode === 'members' ? allMembers : members;
  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return directoryMembers;
    return directoryMembers.filter((member) => member.display_name.toLowerCase().includes(term) || member.referral_code.toLowerCase().includes(term));
  }, [directoryMembers, search]);

  const referralLink = referralCode ? `${window.location.origin}/?ref=${referralCode}` : '';
  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Clipboard access is unavailable on this device.');
    }
  };
  const toggle = (id: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Member Network</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Your network, clearly connected.</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">Track your direct members, follow the wider structure and find any member in your organisation.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.05] px-4 py-2 text-sm text-ink disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-4"><div className="flex items-center gap-2 text-xs text-ink-3"><UserRound className="h-4 w-4 text-accent" /> Direct members</div><p className="mt-2 text-2xl font-semibold text-ink">{directCount}</p><p className="mt-1 text-xs text-ink-3">People you personally invited</p></div>
        <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-4"><div className="flex items-center gap-2 text-xs text-ink-3"><Users className="h-4 w-4 text-accent" /> Total network</div><p className="mt-2 text-2xl font-semibold text-ink">{members.length}</p><p className="mt-1 text-xs text-ink-3">All connected members below you</p></div>
        <div className="rounded-2xl border border-line/10 bg-surface/[0.035] p-4"><div className="flex items-center gap-2 text-xs text-ink-3"><UserCheck className="h-4 w-4 text-accent" /> Active access</div><p className="mt-2 text-2xl font-semibold text-ink">{activeCount}</p><p className="mt-1 text-xs text-ink-3">Members with access enabled</p></div>
      </div>

      <div className="rounded-2xl border border-accent/20 bg-surface/[0.035] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your invitation link</p><p className="mt-1 break-all text-sm text-ink">{referralLink || 'Loading your personal link…'}</p></div>
          <button type="button" onClick={() => void copyLink()} disabled={!referralLink} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"><Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy link'}</button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {levelCounts.map(({ level, count }) => <div key={level} className="rounded-xl border border-line/10 bg-surface/[0.025] p-3 text-center"><p className="text-[10px] uppercase tracking-wider text-ink-3">Level {level}</p><p className="mt-1 text-lg font-semibold text-ink">{count}</p></div>)}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl border border-line/10 bg-surface/[0.03] p-1">
          <button type="button" onClick={() => setMode('structure')} className={`rounded-lg px-4 py-2 text-sm ${mode === 'structure' ? 'bg-surface/[0.12] text-ink' : 'text-ink-2'}`}><NetworkIcon className="mr-2 inline h-4 w-4" />Structure</button>
          <button type="button" onClick={() => setMode('members')} className={`rounded-lg px-4 py-2 text-sm ${mode === 'members' ? 'bg-surface/[0.12] text-ink' : 'text-ink-2'}`}><Users className="mr-2 inline h-4 w-4" />{isAdmin ? 'Member directory' : 'All members'}</button>
        </div>
        <label className="relative block w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" /><input value={search} onChange={(event) => { const value = event.target.value; setSearch(value); if (value.trim()) setExpandedIds(new Set(members.map((member) => member.user_id))); }} placeholder="Search by member or referral code" className="w-full rounded-xl border border-line/10 bg-surface/[0.04] py-3 pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent/50" /></label>
      </div>

      {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-ink-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading your connected members…</div> : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line/15 p-8 text-center"><Users className="mx-auto h-8 w-8 text-ink-3" /><p className="mt-3 font-semibold text-ink">Your network is ready to grow</p><p className="mt-1 text-sm text-ink-2">When people join through your personal invitation link, they will appear here automatically.</p></div>
      ) : mode === 'structure' ? (
        <div className="rounded-2xl border border-line/10 bg-surface/[0.02] p-3 sm:p-5">
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.04] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><NetworkIcon className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="text-sm font-semibold text-ink">{session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email || 'You'} <span className="text-xs font-normal text-accent">(You)</span></p><p className="text-xs text-ink-3">Root of your network · {directCount} direct members · {members.length} total</p></div>
          </div>
          {search.trim() && filteredMembers.length === 0 ? <p className="py-8 text-center text-sm text-ink-3">No members match “{search}”.</p> : (
            <div className="space-y-2">
              {(childrenBySponsor.get(session.user.id) ?? []).filter((member) => !visibleIds || visibleIds.has(member.user_id)).map((member) => <MemberNode key={member.user_id} member={member} childrenBySponsor={childrenBySponsor} visibleIds={visibleIds} expandedIds={expandedIds} onToggle={toggle} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line/10 bg-surface/[0.02]">
          {isAdmin && <div className="border-b border-line/10 bg-accent/[0.035] px-4 py-3 text-xs leading-relaxed text-ink-2">Administrator directory: all registered member profiles are shown. Sponsor relationships are taken from recorded referrals; unlinked profiles are never assigned a sponsor automatically.</div>}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-line/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink-3"><span>Member / Sponsor</span><span>{isAdmin ? 'Referral' : 'Level'}</span><span>Access</span></div>
          {filteredMembers.map((member) => {
            const sponsor = member.sponsor_account_code === 'company:account'
              ? 'SuperTech AI company'
              : member.sponsor_user_id
                ? (allMembers.find((candidate) => candidate.user_id === member.sponsor_user_id)?.display_name ?? 'Connected sponsor')
                : 'Not linked yet';
            return <div key={member.user_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-line/5 px-4 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{member.display_name}</p><p className="mt-0.5 truncate text-[11px] text-ink-3">{isAdmin ? `Sponsor: ${sponsor}` : `Code ${member.referral_code}`} · Joined {formatLocalDateTime(member.created_at)}</p></div><span className="text-xs text-ink-2">{isAdmin ? member.referral_code : `L${member.depth}`}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${member.membership_active ? 'bg-up/10 text-up' : 'bg-surface/[0.08] text-ink-3'}`}>{member.membership_active ? 'Active' : 'Pending'}</span></div>;
          })}
          {filteredMembers.length === 0 && <p className="p-8 text-center text-sm text-ink-3">No members match “{search}”.</p>}
        </div>
      )}
    </section>
  );
}

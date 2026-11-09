import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, FileText, MessageSquare, Megaphone, Plus, RefreshCw, ShieldCheck, Vote } from 'lucide-react';
import { useSession } from '@/lib/sessionContext';
import { supabase } from '@/lib/supabase';

type Proposal = {
  id: string; title: string; description: string; category: string; status: string;
  created_by: string; closes_at: string | null; created_at: string;
};
type VoteRow = { proposal_id: string; voter_id: string; choice: 'yes' | 'no' | 'abstain' };
type Announcement = { id: string; title: string; body: string; published_at: string; published_by: string };
type Discussion = { id: string; proposal_id: string | null; body: string; created_by: string; created_at: string };
type AuditRow = { id: number; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; actor_id: string | null };
type Owner = { user_id: string; display_name: string; role: string };

const panel = 'rounded-2xl border border-line/15 bg-surface/[0.035] p-4 sm:p-5';
const field = 'w-full rounded-xl border border-line/20 bg-canvas/70 px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none';

export function GovernancePanel() {
  const { session, isAdmin } = useSession();
  const userId = session.user.id;
  const [tab, setTab] = useState<'proposals' | 'announcements' | 'discussion' | 'audit'>('proposals');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [deadline, setDeadline] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [comment, setComment] = useState('');
  const [activeProposal, setActiveProposal] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [p, v, a, d, l, o] = await Promise.all([
      supabase.from('governance_proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('governance_votes').select('proposal_id,voter_id,choice'),
      supabase.from('governance_announcements').select('*').is('archived_at', null).order('published_at', { ascending: false }),
      supabase.from('governance_discussions').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('governance_audit_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('governance_owners').select('user_id,display_name,role').eq('active', true),
    ]);
    const firstError = p.error || v.error || a.error || d.error || l.error || o.error;
    if (firstError) setError(firstError.message);
    else {
      setProposals((p.data || []) as Proposal[]); setVotes((v.data || []) as VoteRow[]);
      setAnnouncements((a.data || []) as Announcement[]); setDiscussions((d.data || []) as Discussion[]);
      setAudit((l.data || []) as AuditRow[]); setOwners((o.data || []) as Owner[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createProposal = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('governance_proposals').insert({
      title: title.trim(), description: description.trim(), category, created_by: userId,
      closes_at: deadline ? new Date(deadline).toISOString() : null, status: 'open',
    });
    if (saveError) { setError(saveError.message); return; }
    setTitle(''); setDescription(''); setDeadline(''); setNotice('Proposal published for owner review and voting.');
    await load();
  };

  const castVote = async (proposal: Proposal, choice: VoteRow['choice']) => {
    setError(''); setNotice('');
    const { error: voteError } = await supabase.from('governance_votes').upsert(
      { proposal_id: proposal.id, voter_id: userId, choice },
      { onConflict: 'proposal_id,voter_id' },
    );
    if (voteError) setError(voteError.message);
    else { setNotice('Your vote has been recorded. You may change it while voting remains open.'); await load(); }
  };

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault(); if (!comment.trim()) return;
    const { error: saveError } = await supabase.from('governance_discussions').insert({
      proposal_id: activeProposal || null, body: comment.trim(), created_by: userId,
    });
    if (saveError) setError(saveError.message);
    else { setComment(''); setNotice('Your contribution has been added.'); await load(); }
  };

  const publishAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('governance_announcements').insert({
      title: announcementTitle.trim(), body: announcementBody.trim(), published_by: userId,
    });
    if (saveError) setError(saveError.message);
    else { setAnnouncementTitle(''); setAnnouncementBody(''); setNotice('Official announcement published.'); await load(); }
  };

  const acknowledge = async (id: string) => {
    const { data: existing, error: lookupError } = await supabase.from('governance_announcement_reads').select('announcement_id').eq('announcement_id', id).eq('user_id', userId).maybeSingle();
    if (lookupError) { setError(lookupError.message); return; }
    if (!existing) {
      const { error: readError } = await supabase.from('governance_announcement_reads').insert({ announcement_id: id, user_id: userId });
      if (readError) { setError(readError.message); return; }
    }
    setNotice('Announcement acknowledged.');
  };

  const closeProposal = async (proposal: Proposal) => {
    const yes = votes.filter(v => v.proposal_id === proposal.id && v.choice === 'yes').length;
    const no = votes.filter(v => v.proposal_id === proposal.id && v.choice === 'no').length;
    const abstain = count(proposal.id, 'abstain');
    const { error: closeError } = await supabase.from('governance_proposals').update({ status: 'closed' }).eq('id', proposal.id);
    if (closeError) setError(closeError.message);
    else { setNotice(`Voting closed. Recorded tally — YES: ${yes}, NO: ${no}, ABSTAIN: ${abstain}. This is a recorded tally, not an automatic legal resolution.`); await load(); }
  };

  const count = (id: string, choice: VoteRow['choice']) => votes.filter(v => v.proposal_id === id && v.choice === choice).length;
  const myVote = (id: string) => votes.find(v => v.proposal_id === id && v.voter_id === userId)?.choice;
  const fmt = (value: string) => new Date(value).toLocaleString();

  if (loading && !proposals.length && !owners.length) return <div className={panel + ' mt-8 text-sm text-ink-2'}>Loading governance records…</div>;
  if (error && !owners.length && !proposals.length) return <div className={panel + ' mt-8'}><p className="text-sm text-down">{error}</p><button onClick={() => void load()} className="mt-3 rounded-lg border border-line/20 px-3 py-2 text-sm">Retry</button></div>;
  if (!owners.some(owner => owner.user_id === userId)) return <div className={panel + ' mt-8'}><ShieldCheck className="mb-2 h-6 w-6 text-accent" /><h2 className="text-lg font-semibold text-ink">Governance access required</h2><p className="mt-1 text-sm text-ink-2">This area is restricted to the five currently designated company owners. Contact an administrator if your access should be reviewed.</p></div>;

  return <section className="mt-8 flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Company governance</p><h2 className="mt-1 text-2xl font-semibold text-ink">Owners Centre</h2><p className="mt-1 text-sm text-ink-2">A shared record of decisions, votes, discussions and official notices.</p></div>
      <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink-2"><RefreshCw className="h-4 w-4" /> Refresh</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={panel}><p className="text-xs text-ink-3">Active owners</p><p className="mt-1 text-2xl font-semibold text-ink">{owners.length}</p></div>
      <div className={panel}><p className="text-xs text-ink-3">Open proposals</p><p className="mt-1 text-2xl font-semibold text-ink">{proposals.filter(p => p.status === 'open').length}</p></div>
      <div className={panel}><p className="text-xs text-ink-3">Official notices</p><p className="mt-1 text-2xl font-semibold text-ink">{announcements.length}</p></div>
    </div>
    <div className="flex flex-wrap gap-2">
      {([{id:'proposals',label:'Proposals',icon:Vote},{id:'announcements',label:'Announcements',icon:Megaphone},{id:'discussion',label:'Discussion',icon:MessageSquare},{id:'audit',label:'Decision history',icon:FileText}] as const).map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${tab === item.id ? 'border-accent/50 bg-accent/10 text-ink' : 'border-line/15 text-ink-2'}`}><item.icon className="h-4 w-4" />{item.label}</button>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm text-down">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-up/30 bg-up/10 p-3 text-sm text-ink">{notice}</div>}

    {tab === 'proposals' && <>
      <form onSubmit={createProposal} className={panel + ' grid gap-3'}>
        <h3 className="font-semibold text-ink">Submit a proposal</h3>
        <input className={field} required minLength={5} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder="Proposal title" />
        <textarea className={field + ' min-h-28'} required minLength={10} maxLength={12000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Explain the proposal, reasons, expected impact and any costs…" />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={field} value={category} onChange={e => setCategory(e.target.value)}><option value="general">General</option><option value="finance">Finance</option><option value="operations">Operations</option><option value="product">Product</option><option value="membership">Membership</option><option value="risk">Risk and compliance</option></select>
          <input className={field} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} aria-label="Optional voting deadline" />
        </div>
        <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas"><Plus className="h-4 w-4" /> Publish proposal</button>
      </form>
      <div className="grid gap-3">
        {proposals.map(p => <article key={p.id} className={panel}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-accent">{p.category} · {p.status}</p><h3 className="mt-1 text-lg font-semibold text-ink">{p.title}</h3></div><span className="text-xs text-ink-3">{fmt(p.created_at)}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-2">{p.description}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">{(['yes','no','abstain'] as const).map(choice => <div key={choice} className="rounded-xl border border-line/10 p-2"><p className="text-xs uppercase text-ink-3">{choice}</p><p className="text-lg font-semibold text-ink">{count(p.id, choice)}</p></div>)}</div>
          {p.status === 'open' && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-ink-3">Your vote: {myVote(p.id) || 'Not cast'}</span>{(['yes','no','abstain'] as const).map(choice => <button key={choice} onClick={() => void castVote(p, choice)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${myVote(p.id) === choice ? 'border-accent bg-accent/15 text-ink' : 'border-line/20 text-ink-2'}`}>{choice.toUpperCase()}</button>)}{isAdmin && <button onClick={() => void closeProposal(p)} className="ml-auto rounded-lg border border-warn/40 px-3 py-2 text-xs text-ink-2">Close & record outcome</button>}</div>}
          {p.closes_at && <p className="mt-2 text-xs text-ink-3">Voting deadline: {fmt(p.closes_at)}</p>}
          <button onClick={() => {setActiveProposal(p.id);setTab('discussion');}} className="mt-3 text-xs font-semibold text-accent">Open discussion</button>
        </article>)}
        {!proposals.length && <div className={panel + ' text-sm text-ink-3'}>No proposals yet. Submit the first company proposal above.</div>}
      </div>
    </>}

    {tab === 'announcements' && <>
      {isAdmin && <form onSubmit={publishAnnouncement} className={panel + ' grid gap-3'}><h3 className="font-semibold text-ink">Publish official announcement</h3><input className={field} required minLength={3} maxLength={180} value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} placeholder="Announcement title" /><textarea className={field + ' min-h-24'} required value={announcementBody} onChange={e => setAnnouncementBody(e.target.value)} placeholder="Official company update…" /><button className="w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas">Publish announcement</button></form>}
      {announcements.map(a => <article key={a.id} className={panel}><p className="text-xs text-ink-3">{fmt(a.published_at)}</p><h3 className="mt-1 text-lg font-semibold text-ink">{a.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-2">{a.body}</p><button onClick={() => void acknowledge(a.id)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line/20 px-3 py-2 text-xs text-ink-2"><CheckCircle2 className="h-4 w-4" /> Acknowledge receipt</button></article>)}
      {!announcements.length && <div className={panel + ' text-sm text-ink-3'}>No official announcements have been published.</div>}
    </>}

    {tab === 'discussion' && <div className="grid gap-3">
      <div className={panel + ' grid gap-3'}><label className="text-sm font-semibold text-ink">Owner discussion</label><select className={field} value={activeProposal} onChange={e => setActiveProposal(e.target.value)}><option value="">General company discussion</option>{proposals.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><form onSubmit={addComment} className="grid gap-2"><textarea className={field + ' min-h-24'} required maxLength={5000} value={comment} onChange={e => setComment(e.target.value)} placeholder="Share a question, comment or meeting note…" /><button className="w-fit rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas">Post contribution</button></form></div>
      {discussions.filter(d => d.proposal_id === (activeProposal || null)).map(d => <article key={d.id} className={panel}><p className="text-xs text-ink-3">{fmt(d.created_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{d.body}</p></article>)}
      {!discussions.some(d => d.proposal_id === (activeProposal || null)) && <div className={panel + ' text-sm text-ink-3'}>No discussion entries yet.</div>}
    </div>}

    {tab === 'audit' && <div className="grid gap-2">{audit.map(row => <article key={row.id} className={panel + ' flex flex-wrap items-start justify-between gap-2'}><div><p className="text-sm font-semibold text-ink">{row.action.toUpperCase()} · {row.entity_type.replace(/_/g,' ')}</p><p className="mt-1 text-xs text-ink-3">Record: {row.entity_id || '—'} · Actor: {row.actor_id || 'system'}</p></div><span className="text-xs text-ink-3">{fmt(row.created_at)}</span></article>)}{!audit.length && <div className={panel + ' text-sm text-ink-3'}>No governance actions recorded yet.</div>}</div>}
    <div className="flex items-start gap-2 rounded-xl border border-warn/20 bg-warn/5 p-3 text-xs leading-5 text-ink-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />Votes are recorded against each owner's signed-in account. The displayed tally is an administrative record; final approval must follow the company's existing legal documents, quorum and decision rules.</div>
  </section>;
}

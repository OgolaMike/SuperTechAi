import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Copy, CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck, ShieldOff, Smartphone, Users, CalendarDays, Plus, Wifi } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/sessionContext';

type Card = {
  id: string; owner_user_id: string; card_code: string; display_name: string;
  status: 'active' | 'suspended' | 'revoked' | 'replaced'; created_at: string; last_tapped_at: string | null;
};
type Member = { id: string; email: string; displayName: string };
type CommunityEvent = { id: string; event_code: string; title: string; starts_at: string | null; ends_at: string | null; status: string; created_at: string };
type NfcPayload = { card?: Card | null; token?: string | null; cards?: Card[]; members?: Member[]; events?: CommunityEvent[]; event?: CommunityEvent; alreadyIssued?: boolean; referralCode?: string | null; error?: string };

async function nfcRequest(body: Record<string, unknown>): Promise<NfcPayload> {
  const { data, error } = await supabase.functions.invoke('nfc-community', { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    const payload = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(typeof payload?.error === 'string' ? payload.error : error.message || 'The Smart Community service is unavailable.');
  }
  if (data?.error) throw new Error(data.error);
  return data as NfcPayload;
}
type NdefRecordLike = { recordType: string; data: DataView | null; toURL?: () => string | null };
type NdefReadingEvent = { message: { records: NdefRecordLike[] } };
type NdefReaderLike = { onreading: ((event: NdefReadingEvent) => void) | null; scan: () => Promise<void>; abort: () => Promise<void> };

function readNfcTapToken(record: NdefRecordLike | undefined): string {
  if (!record || record.recordType !== 'url') return '';
  let url = record.toURL?.() ?? '';
  if (!url && record.data) {
    const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
    const prefixes: Record<number, string> = { 0x00: '', 0x01: 'http://www.', 0x02: 'https://www.', 0x03: 'http://', 0x04: 'https://' };
    url = (prefixes[bytes[0]] ?? '') + new TextDecoder().decode(bytes.slice(1));
  }
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'tap' && /^[a-f0-9]{64}$/i.test(parts[1]) ? parts[1] : '';
  } catch {
    return '';
  }
}

const statusClass = (status: string) => status === 'active'
  ? 'border-up/30 bg-up/10 text-up'
  : status === 'suspended' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-line/15 bg-surface/[0.06] text-ink-3';

export function SmartCommunity() {
  const { session, isAdmin } = useSession();
  const [myCard, setMyCard] = useState<Card | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [selectedEventCode, setSelectedEventCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [tapToken, setTapToken] = useState<string | null>(() => localStorage.getItem(`supertech-nfc-token:${session.user.id}`));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const tapUrl = useMemo(() => tapToken ? `${window.location.origin}/tap/${tapToken}` : '', [tapToken]);
  const referralUrl = useMemo(() => referralCode ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}` : '', [referralCode]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const mine = await nfcRequest({ action: 'my-card' });
      setMyCard(mine.card ?? null);
      setReferralCode(mine.referralCode ?? '');
      if (isAdmin) {
        const [cardRows, memberRows, eventRows] = await Promise.all([
          nfcRequest({ action: 'list-cards' }),
          nfcRequest({ action: 'list-members' }),
          nfcRequest({ action: 'list-events' }),
        ]);
        setCards(cardRows.cards ?? []);
        setMembers(memberRows.members ?? []);
        setEvents(eventRows.events ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Smart Community.');
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const issueSelf = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await nfcRequest({ action: 'issue-self' });
      setReferralCode(result.referralCode ?? '');
      if (result.token) {
        setTapToken(result.token);
        localStorage.setItem(`supertech-nfc-token:${session.user.id}`, result.token);
        setNotice('Your digital membership card is ready. You can now write its link to your NFC card.');
      } else {
        setNotice('You already have an active card. If you need to program a replacement, ask an administrator to reissue it.');
      }
      setMyCard(result.card ?? null);
      if (isAdmin) await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Card could not be issued.'); }
    finally { setBusy(false); }
  };

  const issueForMember = async (replace = false) => {
    if (!selectedMember) { setError('Choose a member first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await nfcRequest({ action: 'issue-member', userId: selectedMember, replace });
      if (result.token) {
        localStorage.setItem(`supertech-nfc-admin-token:${result.card?.id}`, result.token);
        setNotice(`Card ${result.card?.card_code ?? ''} issued. Copy its tap link from the card list to program the physical card.`);
      } else setNotice('This member already has an active card. Use Replace card only when issuing a new physical card.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Card could not be issued.'); }
    finally { setBusy(false); }
  };

  const setCardStatus = async (card: Card, status: 'active' | 'suspended' | 'revoked') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await nfcRequest({ action: 'set-card-status', cardId: card.id, status });
      setNotice(`${card.card_code} is now ${status}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Card status could not be updated.'); }
    finally { setBusy(false); }
  };

  const startNfcCheckIn = async () => {
    if (!selectedEventCode) { setError('Choose an event before scanning a member card.'); return; }
    const Reader = (window as Window & { NDEFReader?: new () => NdefReaderLike }).NDEFReader;
    if (!Reader) { setError('This browser cannot scan NFC cards directly. Use an NFC-enabled Android phone with Chrome, or use NFC Tools to read the card and ask an administrator to record attendance.'); return; }
    setBusy(true); setScanning(false); setError(''); setNotice('');
    try {
      const reader = new Reader();
      reader.onreading = (event) => {
        const record = event.message.records.find((item) => item.recordType === 'url');
        const token = readNfcTapToken(record);
        if (!token) {
          setError('This NFC card does not contain a valid SuperTechAi tap link.');
          setScanning(false); setBusy(false);
          void reader.abort().catch(() => undefined);
          return;
        }
        void nfcRequest({ action: 'check-in', token, eventCode: selectedEventCode })
          .then((result) => { setNotice(result.error ?? 'Attendance recorded successfully.'); })
          .catch((err) => setError(err instanceof Error ? err.message : 'Attendance could not be recorded.'))
          .finally(() => { setScanning(false); setBusy(false); void reader.abort().catch(() => undefined); });
      };
      await reader.scan();
      setScanning(true);
      setNotice('Ready. Hold a member NFC card against the back of this phone.');
      setBusy(false);
    } catch (err) {
      setScanning(false); setBusy(false);
      setError(err instanceof Error ? err.message : 'NFC scanning could not start. Check browser permissions.');
    }
  };

  const createEvent = async () => {
    if (!eventTitle.trim()) { setError('Enter an event name.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await nfcRequest({ action: 'create-event', title: eventTitle.trim() });
      setEventTitle('');
      setNotice(`Event created. Check-in code: ${result.event?.event_code ?? ''}`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Event could not be created.'); }
    finally { setBusy(false); }
  };

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setError('Copy was blocked by your browser. Select and copy the link manually.'); }
  };

  const selectedHasCard = cards.some((card) => card.owner_user_id === selectedMember && ['active', 'suspended', 'revoked'].includes(card.status));

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">SuperTechAi · Connected community</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Smart Membership</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">Your physical membership card connects people to your verified SuperTechAi identity, community and member services.</p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-up/25 bg-up/5 px-4 py-3 text-sm text-up">{notice}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
        <article className="overflow-hidden rounded-3xl border border-accent/25 bg-[#080d18] p-5 text-white shadow-xl sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/supertechai-logo.png" alt="SuperTechAi" className="h-12 w-12 object-contain" />
              <div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d8b76a]">SuperTechAi</p><p className="mt-1 text-xs text-white/60">Smart Community Member</p></div>
            </div>
            <Wifi className="h-6 w-6 text-[#d8b76a]" />
          </div>
          <div className="mt-9">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Cardholder</p>
            <p className="mt-1 text-xl font-semibold tracking-wide">{myCard?.display_name ?? session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Member'}</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Membership card</p><p className="mt-1 font-mono text-sm tracking-[0.18em] text-[#e7c77e]">{myCard?.card_code ?? 'NOT ISSUED'}</p></div>
              <span className="rounded-full border border-[#d8b76a]/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#e7c77e]">STANDARD</span>
            </div>
          </div>
          <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-4 text-[10px] uppercase tracking-[0.18em] text-white/45">
            <span>Tap to connect</span><span>Identity · Access · Community</span>
          </div>
        </article>

        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-line/10 bg-surface/[0.035] p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-accent"><CreditCard className="h-5 w-5" /><p className="text-sm font-semibold">Your NFC membership card</p></div>
            {loading ? <div className="mt-5 flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Checking your membership…</div> : myCard ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3"><span className="text-sm text-ink-2">Card status</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(myCard.status)}`}>{myCard.status}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-sm text-ink-2">Card number</span><span className="font-mono text-sm text-ink">{myCard.card_code}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-sm text-ink-2">Issued</span><span className="text-xs text-ink-3">{new Date(myCard.created_at).toLocaleDateString()}</span></div>
              </div>
            ) : <p className="mt-3 text-sm leading-relaxed text-ink-2">Your digital card has not been issued yet. Create it first, then write its link onto a standard NFC card.</p>}
          </div>
          <div className="space-y-2">
            {!myCard ? <button type="button" onClick={() => void issueSelf()} disabled={busy || loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Create my membership card</button> : myCard.status !== 'active' ? <p className="rounded-xl border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-ink-2">Your card is {myCard.status}. Contact a SuperTechAi administrator if you need a replacement or review.</p> : tapUrl ? <button type="button" onClick={() => void copy(tapUrl, 'NFC tap link')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white"><Copy className="h-4 w-4" /> Copy NFC tap link</button> : <p className="rounded-xl border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-ink-2">Your card is active, but its one-time programming link is not stored on this device. Ask an administrator to replace it if it has not yet been programmed.</p>}
            {tapUrl && myCard?.status === 'active' && <a href={tapUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line/15 px-4 py-2.5 text-sm font-medium text-ink-2">Preview your public card <ExternalLink className="h-4 w-4" /></a>}
            {referralUrl && <button type="button" onClick={() => void copy(referralUrl, 'Your referral link')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line/15 px-4 py-2.5 text-sm font-medium text-ink-2"><Users className="h-4 w-4" /> Copy your referral link</button>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/20 bg-surface/[0.025] p-5 sm:p-6">
        <div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Program your physical NFC card</h3></div>
        <ol className="mt-4 grid gap-3 text-sm text-ink-2 sm:grid-cols-3">
          <li className="rounded-xl bg-surface/[0.045] p-4"><span className="font-semibold text-accent">01 · Copy</span><p className="mt-1">Copy your personal NFC tap link above.</p></li>
          <li className="rounded-xl bg-surface/[0.045] p-4"><span className="font-semibold text-accent">02 · Write</span><p className="mt-1">Open NFC Tools on Android, choose Write, add a URL record and paste the link.</p></li>
          <li className="rounded-xl bg-surface/[0.045] p-4"><span className="font-semibold text-accent">03 · Test</span><p className="mt-1">Hold the card against another NFC-enabled phone and confirm the public profile opens.</p></li>
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">Use a standard NTAG213 or NTAG215 card. The card stores only its unique link; private account details and trading access remain protected behind SuperTechAi sign-in.</p>
      </div>

      {isAdmin && (
        <div className="space-y-5 border-t border-line/10 pt-6">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><div><h3 className="font-semibold text-ink">Administrator card management</h3><p className="text-xs text-ink-3">Issue, replace and suspend standard member cards.</p></div></div>
          <div className="grid gap-3 rounded-2xl border border-line/10 bg-surface/[0.025] p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <label className="block text-sm text-ink-2">Approved member<select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} className="mt-2 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink"><option value="">Select a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.displayName} · {member.email}</option>)}</select></label>
            <button type="button" onClick={() => void issueForMember(false)} disabled={busy || !selectedMember || selectedHasCard} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"><Plus className="mr-1 inline h-4 w-4" /> Issue card</button>
            <button type="button" onClick={() => void issueForMember(true)} disabled={busy || !selectedMember || !selectedHasCard} className="rounded-xl border border-line/15 px-4 py-3 text-sm font-semibold text-ink-2 disabled:opacity-40">Replace card</button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line/10">
            <div className="flex items-center justify-between border-b border-line/10 px-4 py-3"><p className="text-sm font-semibold text-ink">Issued cards ({cards.length})</p><button type="button" onClick={() => void load()} disabled={loading} className="text-xs text-accent disabled:opacity-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Refresh</button></div>
            {cards.length === 0 ? <p className="p-6 text-center text-sm text-ink-3">No cards issued yet.</p> : <div className="divide-y divide-line/10">{cards.map((card) => <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm font-semibold text-ink">{card.display_name}</p><p className="mt-1 font-mono text-xs text-ink-3">{card.card_code}</p></div><div className="flex items-center gap-2">{localStorage.getItem(`supertech-nfc-admin-token:${card.id}`) && <button type="button" onClick={() => void copy(`${window.location.origin}/tap/${localStorage.getItem(`supertech-nfc-admin-token:${card.id}`)}`, 'NFC tap link')} className="rounded-lg border border-accent/25 px-2.5 py-2 text-[10px] font-semibold text-accent"><Copy className="mr-1 inline h-3 w-3" /> Copy link</button>}<span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClass(card.status)}`}>{card.status}</span>{card.status === 'active' && <button type="button" onClick={() => void setCardStatus(card, 'suspended')} disabled={busy} className="rounded-lg border border-warn/20 p-2 text-warn" title="Suspend card"><ShieldOff className="h-4 w-4" /></button>}{card.status === 'suspended' && <button type="button" onClick={() => void setCardStatus(card, 'active')} disabled={busy} className="rounded-lg border border-up/20 p-2 text-up" title="Reactivate card"><BadgeCheck className="h-4 w-4" /></button>}{card.status !== 'revoked' && card.status !== 'replaced' && <button type="button" onClick={() => void setCardStatus(card, 'revoked')} disabled={busy} className="rounded-lg border border-down/20 p-2 text-down" title="Revoke card"><ShieldOff className="h-4 w-4" /></button>}</div></div>)}</div>}
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.025] p-4">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-accent" /><h4 className="text-sm font-semibold text-ink">Community events</h4></div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Event or training name" className="min-w-0 flex-1 rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent/50" /><button type="button" onClick={() => void createEvent()} disabled={busy || !eventTitle.trim()} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Create event</button></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select value={selectedEventCode} onChange={(e) => setSelectedEventCode(e.target.value)} className="min-w-0 rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink"><option value="">Select event for check-in</option>{events.filter((event) => ['scheduled','active'].includes(event.status)).map((event) => <option key={event.id} value={event.event_code}>{event.title}</option>)}</select>
              <button type="button" onClick={() => void startNfcCheckIn()} disabled={busy || !selectedEventCode || scanning} className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent disabled:opacity-40"><Wifi className="mr-1 inline h-4 w-4" /> {scanning ? 'Waiting for card…' : 'Scan member card'}</button>
            </div>
            <p className="mt-2 text-xs text-ink-3">On a compatible Android phone using Chrome, select an event and tap Scan member card. Hold each member's NFC card against the phone to record attendance.</p>
            <div className="mt-3 space-y-2">{events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface/[0.04] p-3"><div><p className="text-sm font-medium text-ink">{event.title}</p><p className="mt-1 font-mono text-xs text-ink-3">{event.event_code}</p></div><button type="button" onClick={() => void copy(event.event_code, 'Event check-in code')} className="rounded-lg border border-line/15 px-3 py-2 text-xs text-ink-2"><Copy className="mr-1 inline h-3 w-3" /> Copy code</button></div>)}{events.length === 0 && <p className="text-xs text-ink-3">No events created yet.</p>}</div>
          </div>
        </div>
      )}
    </section>
  );
}

export function NfcPublicProfile() {
  const token = window.location.pathname.split('/').filter(Boolean)[1] ?? '';
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ verified: boolean; cardStatus: string; membershipStatus: string; cardCode: string; displayName: string; memberSince: string; referralCode?: string | null } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke('nfc-community', { body: { action: 'resolve', token } })
      .then(({ data, error: invokeError }) => {
        if (cancelled) return;
        if (invokeError || data?.error) setError(data?.error ?? 'This card could not be verified.');
        else setProfile(data);
      })
      .catch(() => { if (!cancelled) setError('We could not connect to SuperTechAi. Please try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050914] px-4 py-10 text-white">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-[#d8b76a]/25 bg-[#0a1120] shadow-2xl">
        <div className="border-b border-white/10 p-6 text-center">
          <img src="/supertechai-logo.png" alt="SuperTechAi" className="mx-auto h-20 w-20 object-contain" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#d8b76a]">Smart Community</p>
          <h1 className="mt-2 text-xl font-semibold">Member verification</h1>
        </div>
        <div className="p-6 text-center">
          {loading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/60"><Loader2 className="h-5 w-5 animate-spin" /> Verifying membership…</div> : error ? <div className="py-7"><ShieldOff className="mx-auto h-9 w-9 text-red-400" /><p className="mt-3 font-semibold">Card not verified</p><p className="mt-2 text-sm text-white/60">{error}</p></div> : profile ? <>
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${profile.verified ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}><ShieldCheck className="h-7 w-7" /></div>
            <p className={`mt-3 text-xs font-semibold uppercase tracking-[0.18em] ${profile.verified ? 'text-emerald-300' : 'text-amber-300'}`}>{profile.verified ? 'Verified active member' : 'Membership not active'}</p>
            <h2 className="mt-3 text-2xl font-semibold">{profile.displayName}</h2>
            <p className="mt-2 font-mono text-xs tracking-[0.18em] text-white/45">{profile.cardCode}</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left text-sm"><div className="flex justify-between gap-3"><span className="text-white/50">Card status</span><span className="capitalize">{profile.cardStatus}</span></div><div className="mt-3 flex justify-between gap-3"><span className="text-white/50">Membership</span><span className="capitalize">{profile.membershipStatus}</span></div><div className="mt-3 flex justify-between gap-3"><span className="text-white/50">Card issued</span><span>{new Date(profile.memberSince).toLocaleDateString()}</span></div></div>
          </> : null}
          <a href={profile?.referralCode ? `/?ref=${encodeURIComponent(profile.referralCode)}` : '/'} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8a45c] px-4 py-3 text-sm font-semibold text-[#08101d]">Explore SuperTechAi <ExternalLink className="h-4 w-4" /></a>
          <p className="mt-4 text-[10px] leading-relaxed text-white/35">This page confirms card and membership status only. Private account information and trading access are never displayed here.</p>
        </div>
      </section>
    </main>
  );
}

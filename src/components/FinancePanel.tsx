import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck, Wallet, Users, Coins } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/sessionContext';
import { formatLocalDateTime } from '@/lib/localTime';

type FinanceResult = {
  profile: { referral_code: string; sponsor_user_id: string | null; payout_tron_address: string | null };
  orders: Array<{ id: string; amount: number; network: string; status: string; tx_hash: string | null; created_at: string; expires_at: string; confirmed_at: string | null; treasury_address?: string }>;
  ledger: Array<{ amount: number; entry_type: string; created_at: string }>;
  withdrawals: Array<{ id: string; gross_amount: number; fee_amount: number; net_amount: number; destination_address: string; status: string; tx_hash: string | null; requested_at: string }>;
  balance: number;
  unilevelBalance: number;
  accountCode: string;
  ownerAccount: { owner_slot: number; display_name: string; payout_address: string | null } | null;
  directReferrals: number;
  membershipPrice: number;
  withdrawalFeePct: number;
  membershipActive?: boolean;
};
type AdminResult = {
  settings: { treasury_address: string | null; network: string; membership_price: number; withdrawal_fee_pct: number; usdt_contract: string };
  owners: Array<{ owner_slot: number; display_name: string; user_id: string | null; payout_address: string | null; active: boolean }>;
  withdrawals: FinanceResult['withdrawals'];
  orders: Array<{ id: string; user_id: string; amount: number; status: string; tx_hash: string | null; created_at: string; confirmed_at: string | null }>;
  accountBalances: Record<string, number>;
};
type Props = { initialTab?: 'referrals' | 'wallet' | 'admin' };

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
const dateTime = (value: string) => formatLocalDateTime(value);

async function financeCall<T>(payload: Record<string, unknown>): Promise<T> {
  // Fetch the current authenticated session immediately before invoking the
  // protected function. This avoids sending an expired/missing bearer token.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Authentication session error: ${sessionError.message}`);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Your sign-in session has expired. Please sign out and sign in again.');

  const { data, error } = await supabase.functions.invoke('finance', {
    body: payload,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    let details: { error?: string } | null = null;
    if (context && typeof context.json === 'function') {
      details = await context.clone().json().catch(() => null);
    }
    const message = details?.error || error.message || 'Finance service unavailable.';
    throw new Error(`Referral service: ${message}`);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function FinancePanel({ initialTab = 'wallet' }: Props) {
  const { isAdmin } = useSession();
  const [tab, setTab] = useState(initialTab);
  const [dashboard, setDashboard] = useState<FinanceResult | null>(null);
  const [adminData, setAdminData] = useState<AdminResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState(() => new URLSearchParams(window.location.search).get('ref') ?? window.localStorage.getItem('supertech-referral-code') ?? '');
  const [txHash, setTxHash] = useState('');
  const [pollingHash, setPollingHash] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [unilevelWithdrawAmount, setUnilevelWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [ownerDrafts, setOwnerDrafts] = useState<Record<number, { display_name: string; user_id: string; payout_address: string }>>({});

  const pendingOrder = useMemo(() => dashboard?.orders.find((order) => order.status === 'pending') ?? null, [dashboard]);
  const referralLink = dashboard ? `${window.location.origin}/?ref=${dashboard.profile.referral_code}` : '';

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const member = await financeCall<FinanceResult>({ action: 'dashboard' });
      setDashboard(member);
      setWithdrawAddress(member.ownerAccount?.payout_address ?? member.profile.payout_tron_address ?? '');
      if (isAdmin) {
        const admin = await financeCall<AdminResult>({ action: 'admin' });
        setAdminData(admin);
        setTreasuryAddress(admin.settings.treasury_address ?? '');
        setOwnerDrafts(Object.fromEntries(admin.owners.map((owner) => [owner.owner_slot, {
          display_name: owner.display_name,
          user_id: owner.user_id ?? '',
          payout_address: owner.payout_address ?? '',
        }])));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load financial information.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { void load(); }, [load]);

  const createPayment = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await financeCall<{ order: { id: string }; treasury_address: string }>({
        action: 'create-payment',
        referral_code: referralCode.trim().toUpperCase() || null,
      });
      setNotice('Payment order created. Send exactly 300 USDT using the TRC20 network, then enter the transaction hash below.');
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create payment order.');
    } finally { setBusy(false); }
  };

  const verifyPayment = useCallback(async (hash: string, quiet = false) => {
    if (!pendingOrder || !hash.trim()) return;
    if (!quiet) { setBusy(true); setError(null); setNotice(null); }
    try {
      const result = await financeCall<{ status: string; activated?: boolean; message?: string }>({
        action: 'verify-payment', order_id: pendingOrder.id, tx_hash: hash.trim(),
      });
      if (result.status === 'confirmed' && result.activated) {
        setPollingHash('');
        setNotice('Payment confirmed. Your SuperTech AI membership is now active.');
        await load(true);
      } else {
        setPollingHash(hash.trim());
        if (!quiet) setNotice(result.message || 'Payment found but is awaiting TRON confirmation. We will keep checking.');
      }
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : 'Payment verification failed.');
    } finally { if (!quiet) setBusy(false); }
  }, [pendingOrder, load]);

  useEffect(() => {
    if (!pollingHash || !pendingOrder) return;
    const timer = window.setInterval(() => { void verifyPayment(pollingHash, true); }, 12000);
    return () => window.clearInterval(timer);
  }, [pollingHash, pendingOrder, verifyPayment]);

  const requestWithdrawal = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const result = await financeCall<{ gross_amount: number; fee_amount: number; net_amount: number }>({
        action: 'request-withdrawal', amount: Number(withdrawAmount),
      });
      setNotice(`Withdrawal submitted: ${money(result.gross_amount)} gross, ${money(result.fee_amount)} network and transaction reserve, ${money(result.net_amount)} net payout.`);
      setWithdrawAmount('');
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not request withdrawal.'); }
    finally { setBusy(false); }
  };

  const requestUnilevelWithdrawal = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const result = await financeCall<{ gross_amount: number; fee_amount: number; net_amount: number }>({
        action: 'request-unilevel-withdrawal', amount: Number(unilevelWithdrawAmount),
      });
      setNotice(`Unilevel withdrawal submitted: ${money(result.gross_amount)} gross, ${money(result.fee_amount)} reserve, ${money(result.net_amount)} net payout.`);
      setUnilevelWithdrawAmount('');
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not request Unilevel withdrawal.'); }
    finally { setBusy(false); }
  };

  const savePayoutWallet = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(withdrawAddress.trim())) {
      setError('Enter a valid USDT TRC20 wallet address.');
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    try {
      await financeCall({ action: 'save-payout-wallet', payout_tron_address: withdrawAddress.trim() });
      setNotice('Your USDT TRC20 payout wallet has been saved.');
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save payout wallet.'); }
    finally { setBusy(false); }
  };

  const saveTreasury = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      await financeCall({ action: 'update-settings', treasury_address: treasuryAddress.trim() });
      setNotice('TRC20 treasury address saved.');
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save treasury address.'); }
    finally { setBusy(false); }
  };

  const saveOwner = async (slot: number) => {
    const draft = ownerDrafts[slot];
    if (!draft) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await financeCall({ action: 'update-owner', owner_slot: slot, ...draft });
      setNotice(`Owner ${slot} account updated.`);
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update owner account.'); }
    finally { setBusy(false); }
  };

  const processWithdrawal = async (id: string, action: 'paid' | 'rejected') => {
    const hash = action === 'paid' ? window.prompt('Enter the outgoing TRON transaction hash:') : null;
    const reason = action === 'rejected' ? window.prompt('Reason for rejecting this withdrawal:') : null;
    if (action === 'paid' && !hash) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await financeCall({ action: 'process-withdrawal', withdrawal_id: id, withdrawal_action: action, tx_hash: hash, reason });
      setNotice(action === 'paid' ? 'Withdrawal marked as paid.' : 'Withdrawal rejected and balance restored.');
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not process withdrawal.'); }
    finally { setBusy(false); }
  };

  const copy = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
    catch { setError('Clipboard access is unavailable on this device.'); }
  };

  if (loading && !dashboard) {
    return <section className="mt-8 flex min-h-56 items-center justify-center gap-3 text-sm text-ink-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading your financial dashboard…</section>;
  }

  return (
    <section className="mt-8 flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">USDT Membership & Rewards</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Your SuperTech AI account</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">Membership payments, referrals and earnings are recorded in one transparent financial ledger.</p>
        </div>
        <button onClick={() => void load()} disabled={loading || busy} className="inline-flex items-center gap-2 rounded-xl border border-line/10 bg-surface/[0.05] px-4 py-2 text-sm text-ink hover:bg-surface/[0.09] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex w-full flex-wrap gap-1 rounded-xl border border-line/10 bg-surface/[0.03] p-1">
        <button onClick={() => setTab('wallet')} className={`min-w-0 rounded-lg px-3 py-2 text-center text-sm break-words ${tab === 'wallet' ? 'bg-surface/[0.12] text-ink' : 'text-ink-2'}`}>My Earnings</button>
        <button onClick={() => setTab('referrals')} className={`min-w-0 rounded-lg px-3 py-2 text-center text-sm break-words ${tab === 'referrals' ? 'bg-surface/[0.12] text-ink' : 'text-ink-2'}`}>My Referrals</button>
        {isAdmin && <button onClick={() => setTab('admin')} className={`min-w-0 rounded-lg px-3 py-2 text-center text-sm break-words ${tab === 'admin' ? 'bg-surface/[0.12] text-ink' : 'text-ink-2'}`}>Financial Control Centre</button>}
      </div>

      {error && <div role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-up/30 bg-up/10 px-4 py-3 text-sm text-up">{notice}</div>}

      {!dashboard?.membershipActive && (
        <div className="rounded-2xl border border-accent/25 bg-surface/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Membership activation</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Unlock SuperTech AI</h3>
              <p className="mt-1 text-sm text-ink-2">One-time membership: <strong className="text-ink">300 USDT</strong> on TRC20.</p>
            </div>
            <span className="rounded-full border border-line/10 px-3 py-1 text-xs text-ink-2">TRC20 · USDT</span>
          </div>
          {!pendingOrder ? (
            <button onClick={() => void createPayment()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Create payment instructions
            </button>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-surface/[0.05] p-4">
                <p className="text-xs text-ink-3">Send exactly</p>
                <p className="mt-1 text-2xl font-semibold text-ink">300.00 USDT</p>
                <p className="mt-1 text-xs text-ink-3">Network: TRON (TRC20). Do not send USDT on ERC20, BEP20 or another network.</p>
                <p className="mt-3 break-all rounded-lg bg-canvas p-3 text-sm text-ink">{pendingOrder.treasury_address}</p>
                <button onClick={() => void copy(pendingOrder.treasury_address ?? '', 'Treasury address')} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-line/10 px-3 py-2 text-xs font-semibold text-ink"><Copy className="h-3.5 w-3.5" /> Copy wallet address</button>
                <a href={`https://tronscan.org/#/address/${pendingOrder.treasury_address}`} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">View on TronScan <ExternalLink className="h-3 w-3" /></a>
              </div>
              <div className="rounded-xl bg-surface/[0.05] p-4">
                <p className="text-sm font-semibold text-ink">Verify your transfer</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">After sending, paste the transaction hash from your wallet. SuperTech AI checks the official USDT contract, destination, amount and confirmed TRON transaction before activating your account.</p>
                <label className="mt-3 block text-xs font-medium text-ink-2">TRON transaction hash</label>
                <input value={txHash} onChange={(event) => setTxHash(event.target.value)} className="mt-1 w-full rounded-xl border border-line/10 bg-canvas px-3 py-3 text-xs text-ink outline-none focus:border-accent/60" placeholder="64-character transaction ID" />
                <button onClick={() => void verifyPayment(txHash)} disabled={busy || txHash.trim().length !== 64} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify payment
                </button>
                {pollingHash && <p className="mt-2 text-xs text-accent">Checking for TRON confirmation every 12 seconds…</p>}
                <p className="mt-2 text-xs text-ink-3">Order expires: {dateTime(pendingOrder.expires_at)}</p>
              </div>
            </div>
          )}
        </div>
      )}
      {dashboard?.membershipActive && (
        <div className="flex items-center gap-3 rounded-2xl border border-up/25 bg-up/5 p-4 text-sm text-up">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <div><p className="font-semibold">Membership active</p><p className="mt-0.5 text-xs opacity-80">Your $300 USDT payment has been confirmed and your SuperTech AI access is enabled.</p></div>
        </div>
      )}

      {tab === 'wallet' && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <div className="flex items-center gap-2 text-sm text-ink-2"><Wallet className="h-4 w-4 text-accent" /> Available USDT balance</div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{money(dashboard?.balance ?? 0)}</p>
            <p className="mt-1 text-xs text-ink-3">Account: {dashboard?.accountCode}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface/[0.05] p-3"><p className="text-xs text-ink-3">Invited accounts</p><p className="mt-1 text-xl font-semibold text-ink">{dashboard?.directReferrals ?? 0}</p></div>
              <div className="rounded-xl bg-surface/[0.05] p-3"><p className="text-xs text-ink-3">Withdrawal contribution</p><p className="mt-1 text-xl font-semibold text-ink">15%</p></div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">A 15% reserve is deducted from every withdrawal to cover TRON network fees, USDT transfer costs and related payout processing expenses.</p>
          </div>

          <div className="rounded-2xl border border-accent/20 bg-accent/[0.035] p-5 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Unilevel earnings · 5 levels</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{money(dashboard?.unilevelBalance ?? 0)} available</h3>
                <p className="mt-1 max-w-2xl text-sm text-ink-2">Your Unilevel commissions are kept separate from Direct and other earnings. Any remaining balance is scheduled for automatic payout on the 1st of each month to your saved TRC20 wallet.</p>
              </div>
              <span className="rounded-full border border-line/10 px-3 py-1 text-xs text-ink-2">15% withdrawal reserve</span>
            </div>
            <form onSubmit={requestUnilevelWithdrawal} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-ink-2">Withdraw Unilevel (USDT)</label>
                <input type="number" min="0.000001" max={dashboard?.unilevelBalance ?? 0} step="0.000001" value={unilevelWithdrawAmount} onChange={(event) => setUnilevelWithdrawAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-line/10 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent/60" placeholder="Enter amount" required />
              </div>
              <button type="submit" disabled={busy || !unilevelWithdrawAmount || Number(unilevelWithdrawAmount) <= 0 || Number(unilevelWithdrawAmount) > (dashboard?.unilevelBalance ?? 0) || !dashboard?.profile.payout_tron_address} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> Request Unilevel withdrawal</button>
            </form>
            <p className="mt-2 text-xs text-ink-3">Manual withdrawals use the same saved wallet and 15% reserve. If you do not withdraw, the remaining eligible balance is queued for the monthly payout.</p>
          </div>

          <form onSubmit={requestWithdrawal} className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <h3 className="font-semibold text-ink">Request a USDT withdrawal</h3>
            <p className="mt-1 text-sm text-ink-2">Payouts use your saved USDT TRC20 wallet address.</p>
            <label className="mt-4 block text-xs font-medium text-ink-2">Gross withdrawal amount (USDT)</label>
            <input type="number" min="0.000001" step="0.000001" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-line/10 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent/60" placeholder="e.g. 50" required />
            <div className="mt-3 rounded-xl bg-surface/[0.05] p-3"><p className="text-xs text-ink-3">Saved payout wallet</p><p className="mt-1 break-all font-mono text-xs text-ink">{dashboard?.ownerAccount?.payout_address ?? dashboard?.profile.payout_tron_address ?? 'No payout wallet saved'}</p><button type="button" onClick={() => setTab('referrals')} className="mt-2 text-xs font-semibold text-accent">Manage payout wallet</button></div>
            {withdrawAmount && Number(withdrawAmount) > 0 && <div className="mt-3 rounded-xl bg-surface/[0.05] p-3 text-xs text-ink-2"><div className="flex justify-between"><span>Network & transaction reserve (15%)</span><strong>{money(Number(withdrawAmount) * 0.15)}</strong></div><div className="mt-1 flex justify-between text-ink"><span>You receive</span><strong>{money(Number(withdrawAmount) * 0.85)}</strong></div></div>}
            <button type="submit" disabled={busy || !withdrawAmount || !(dashboard?.ownerAccount?.payout_address ?? dashboard?.profile.payout_tron_address)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /> Request withdrawal</button>
          </form>

          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5 lg:col-span-2">
            <h3 className="font-semibold text-ink">Earnings history</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-ink-3"><tr><th className="py-2">Date</th><th>Activity</th><th className="text-right">Amount</th></tr></thead>
                <tbody>{dashboard?.ledger.map((row, index) => <tr key={`${row.created_at}-${index}`} className="border-t border-line/10"><td className="py-3 text-ink-3">{dateTime(row.created_at)}</td><td className="text-ink-2">{row.entry_type.replace(/_/g, ' ')}</td><td className={`text-right font-medium ${row.amount < 0 ? 'text-down' : 'text-up'}`}>{money(row.amount)}</td></tr>)}</tbody>
              </table>
              {!dashboard?.ledger.length && <p className="py-5 text-sm text-ink-3">Your earnings activity will appear here.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5 lg:col-span-2">
            <h3 className="font-semibold text-ink">Withdrawal history</h3>
            <div className="mt-3 space-y-2">
              {dashboard?.withdrawals.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface/[0.04] p-3 text-sm"><div><p className="font-medium text-ink">{money(row.gross_amount)} gross · {money(row.net_amount)} net</p><p className="mt-1 text-xs text-ink-3">{row.destination_address} · {dateTime(row.requested_at)}</p></div><span className="rounded-full border border-line/10 px-3 py-1 text-xs text-ink-2">{row.status}</span></div>)}
              {!dashboard?.withdrawals.length && <p className="text-sm text-ink-3">No withdrawal requests yet.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'referrals' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <div className="flex items-center gap-2 text-sm text-ink-2"><Users className="h-4 w-4 text-accent" /> Your referral link</div>
            <p className="mt-3 break-all rounded-xl bg-surface/[0.05] p-3 text-sm text-ink">{referralLink}</p>
            <button onClick={() => void copy(referralLink, 'Referral link')} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"><Copy className="h-4 w-4" /> Copy referral link</button>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface/[0.05] p-3"><p className="text-xs text-ink-3">Referral code</p><p className="mt-1 font-semibold text-ink">{dashboard?.profile.referral_code}</p></div>
              <div className="rounded-xl bg-surface/[0.05] p-3"><p className="text-xs text-ink-3">Direct referrals</p><p className="mt-1 text-xl font-semibold text-ink">{dashboard?.directReferrals ?? 0}</p></div>
            </div>
          </div>
          <form onSubmit={savePayoutWallet} className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <h3 className="font-semibold text-ink">USDT payout wallet</h3>
            <p className="mt-1 text-sm text-ink-2">Your USDT withdrawals will be sent to this TRON (TRC20) address.</p>
            <label className="mt-4 block text-xs font-medium text-ink-2">Receiving wallet address</label>
            <input value={withdrawAddress} onChange={(event) => setWithdrawAddress(event.target.value.trim())} className="mt-1 w-full rounded-xl border border-line/10 bg-canvas px-3 py-3 text-sm font-mono text-ink outline-none focus:border-accent/60" placeholder="T..." required />
            <p className="mt-2 text-xs text-ink-3">Wallet changes are blocked while a withdrawal is being processed. Make sure this address belongs to you.</p>
            <button type="submit" disabled={busy || !withdrawAddress.trim()} className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save payout wallet</button>
          </form>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <h3 className="font-semibold text-ink">Join through a referral</h3>
            <p className="mt-1 text-sm text-ink-2">If someone invited you, enter their referral code before creating your membership payment order.</p>
            <label className="mt-4 block text-xs font-medium text-ink-2">Referral code</label>
            <input value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-line/10 bg-canvas px-3 py-3 text-sm uppercase text-ink outline-none focus:border-accent/60" placeholder="Enter referral code" />
            <p className="mt-2 text-xs text-ink-3">Referral attribution is locked when your first membership payment order is created.</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5 lg:col-span-2">
            <h3 className="font-semibold text-ink">Referral rewards</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[['Direct commission','30%'],['Direct + Infinity allocation','50%'],['Infinity share','20%'],['Unilevel + Lucky pools','15%']].map(([label, value]) => <div key={label} className="rounded-xl bg-surface/[0.05] p-4"><p className="text-xs text-ink-3">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></div>)}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">From the third direct onward, the 50% referral allocation is split into 30% direct commission and 20% Infinity allocation. The Infinity share is held in its separate pool until the qualified 2×2 matrix identifies its single eligible recipient. A qualifying sale must never be credited twice. Unilevel remains five levels at 2% each; Lucky remains separate.</p>
          </div>
        </div>
      )}

      {tab === 'admin' && isAdmin && (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Company treasury</h3></div>
            <p className="mt-1 text-sm text-ink-2">This wallet receives the $300 USDT membership payments on TRC20.</p>
            <form onSubmit={saveTreasury} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input value={treasuryAddress} onChange={(event) => setTreasuryAddress(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-line/10 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent/60" placeholder="Enter official TRC20 treasury address" required />
              <button disabled={busy} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Save treasury</button>
            </form>
            <p className="mt-2 text-xs text-ink-3">Only the public receiving address belongs here. Never enter a seed phrase or private key.</p>
          </div>

          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <h3 className="font-semibold text-ink">Company and bonus reserves</h3>
            <p className="mt-1 text-sm text-ink-2">These balances are separated from member and owner earnings so company liabilities remain visible.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Infinity pool', 'pool:infinity'],
                ['Unilevel pool', 'pool:unilevel'],
                ['Lucky pool', 'pool:lucky'],
                ['Unallocated referrals', 'pool:unallocated_referral'],
                ['Treasury received', 'company:treasury_inflow'],
                ['Network & transaction reserve', 'company:operations_pending'],
                ['Network & transaction reserve collected', 'company:operations'],
              ].map(([label, account]) => <div key={account} className="rounded-xl bg-surface/[0.05] p-3"><p className="text-xs text-ink-3">{label}</p><p className="mt-1 text-lg font-semibold text-ink">{money(adminData?.accountBalances[account] ?? 0)}</p></div>)}
            </div>
          </div>

          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <h3 className="font-semibold text-ink">Five owner accounts</h3>
            <p className="mt-1 text-sm text-ink-2">Each owner receives a 7% allocation ($21) from every confirmed $300 membership sale.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {adminData?.owners.map((owner) => {
                const draft = ownerDrafts[owner.owner_slot] ?? { display_name: owner.display_name, user_id: owner.user_id ?? '', payout_address: owner.payout_address ?? '' };
                return <div key={owner.owner_slot} className="rounded-xl border border-line/10 bg-surface/[0.03] p-4">
                  <div className="flex items-center justify-between"><p className="font-semibold text-ink">Owner {owner.owner_slot}</p><p className="text-sm font-semibold text-up">{money(adminData?.accountBalances[`owner:${owner.owner_slot}`] ?? 0)}</p></div>
                  <label className="mt-3 block text-xs text-ink-3">Display name</label><input value={draft.display_name} onChange={(e) => setOwnerDrafts((current) => ({ ...current, [owner.owner_slot]: { ...draft, display_name: e.target.value } }))} className="mt-1 w-full rounded-lg border border-line/10 bg-canvas px-3 py-2 text-sm text-ink" />
                  <label className="mt-2 block text-xs text-ink-3">Linked member user ID</label><input value={draft.user_id} onChange={(e) => setOwnerDrafts((current) => ({ ...current, [owner.owner_slot]: { ...draft, user_id: e.target.value } }))} className="mt-1 w-full rounded-lg border border-line/10 bg-canvas px-3 py-2 text-sm text-ink" placeholder="UUID after owner registers" />
                  <label className="mt-2 block text-xs text-ink-3">Owner TRON payout address</label><input value={draft.payout_address} onChange={(e) => setOwnerDrafts((current) => ({ ...current, [owner.owner_slot]: { ...draft, payout_address: e.target.value } }))} className="mt-1 w-full rounded-lg border border-line/10 bg-canvas px-3 py-2 text-sm text-ink" placeholder="T..." />
                  <button onClick={() => void saveOwner(owner.owner_slot)} disabled={busy} className="mt-3 rounded-lg border border-line/10 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50">Save owner account</button>
                </div>;
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
            <h3 className="font-semibold text-ink">Withdrawal approvals</h3>
            <div className="mt-3 space-y-3">
              {adminData?.withdrawals.filter((row) => ['pending','approved','processing'].includes(row.status)).map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-xl bg-surface/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-ink">{money(row.gross_amount)} gross · {money(row.fee_amount)} fee · {money(row.net_amount)} net</p><p className="mt-1 break-all text-xs text-ink-3">{row.destination_address}</p><p className="mt-1 text-xs text-ink-3">{row.status} · {dateTime(row.requested_at)}</p></div><div className="flex gap-2"><button onClick={() => void processWithdrawal(row.id, 'paid')} disabled={busy} className="rounded-lg bg-up/15 px-3 py-2 text-xs font-semibold text-up disabled:opacity-50">Mark paid</button><button onClick={() => void processWithdrawal(row.id, 'rejected')} disabled={busy} className="rounded-lg bg-down/15 px-3 py-2 text-xs font-semibold text-down disabled:opacity-50">Reject</button></div></div>)}
              {!adminData?.withdrawals.some((row) => ['pending','approved','processing'].includes(row.status)) && <p className="text-sm text-ink-3">No withdrawals awaiting action.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line/10 bg-surface/[0.02] p-4 text-xs leading-relaxed text-ink-3">
        <div className="flex items-center gap-2 font-semibold text-ink-2"><Coins className="h-4 w-4" /> Payment and payout safeguards</div>
        USDT is accepted only on TRC20 using the official Tether contract. Membership is activated only after a confirmed blockchain transfer is verified. Withdrawal requests are recorded first and require finance approval; the 15% network and transaction reserve is disclosed before submission.
      </div>
    </section>
  );
}

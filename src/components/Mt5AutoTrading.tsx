import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, Cable, CircleHelp, Copy, LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type PairResult = { ok: boolean; workerId: string; workerToken: string; message: string };

export function Mt5AutoTrading() {
  const [adoptPending, setAdoptPending] = useState(false);
  const [managePositions, setManagePositions] = useState(false);
  const [placeNewOrders, setPlaceNewOrders] = useState(false);
  const [accountLogin, setAccountLogin] = useState('');
  const [server, setServer] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState('');
  const [pairResult, setPairResult] = useState<PairResult | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState('not_connected');
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data } = await supabase.from('mt5_account_settings')
        .select('bridge_status,last_seen_at')
        .maybeSingle();
      if (active && data) {
        setBridgeStatus(data.bridge_status);
        setLastSeenAt(data.last_seen_at);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const pairWorker = async () => {
    setPairError('');
    setPairResult(null);
    setPairing(true);
    try {
      const { data, error } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'pair', accountLogin: accountLogin.trim(), server: server.trim() },
      });
      if (error) throw error;
      if (!data?.ok || !data.workerToken || !data.workerId) {
        throw new Error(data?.error ?? 'Could not pair this MT5 worker.');
      }
      setPairResult(data as PairResult);
    } catch (error) {
      setPairError(error instanceof Error ? error.message : 'Pairing failed. Please try again.');
    } finally {
      setPairing(false);
    }
  };

  const copyToken = async () => {
    if (!pairResult?.workerToken) return;
    try {
      await navigator.clipboard.writeText(pairResult.workerToken);
    } catch {
      setPairError('Copy was blocked by your browser. Select and copy the token manually.');
    }
  };

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Optional broker integration</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">MT5 Auto Trading</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">Pair your MetaTrader 5 terminal with SuperTech AI. The first worker release verifies the account and reads existing orders and positions. It does not trade or change existing orders.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Cable className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Pair your MT5 terminal</h3></div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${bridgeStatus === 'connected' ? 'border-up/20 bg-up/10 text-up' : 'border-amber-400/20 bg-amber-400/10 text-amber-500'}`}>{bridgeStatus === 'connected' ? 'Connected' : pairResult ? 'Worker paired' : bridgeStatus === 'error' ? 'Account check failed' : 'Awaiting worker'}</span>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
            <LockKeyhole className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-ink">No trading password is requested</p>
              <p className="mt-1 text-sm leading-6 text-ink-2">Log into your chosen demo or live account in the official MT5 desktop terminal on your Windows computer or VPS. Enter only the account number and exact broker server name below. Never send your MT5 password to SuperTech AI chat or GitHub.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-2">MT5 account number
              <input value={accountLogin} onChange={(event) => setAccountLogin(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="e.g. 12345678" className="mt-1.5 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
            </label>
            <label className="text-xs font-medium text-ink-2">Exact broker server
              <input value={server} onChange={(event) => setServer(event.target.value)} autoComplete="off" placeholder="e.g. Broker-Live 2" className="mt-1.5 w-full rounded-xl border border-line/20 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
            </label>
          </div>
          <button type="button" onClick={pairWorker} disabled={pairing || !/^\d{4,20}$/.test(accountLogin.trim()) || !server.trim()} className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {pairing ? 'Pairing…' : 'Create secure Windows worker pairing'}
          </button>
          {pairError && <p role="alert" className="mt-3 text-sm text-red-500">{pairError}</p>}

          {pairResult && (
            <div className="mt-5 rounded-xl border border-up/20 bg-up/5 p-4">
              <p className="text-sm font-semibold text-ink">Worker pairing created</p>
              <p className="mt-1 text-xs leading-5 text-ink-2">This token is shown once. Copy it now and store it in the Windows Credential Manager using the worker's token-provisioning script.</p>
              <p className="mt-3 break-all rounded-lg bg-canvas p-2 font-mono text-xs text-ink">Worker ID: {pairResult.workerId}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-canvas p-2 text-xs text-ink">{pairResult.workerToken}</code>
                <button type="button" onClick={copyToken} aria-label="Copy worker token" className="rounded-lg border border-line/20 p-2 text-ink"><Copy className="h-4 w-4" /></button>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-2">Next: install the Windows worker from the repository's <code>mt5-worker</code> folder, set the worker ID, and run <code>provision_token.py</code>. Keep the token private.</p>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-ink-2">Demo and live accounts are both supported. The worker checks that its logged-in MT5 account number and server exactly match the details entered here. A mismatch prevents the worker from coming online.</p>
          {lastSeenAt && <p className="mt-2 text-xs text-ink-2">Last worker heartbeat: {new Date(lastSeenAt).toLocaleString()}</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Execution permissions</h3></div>
            <p className="mt-1 text-xs text-ink-2">These are separate permissions. All are off by default and are not active in this read-only worker release.</p>
            <label className="mt-5 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={adoptPending} onChange={(event) => setAdoptPending(event.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Import existing pending orders</strong><span className="text-xs text-ink-2">Read and display pending orders. Import does not change them.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={managePositions} onChange={(event) => setManagePositions(event.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Manage existing positions</strong><span className="text-xs text-ink-2">Future permission to manage adopted positions. Not active yet.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={placeNewOrders} onChange={(event) => setPlaceNewOrders(event.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Place new trades automatically</strong><span className="text-xs text-ink-2">Future permission for new orders. The current worker rejects all trade commands.</span></span></label>
            <p className="mt-4 text-xs leading-5 text-ink-2">These checkboxes are previews only; they do not authorize or enable trading.</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Current worker capabilities</h3></div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>• Verify the selected demo or live account identity.</li>
              <li>• Read account balance, equity and free margin.</li>
              <li>• Read pending orders and open positions.</li>
              <li>• Report worker heartbeat and connection errors.</li>
              <li>• No order placement, editing, cancellation or closing.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-ink">Trading remains disabled</p><p className="mt-1 text-xs leading-5 text-ink-2">Broker execution, risk limits, order reconciliation and end-to-end tests must be completed before automated trading is enabled.</p></div></div>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-2"><CircleHelp className="h-4 w-4" />Keep the Windows computer or VPS running with MT5 open for continuous monitoring.</p>
    </section>
  );
}

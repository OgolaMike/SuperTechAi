import { useState, type FormEvent } from 'react';
import { AlertTriangle, Bot, Cable, CircleHelp, LockKeyhole, ShieldCheck } from 'lucide-react';

export function Mt5AutoTrading() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [status, setStatus] = useState('');
  const [adoptPending, setAdoptPending] = useState(false);
  const [managePositions, setManagePositions] = useState(false);

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPassword('');
    setStatus('The MT5 execution bridge has not been deployed yet. Your password was cleared and no credentials were sent or saved. Once the secure MT5 bridge is deployed, you will be able to connect the account using the login, trading password and server supplied by your broker. Demo and live MT5 accounts are supported.');
  }

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Optional broker integration</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">MT5 Auto Trading</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">Connect a MetaTrader 5 account to let SuperTech AI prepare and manage trades from confirmed M15 signals. Your Deriv signals continue working independently.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleConnect} className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Cable className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Connect your MT5 account</h3></div>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-500">Bridge offline</span>
          </div>
          <label className="mb-1 block text-sm text-ink-2" htmlFor="mt5-login">MT5 login number</label>
          <input id="mt5-login" inputMode="numeric" autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} required placeholder="Enter account login" className="mb-4 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent" />
          <label className="mb-1 block text-sm text-ink-2" htmlFor="mt5-password">MT5 trading password</label>
          <input id="mt5-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Enter trading password" className="mb-4 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent" />
          <label className="mb-1 block text-sm text-ink-2" htmlFor="mt5-server">Broker server</label>
          <input id="mt5-server" autoComplete="off" value={server} onChange={(e) => setServer(e.target.value)} required placeholder="e.g. BrokerName-Live" className="mb-4 w-full rounded-xl border border-line/15 bg-canvas px-3 py-3 text-sm text-ink outline-none focus:border-accent" />
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-line/10 bg-canvas/60 p-3 text-xs leading-5 text-ink-2"><LockKeyhole className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" /><span>Use your MT5 trading password, never your investor/read-only password. Credentials must only be transmitted to the secure execution bridge and must never be stored in the browser or ordinary database tables.</span></div>
          <button type="submit" disabled={!login.trim() || !password || !server.trim()} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40">Connect MT5 account</button>
          {status && <p role="status" className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm leading-5 text-amber-500">{status}</p>}
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Execution settings</h3></div>
            <p className="mt-1 text-xs text-ink-2">Choose which existing account activity SuperTech AI may access. You can change these permissions later.</p>
            <label className="mt-5 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={adoptPending} onChange={(e) => setAdoptPending(e.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Import existing pending orders</strong><span className="text-xs text-ink-2">Read and display Buy Stop, Sell Stop, Buy Limit and Sell Limit orders. Do not change them automatically.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={managePositions} onChange={(e) => setManagePositions(e.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Manage existing positions</strong><span className="text-xs text-ink-2">Separate permission to manage positions after explicit authorization.</span></span></label>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Trading safeguards</h3></div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>• Accept demo or live MT5 accounts; trading permission is controlled separately.</li>
              <li>• New entries evaluated on completed M15 candles.</li>
              <li>• Existing eight-timeframe signal engine remains independent.</li>
              <li>• Duplicate-order protection and execution audit trail.</li>
              <li>• Emergency pause and separate permissions for pending orders and positions.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-ink">Execution bridge required</p><p className="mt-1 text-xs leading-5 text-ink-2">MT5 needs a continuously running Windows terminal or VPS-side execution service. This dashboard section is the connection setup foundation; it does not place trades until that service is deployed and verified.</p></div></div>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-2"><CircleHelp className="h-4 w-4" />Connection status will appear here after the secure MT5 bridge is installed.</p>
    </section>
  );
}

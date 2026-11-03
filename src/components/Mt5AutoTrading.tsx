import { useState } from 'react';
import { AlertTriangle, Bot, Cable, CircleHelp, LockKeyhole, ShieldCheck } from 'lucide-react';

export function Mt5AutoTrading() {
  const [adoptPending, setAdoptPending] = useState(false);
  const [managePositions, setManagePositions] = useState(false);
  const [placeNewOrders, setPlaceNewOrders] = useState(false);

  return (
    <section className="mt-8 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Optional broker integration</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">MT5 Auto Trading</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2">Connect a MetaTrader 5 account to let SuperTech AI prepare and manage trades from confirmed M15 signals. Your Deriv signals continue working independently.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Cable className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Connect your MT5 account</h3></div>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-500">Bridge offline</span>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <LockKeyhole className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-ink">Secure connection is being prepared</p>
              <p className="mt-1 text-sm leading-6 text-ink-2">The MT5 execution bridge is not deployed yet. Please do not enter or send your MT5 login, trading password or broker server details here. This page cannot connect to a broker or place trades yet.</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-ink-2">Demo and live MT5 accounts will both be supported. When the secure bridge is ready, your credentials will be sent directly to the protected connection service, never to browser storage or ordinary database tables.</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Execution permissions</h3></div>
            <p className="mt-1 text-xs text-ink-2">These are separate permissions. All are off by default and will require confirmation when account connection is enabled.</p>
            <label className="mt-5 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={adoptPending} onChange={(e) => setAdoptPending(e.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Import existing pending orders</strong><span className="text-xs text-ink-2">Read and display Buy Stop, Sell Stop, Buy Limit and Sell Limit orders. Import does not change them.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={managePositions} onChange={(e) => setManagePositions(e.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Manage existing positions</strong><span className="text-xs text-ink-2">Separate permission to manage positions after explicit authorization. Unadopted manual trades remain untouched.</span></span></label>
            <label className="mt-4 flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={placeNewOrders} onChange={(e) => setPlaceNewOrders(e.target.checked)} className="mt-1 accent-current" /><span><strong className="block font-medium">Place new trades automatically</strong><span className="text-xs text-ink-2">Separate permission for SuperTech AI to place new Buy Stop and Sell Stop orders when the confirmed strategy rules allow them.</span></span></label>
            <p className="mt-4 text-xs leading-5 text-ink-2">Selections on this setup preview are not saved or active while the bridge is offline.</p>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface/[0.04] p-5">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h3 className="font-semibold text-ink">Trading safeguards</h3></div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>• Accept demo or live MT5 accounts; no demo-only restriction.</li>
              <li>• New entries evaluated only after completed M15 candles.</li>
              <li>• Existing eight-timeframe signal engine remains independent.</li>
              <li>• Duplicate-order protection and execution audit trail.</li>
              <li>• Emergency pause and separate permissions for orders and positions.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-ink">Execution bridge required</p><p className="mt-1 text-xs leading-5 text-ink-2">MT5 needs a continuously running Windows terminal or VPS-side execution service. The secure backend, worker and broker connection must be deployed and tested before this dashboard can connect accounts or execute trades.</p></div></div>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-2"><CircleHelp className="h-4 w-4" />Connection status will appear here after the secure MT5 bridge is installed.</p>
    </section>
  );
}

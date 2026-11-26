import { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, Link2, RefreshCw, Sparkles, Unplug } from 'lucide-react';
import type { Asset, TfState } from '@/lib/sma';
import type { SuperSignal } from '@/lib/intelligence';
import { buildOptionsBarrier, OPTIONS_CONTRACT_DURATION_MINUTES } from '@/lib/optionsTrader';
import { disconnectDerivConnection, getDerivConnectionStatus, selectDerivAccount, startDerivConnection, type DerivConnectionStatus } from '@/lib/independentApi';

type Props={assets:Asset[];states:Record<string,Record<number,TfState>>;prices:Record<string,number>;signals:SuperSignal[]};
export function IndependentOptionsBoard({assets,states,prices,signals}:Props){
 const [connection,setConnection]=useState<DerivConnectionStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{try{const status=await getDerivConnectionStatus();setConnection(status);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Could not check Deriv account status.');}},[]);
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get('deriv')==='connected'){setNotice('Deriv authorization completed. Your encrypted account connection is saved.');url.searchParams.delete('deriv');window.history.replaceState({},'',url.pathname+url.search+url.hash);}void refresh();},[refresh]);
 const connect=async()=>{setBusy(true);setError('');setNotice('Opening Deriv secure authorization…');try{const result=await startDerivConnection(window.location.pathname);window.location.assign(result.authorizationUrl);}catch(cause){setError(cause instanceof Error?cause.message:'Could not start Deriv authorization.');setNotice('');setBusy(false);}};
 const chooseAccount=async(accountId:string)=>{setBusy(true);setError('');setNotice('');try{await selectDerivAccount(accountId);setNotice('Deriv account selected. Account connection is ready for final trading checks.');await refresh();}catch(cause){setError(cause instanceof Error?cause.message:'Could not select this Deriv account.');}finally{setBusy(false);}};
 const disconnect=async()=>{setBusy(true);setError('');setNotice('');try{const result=await disconnectDerivConnection();setConnection({connected:false,status:'not_connected',accounts:[],selectedAccountId:'',tradingEnabled:false});setNotice(result.note);}catch(cause){setError(cause instanceof Error?cause.message:'Could not disconnect Deriv.');}finally{setBusy(false);}};
 const rows=signals.flatMap(signal=>{
  const asset=assets.find(item=>item.symbol===signal.symbol);
  const state=states[signal.symbol]?.[14400];
  const spot=prices[signal.symbol]??state?.lastClose;
  if(!asset||spot==null||state?.bbHigh==null||state.bbLow==null)return[];
  const barrier=buildOptionsBarrier({direction:signal.direction,contractKind:'ONETOUCH',spot,bollingerUpper:state.bbHigh,bollingerLower:state.bbLow});
  return barrier?[{signal,asset,spot,barrier,upper:state.bbHigh,lower:state.bbLow}]:[];
 });
 return <section className="mt-8 space-y-5">
  <article className="hud-panel relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/[.10] via-surface/[.04] to-surface/[.02] p-5 shadow-[0_12px_40px_-28px_rgb(var(--accent)/.65)]">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Secure Deriv connection</p><h3 className="mt-1 text-lg font-semibold text-ink">Your account. Your control.</h3><p className="mt-1 max-w-xl text-xs leading-5 text-ink-2">Connect through Deriv's official sign-in. Your password stays with Deriv; SuperTech AI stores only an encrypted access token.</p></div>
    <span className={'rounded-full border px-3 py-1.5 text-[10px] font-bold '+(connection?.connected?'border-up/30 bg-up/10 text-up':'border-line/20 bg-canvas/30 text-ink-3')}>{connection?.connected?'ACCOUNT CONNECTED':connection?.status==='reconnect_required'?'RECONNECT REQUIRED':'NOT CONNECTED'}</span>
   </div>
   <div className="mt-4 flex flex-wrap items-center gap-2">
    {!connection?.connected?<button type="button" onClick={()=>void connect()} disabled={busy} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-canvas disabled:opacity-50"><Link2 className="mr-1 inline h-4 w-4"/>{busy?'Please wait…':'Connect Deriv account'}</button>:<>
     <label className="flex items-center gap-2 text-xs text-ink-2">Trading account<select value={connection.selectedAccountId} disabled={busy} onChange={event=>void chooseAccount(event.target.value)} className="max-w-[16rem] rounded-lg border border-line/20 bg-canvas px-3 py-2 text-ink"><option value="">Choose account</option>{connection.accounts.map(account=><option key={account.accountId} value={account.accountId}>{account.isDemo?'Demo':'Real'} · {account.accountId} · {account.currency||'Account'}</option>)}</select></label>
     <button type="button" onClick={()=>void refresh()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><RefreshCw className="mr-1 inline h-3.5 w-3.5"/>Refresh</button>
     <button type="button" onClick={()=>void disconnect()} disabled={busy} className="rounded-lg border border-line/20 px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"><Unplug className="mr-1 inline h-3.5 w-3.5"/>Disconnect</button>
    </>}
   </div>
   {connection?.connected&&<p className="mt-3 flex items-center gap-2 text-xs text-up"><CheckCircle2 className="h-4 w-4"/>Deriv account authorised · {connection.accounts.length} account(s) available · {connection.selectedAccountId?'Account selected':'Choose an account to continue'}</p>}
   {notice&&<p className="mt-3 text-xs text-up">{notice}</p>}{error&&<p role="alert" className="mt-3 text-xs text-down">{error}</p>}
   <p className="mt-3 text-[10px] leading-5 text-ink-3">Contract purchases remain disabled until risk limits, demo validation, duplicate-order protection and settlement monitoring are verified. Disconnect here deletes SuperTech AI's local encrypted copy; revoke app access in Deriv too.</p>
  </article>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Deriv options intelligence</p><h2 className="mt-1 text-2xl font-semibold text-ink">Options Trade Setups</h2><p className="mt-2 max-w-2xl text-sm text-ink-2">Uses the existing Super Signal direction and H4 Bollinger boundary to calculate a proposed 30-minute barrier distance. Link your Deriv account above; contract pricing and execution will follow after the final safety checks.</p></div><span className="rounded-full border border-accent/20 px-3 py-1.5 text-xs text-accent"><Clock3 className="mr-1 inline h-3.5 w-3.5"/>{OPTIONS_CONTRACT_DURATION_MINUTES} min contract</span></div>
  {rows.length? <div className="grid gap-4 lg:grid-cols-2">{rows.map(({signal,asset,spot,barrier,upper,lower})=><article key={signal.symbol} className="hud-panel rounded-2xl border border-line/15 bg-surface/[.035] p-5">
   <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-ink">{asset.name}</p><p className="text-xs text-ink-3">{asset.symbol} · H4 confirmed signal</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${signal.direction==='BUY'?'bg-up/10 text-up':'bg-down/10 text-down'}`}>{signal.direction}</span></div>
   <div className="mt-5 grid grid-cols-2 gap-3"><Metric label="Current price" value={spot.toFixed(asset.digits)}/><Metric label="Proposed barrier distance" value={barrier}/><Metric label="Upper boundary" value={upper.toFixed(asset.digits)}/><Metric label="Lower boundary" value={lower.toFixed(asset.digits)}/></div>
   <div className="mt-4 flex items-center gap-2 text-xs text-ink-2">{signal.direction==='BUY'?<ArrowUpRight className="h-4 w-4 text-up"/>:<ArrowDownRight className="h-4 w-4 text-down"/>}<span>Barrier is referenced to the {signal.direction==='BUY'?'upper':'lower'} Bollinger boundary.</span></div>
  </article>)}</div>:<div className="rounded-2xl border border-line/15 bg-surface/[.035] p-6 text-sm text-ink-2"><Sparkles className="mb-2 h-5 w-5 text-accent"/>No fresh Super Signal currently has a complete H4 barrier quote. The board will populate when market data and a qualifying signal are available.</div>}
 </section>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-line/10 bg-canvas/40 p-3"><p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p><p className="mt-1 break-all font-mono text-sm font-semibold text-ink">{value}</p></div>}

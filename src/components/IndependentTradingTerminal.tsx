import { Suspense, useEffect, useMemo, useState } from 'react';
import { SessionContext } from '@/lib/sessionContext';
import { AmbientBackground } from '@/components/AmbientBackground';
import { AssetSelector } from '@/components/AssetSelector';
import { StatusBar } from '@/components/StatusBar';
import { ViewNav, type View } from '@/components/ViewNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Toasts } from '@/components/Toasts';
import { DashboardView } from '@/components/DashboardView';
import { DerivMarket } from '@/components/DerivMarket';
import { ExchangeMarkets } from '@/components/ExchangeMarkets';
import { CryptoMovers } from '@/components/CryptoMovers';
import { PendingOrdersPanel } from '@/components/PendingOrdersPanel';
import { SuperSignalPanel } from '@/components/SuperSignalPanel';
import { BreakRetestPanel } from '@/components/BreakRetestPanel';
import { ThreeHourWickStrategy } from '@/components/ThreeHourWickStrategy';
import { FiveMinuteMomentum } from '@/components/FiveMinuteMomentum';
import { IndependentOptionsBoard } from '@/components/IndependentOptionsBoard';
import { MarketStructureSarPanel } from '@/components/MarketStructureSarPanel';
import { useDerivSignals } from '@/hooks/useDerivSignals';
import { useSignalAlerts } from '@/hooks/useSignalAlerts';
import { useBreakRetestAlerts } from '@/hooks/useBreakRetestAlerts';
import { useSuperSignalRecords } from '@/hooks/useSuperSignalRecords';
import { usePendingOrderAlerts } from '@/hooks/usePendingOrderAlerts';
import { useSignalRecordSync } from '@/hooks/useSignalRecordSync';
import { useTheme } from '@/hooks/useTheme';
import { playAlertTone } from '@/lib/alertSound';
import { ensureNotificationPermission } from '@/lib/deviceNotify';
import { trainSignalLearningModel, type SignalLearningModel } from '@/lib/aiLearning';
import { buildSuperSignals } from '@/lib/intelligence';
import { fetchSignalRecords } from '@/lib/signalRecords';
import { buildStopOrderIdeas } from '@/lib/stopOrders';
import { flattenSignals } from '@/lib/signals';
import { DEFAULT_ASSET } from '@/lib/sma';
import { loadMemberAlertModes } from '@/lib/alertPreferences';

const ASSET_KEY='supertech-selected-assets';
const SOUND_KEY='supertech-signal-sounds';
type Props={email:string;userId:string};
function readSelected():string[]{try{const value=JSON.parse(localStorage.getItem(ASSET_KEY)??'[]');if(Array.isArray(value)&&value.every(x=>typeof x==='string')&&value.length)return value.slice(0,1)}catch{/* Invalid saved selection; use the default market. */}return[DEFAULT_ASSET]}
function epoch(){return Math.floor(Date.now()/1000)}

export function IndependentTradingTerminal({email,userId}:Props){
 const [view,setView]=useState<View>('dashboard');
 const [selectedSymbols,setSelectedSymbols]=useState<string[]>(readSelected);
 const [soundsEnabled,setSoundsEnabled]=useState(()=>localStorage.getItem(SOUND_KEY)==='true');
 const [alertReady,setAlertReady]=useState(false);
 const [now,setNow]=useState(epoch);
 const [aiModel,setAiModel]=useState<SignalLearningModel>(()=>trainSignalLearningModel([]));
 const {theme,toggle:toggleTheme}=useTheme();
 const {assets,states,status,lastTick,prices,loaded}=useDerivSignals(selectedSymbols);
 const pendingIdeas=useMemo(()=>buildStopOrderIdeas(assets,states,prices,aiModel,now),[assets,states,prices,aiModel,now]);
 const pendingAlerts=usePendingOrderAlerts(pendingIdeas,loaded&&alertReady,soundsEnabled);
 useEffect(()=>{let cancelled=false;loadMemberAlertModes(userId).finally(()=>{if(!cancelled)setAlertReady(true)});return()=>{cancelled=true}},[userId]);
 const assetMap=useMemo(()=>new Map(assets.map(asset=>[asset.symbol,asset])),[assets]);
 const views=useMemo(()=>flattenSignals(assets,states),[assets,states]);
 const superSignals=useMemo(()=>buildSuperSignals(assets,states,now),[assets,states,now]);
 const unifiedViews=useMemo(()=>views.filter(item=>item.granularity===14400&&superSignals.some(signal=>signal.symbol===item.symbol&&signal.direction===item.signal.direction&&signal.signalEpoch===item.signal.signalEpoch)),[views,superSignals]);
 const signalAlerts=useSignalAlerts(unifiedViews,loaded&&alertReady,soundsEnabled);
 const breakAlerts=useBreakRetestAlerts(assets,states,prices,loaded&&alertReady,soundsEnabled);
 const superHistory=useSuperSignalRecords(superSignals,loaded);
 const sync=useSignalRecordSync(views,loaded);
 useEffect(()=>{let cancelled=false;fetchSignalRecords().then(rows=>{if(!cancelled)setAiModel(trainSignalLearningModel(rows))}).catch(()=>{if(!cancelled)setAiModel(trainSignalLearningModel([]))});return()=>{cancelled=true}},[sync.version]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(epoch()),3000);return()=>window.clearInterval(timer)},[]);
 const updateSelected=(symbols:string[])=>{const next=symbols.slice(0,1);setSelectedSymbols(next);localStorage.setItem(ASSET_KEY,JSON.stringify(next))};
 const monitorAsset=(symbol:string)=>{updateSelected([symbol]);setView('dashboard')};
 const openChart=(symbol:string)=>{updateSelected([symbol]);setView('dashboard');window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>document.getElementById(`asset-dashboard-${encodeURIComponent(symbol)}`)?.scrollIntoView({behavior:'smooth',block:'start'})))};
 const toggleSounds=()=>{const next=!soundsEnabled;setSoundsEnabled(next);localStorage.setItem(SOUND_KEY,String(next));if(next){playAlertTone('BUY');ensureNotificationPermission()}};
 const context={session:{access_token:'',user:{id:userId,email,user_metadata:{}}},isAdmin:false};
 const commonAlerts=[...pendingAlerts.toasts,...breakAlerts.toasts,...signalAlerts.toasts];
 return <SessionContext.Provider value={context}>
  <div className="relative min-h-screen overflow-x-clip bg-canvas text-ink"><AmbientBackground/>
   <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:pb-10">
    <header className="flex flex-col gap-4">
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black tracking-[.2em] text-ink">SUPERTECH <span className="text-accent">AI</span></p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-ink-3">Be part of the AI revolution.</p></div>
      <div className="flex items-center gap-3"><span className="hidden max-w-52 truncate text-xs text-ink-3 sm:block">{email}</span><ThemeToggle theme={theme} onToggle={toggleTheme}/><button onClick={()=>window.dispatchEvent(new Event('supertech-independent-signout'))} className="rounded-xl border border-line/15 px-3 py-2 text-xs text-ink-2 hover:bg-surface/10">Sign out</button></div>
     </div>
     <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><ViewNav view={view} isAdmin={false} onChange={setView}/><AssetSelector assets={assets} selected={selectedSymbols} onChange={updateSelected} soundsEnabled={soundsEnabled} onToggleSounds={toggleSounds}/></div>
    </header>
    <div className="mt-6"><StatusBar status={status.status} detail={status.detail} lastTick={lastTick} monitoredCount={selectedSymbols.length} saveError={sync.error}/></div>
    <Suspense fallback={<div className="mt-8 min-h-[40vh] animate-pulse rounded-2xl border border-line/15 bg-surface/[0.025]"/>}>
     <div key={view} className="view-transition">
      {view==='dashboard'&&<DashboardView selectedSymbols={selectedSymbols} assetMap={assetMap} states={states} prices={prices} loaded={loaded} soundsEnabled={soundsEnabled} aiModel={aiModel} unifiedSignals={superSignals} onNavigate={setView}/>}
      {view==='super'&&<section className="mt-8"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Super Signal</p><h2 className="text-xl font-semibold text-ink">One clear signal from ten timeframes</h2><p className="mt-1 max-w-2xl text-sm text-ink-2">H4 sets the primary direction. All ten readings must be fresh, at least six of nine supporting frames must agree, and no timeframe may oppose.</p></div><SuperSignalPanel signals={superSignals} records={superHistory.records} recordsLoading={superHistory.loading} recordsError={superHistory.error} onRefreshRecords={superHistory.refresh} prices={prices} loaded={loaded} aiModel={aiModel} states={states} onOpenDashboard={openChart}/></section>}
      {view==='strategies'&&<section className="mt-8 space-y-7"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Independent strategy engines</p><h2 className="mt-1 text-2xl font-semibold text-ink">Trading Strategies</h2><p className="mt-2 max-w-3xl text-sm text-ink-2">Each strategy calculates independently. Their outputs are compared for agreement; one strategy never rewrites another strategy's result.</p></div><div className="grid gap-4 lg:grid-cols-3">{[['Break & Retest','A confirmed break, retest and rejection at a price level.'],['Triple Bottom / Triple Top','Independent three-test support and resistance patterns.'],['Market Structure SAR','Confirmed swing structure with Parabolic SAR direction change.'],['3H Wick Intelligence','H4 wick rejection validated against fresh Unified Signal direction.'],['Bollinger Signal Engine','Confirmed candle-close cross with entry, stop and three targets.'],['Thirty Minute Momentum','Standalone M30 higher-high / lower-low price action.']].map(([name,description])=><article key={name} className="rounded-2xl border border-line/15 bg-surface/[.035] p-4"><p className="text-sm font-semibold text-ink">{name}</p><p className="mt-2 text-xs leading-5 text-ink-2">{description}</p></article>)}</div><BreakRetestPanel assets={assets} states={states} prices={prices} onOpenDashboard={openChart}/><MarketStructureSarPanel assets={assets} states={states} nowEpoch={now} onOpenDashboard={openChart}/><ThreeHourWickStrategy assets={assets} states={states} unifiedSignals={superSignals} nowEpoch={now} selectedSymbol={selectedSymbols[0]}/><div className="border-t border-line/15 pt-5"><PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} onOpenDashboard={openChart}/></div></section>}
      {view==='break-retest'&&<BreakRetestPanel assets={assets} states={states} prices={prices} onOpenDashboard={openChart}/>}
      {view==='five-minute'&&<FiveMinuteMomentum asset={assetMap.get(selectedSymbols[0])} state={states[selectedSymbols[0]]?.[1800]} currentPrice={prices[selectedSymbols[0]]??null} nowEpoch={now} loaded={loaded}/>}
      {view==='options'&&<IndependentOptionsBoard assets={assets} states={states} prices={prices} signals={superSignals}/>}
      {view==='orders'&&<PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} onOpenDashboard={openChart}/>}
      {view==='crypto'&&<CryptoMovers selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel}/>}
      {view==='exchange-markets'&&<ExchangeMarkets aiModel={aiModel} onNavigate={setView}/>}
      {view==='deriv-market'&&<DerivMarket assets={assets.filter(a=>a.exchange==='DERIV')} states={Object.fromEntries(Object.entries(states).filter(([symbol])=>assets.some(a=>a.symbol===symbol&&a.exchange==='DERIV')))} prices={Object.fromEntries(Object.entries(prices).filter(([symbol])=>assets.some(a=>a.symbol===symbol&&a.exchange==='DERIV')))} selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel}/>}
      {['ctrader','mt5','binance','okx','connections'].includes(view)&&<section className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/[.04] p-5"><p className="text-sm font-semibold text-ink">Broker automation connection</p><p className="mt-2 text-sm leading-6 text-ink-2">The original broker-connection workflows are being moved from Supabase Edge Functions to the independent authenticated Worker. No broker credentials are requested or stored in this browser view until that secure bridge is ready. Signal generation and market analysis continue independently.</p></section>}
      {view==='records'&&<section className="mt-8 rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">Signal history</h2><p className="mt-2 text-sm text-ink-2">Confirmed signal records saved on this device: {views.length} live signal readings.</p>{views.slice(0,30).map(item=><div key={item.key} className="flex flex-wrap justify-between gap-2 border-t border-line/10 py-3 text-xs"><span>{item.assetName} · {item.timeframe} · {item.signal.direction}</span><span>{new Date(item.signal.signalEpoch*1000).toLocaleString()}</span></div>)}</section>}
      {view==='alerts'&&<section className="mt-8 rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">Signal alerts</h2><p className="mt-2 text-sm text-ink-2">Sound: {soundsEnabled?'On':'Off'}. Alert preferences are saved separately on this device.</p><button onClick={toggleSounds} className="mt-4 rounded-xl border border-line/15 px-4 py-2 text-xs">{soundsEnabled?'Mute alerts':'Enable alert sounds'}</button></section>}
      {['personal-ai','academy','referrals','earnings','finance','admin','marketing','governance','network','smart-community'].includes(view)&&<section className="mt-8 rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">{view.replace(/-/g,' ')}</h2><p className="mt-2 text-sm text-ink-2">This member/business module is being connected separately from the trading engines.</p></section>}
     </div>
    </Suspense>
    <footer className="mt-10 rounded-2xl border border-line/10 bg-surface/[.03] p-5 text-xs leading-relaxed text-ink-2"><p className="font-medium text-ink">Trading involves risk. Past signals do not guarantee future results.</p><p className="mt-1">Signals and tracked ideas are not proof of broker execution.</p></footer>
   </div>
   <Toasts toasts={commonAlerts} onDismiss={id=>{signalAlerts.dismiss(id);breakAlerts.dismiss(id);pendingAlerts.dismiss(id)}} onOpenChart={openChart}/>
  </div>
 </SessionContext.Provider>
}

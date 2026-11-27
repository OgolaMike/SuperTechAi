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
import { IndependentBrokerConnections } from '@/components/IndependentBrokerConnections';
import { MarketStructureSarPanel } from '@/components/MarketStructureSarPanel';
import { StrategyConfluencePanel } from '@/components/StrategyConfluencePanel';
import { buildIndependentStrategyAssessments } from '@/lib/independentStrategies';
import { evaluateStrategyConfluence } from '@/lib/strategyConfluence';
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
import { enableDevicePush, sendPushTest } from '@/lib/independentApi';
import { MemberReferralsPanel } from '@/components/MemberReferralsPanel';
import { AdminPanel } from '@/components/AdminPanel';
import { getMembershipStatus } from '@/lib/independentApi';

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
 const [pushState,setPushState]=useState<'unknown'|'enabled'|'blocked'|'unsupported'>('unknown');
 const [pushBusy,setPushBusy]=useState(false);
 const [pushMessage,setPushMessage]=useState('');
 const [isCompanyAdmin,setIsCompanyAdmin]=useState(false);
 const [membershipPlan,setMembershipPlan]=useState<'free'|'standard_300'|'automation_500'>('free');
 const [now,setNow]=useState(epoch);
 const [aiModel,setAiModel]=useState<SignalLearningModel>(()=>trainSignalLearningModel([]));
 const {theme,toggle:toggleTheme}=useTheme();
 const {assets,states,status,lastTick,prices,loaded}=useDerivSignals(selectedSymbols);
 const pendingIdeas=useMemo(()=>buildStopOrderIdeas(assets,states,prices,aiModel,now),[assets,states,prices,aiModel,now]);
 const pendingAlerts=usePendingOrderAlerts(pendingIdeas,loaded&&alertReady,soundsEnabled);
 useEffect(()=>{let cancelled=false;getMembershipStatus().then(s=>{if(!cancelled){setIsCompanyAdmin(s.isAdmin);setMembershipPlan(s.planCode)}}).catch(()=>{if(!cancelled)setIsCompanyAdmin(false)});return()=>{cancelled=true}},[userId]);
 useEffect(()=>{let cancelled=false;loadMemberAlertModes(userId).finally(()=>{if(!cancelled)setAlertReady(true)});return()=>{cancelled=true}},[userId]);
 useEffect(()=>{if(!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator)){setPushState('unsupported');return}setPushState(Notification.permission==='granted'?'enabled':Notification.permission==='denied'?'blocked':'unknown')},[]);
 const activatePush=async()=>{setPushBusy(true);setPushMessage('');try{await enableDevicePush();setPushState('enabled');setPushMessage('This device is registered. Send a test notification to verify delivery.')}catch(error){setPushMessage(error instanceof Error?error.message:'Could not enable push notifications.');if(typeof Notification!=='undefined'&&Notification.permission==='denied')setPushState('blocked')}finally{setPushBusy(false)}};
 const testPush=async()=>{setPushBusy(true);setPushMessage('');try{const result=await sendPushTest();setPushMessage('Test notification accepted for '+result.sent+' of '+result.total+' registered device(s). Check your Android notification shade.')}catch(error){setPushMessage(error instanceof Error?error.message:'Test notification failed.')}finally{setPushBusy(false)}};
 const assetMap=useMemo(()=>new Map(assets.map(asset=>[asset.symbol,asset])),[assets]);
 const views=useMemo(()=>flattenSignals(assets,states),[assets,states]);
 const superSignals=useMemo(()=>buildSuperSignals(assets,states,now),[assets,states,now]);
 const strategyAssessments=useMemo(()=>buildIndependentStrategyAssessments(assets,states,views,pendingIdeas,superSignals,now),[assets,states,views,pendingIdeas,superSignals,now]);
 const strategyConfluence=useMemo(()=>evaluateStrategyConfluence(strategyAssessments,now),[strategyAssessments,now]);
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
 const paidViews:View[]=['super','strategies','options','five-minute','break-retest','orders','records','personal-ai','academy','exchange-markets','deriv-market'];
 const automationViews:View[]=['binance','ctrader','mt5','okx','connections'];
 const navigate=(next:View)=>{if(isCompanyAdmin){setView(next);return}if(membershipPlan==='free'&&paidViews.includes(next)){setView('smart-community');return}if(membershipPlan!=='automation_500'&&automationViews.includes(next)){setView('smart-community');return}setView(next)};
 const context={session:{access_token:'',user:{id:userId,email,user_metadata:{}}},isAdmin:isCompanyAdmin};
 const commonAlerts=[...pendingAlerts.toasts,...breakAlerts.toasts,...signalAlerts.toasts];
 return <SessionContext.Provider value={context}>
  <div className="relative min-h-screen overflow-x-clip bg-canvas text-ink"><AmbientBackground/>
   <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:pb-10">
    <header className="flex flex-col gap-4">
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black tracking-[.2em] text-ink">SUPERTECH <span className="text-accent">AI</span></p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-ink-3">Be part of the AI revolution.</p></div>
      <div className="flex items-center gap-3"><span className="hidden max-w-52 truncate text-xs text-ink-3 sm:block">{email}</span><ThemeToggle theme={theme} onToggle={toggleTheme}/><button onClick={()=>window.dispatchEvent(new Event('supertech-independent-signout'))} className="rounded-xl border border-line/15 px-3 py-2 text-xs text-ink-2 hover:bg-surface/10">Sign out</button></div>
     </div>
     <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><ViewNav view={view} isAdmin={isCompanyAdmin} onChange={navigate}/><AssetSelector assets={assets} selected={selectedSymbols} onChange={updateSelected} soundsEnabled={soundsEnabled} onToggleSounds={toggleSounds}/></div>
    </header>
    <div className="mt-6"><StatusBar status={status.status} detail={status.detail} lastTick={lastTick} monitoredCount={selectedSymbols.length} saveError={sync.error}/></div>
    <Suspense fallback={<div className="mt-8 min-h-[40vh] animate-pulse rounded-2xl border border-line/15 bg-surface/[0.025]"/>}>
     <div key={view} className="view-transition">
      {view==='dashboard'&&<DashboardView selectedSymbols={selectedSymbols} assetMap={assetMap} states={states} prices={prices} loaded={loaded} soundsEnabled={soundsEnabled} aiModel={aiModel} unifiedSignals={superSignals} onNavigate={navigate}/>}
      {view==='super'&&<section className="mt-8"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Super Signal</p><h2 className="text-xl font-semibold text-ink">One clear signal from ten timeframes</h2><p className="mt-1 max-w-2xl text-sm text-ink-2">H4 sets the primary direction. All ten readings must be fresh, at least six of nine supporting frames must agree, and no timeframe may oppose.</p></div><SuperSignalPanel signals={superSignals} records={superHistory.records} recordsLoading={superHistory.loading} recordsError={superHistory.error} onRefreshRecords={superHistory.refresh} prices={prices} loaded={loaded} aiModel={aiModel} states={states} onOpenDashboard={openChart}/></section>}
      {view==='strategies'&&<section className="mt-8 space-y-7"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Independent strategy engines</p><h2 className="mt-1 text-2xl font-semibold text-ink">Trading Strategies</h2><p className="mt-2 max-w-3xl text-sm text-ink-2">Each strategy calculates independently. Their outputs are compared for agreement; one strategy never rewrites another strategy's result.</p></div><StrategyConfluencePanel results={strategyConfluence}/><div className="grid gap-4 lg:grid-cols-3">{[['Break & Retest','A confirmed break, retest and rejection at a price level.'],['Triple Bottom / Triple Top','Independent three-test support and resistance patterns.'],['Market Structure SAR','Confirmed swing structure with Parabolic SAR direction change.'],['3H Wick Intelligence','H4 wick rejection validated against fresh Unified Signal direction.'],['Bollinger Signal Engine','Confirmed candle-close cross with entry, stop and three targets.'],['Thirty Minute Momentum','Standalone M30 higher-high / lower-low price action.']].map(([name,description])=><article key={name} className="rounded-2xl border border-line/15 bg-surface/[.035] p-4"><p className="text-sm font-semibold text-ink">{name}</p><p className="mt-2 text-xs leading-5 text-ink-2">{description}</p></article>)}</div><BreakRetestPanel assets={assets} states={states} prices={prices} onOpenDashboard={openChart}/><MarketStructureSarPanel assets={assets} states={states} nowEpoch={now} onOpenDashboard={openChart}/><ThreeHourWickStrategy assets={assets} states={states} unifiedSignals={superSignals} nowEpoch={now} selectedSymbol={selectedSymbols[0]}/><div className="border-t border-line/15 pt-5"><PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} onOpenDashboard={openChart}/></div></section>}
      {view==='break-retest'&&<BreakRetestPanel assets={assets} states={states} prices={prices} onOpenDashboard={openChart}/>}
      {view==='five-minute'&&<FiveMinuteMomentum asset={assetMap.get(selectedSymbols[0])} state={states[selectedSymbols[0]]?.[1800]} currentPrice={prices[selectedSymbols[0]]??null} nowEpoch={now} loaded={loaded}/>}
      {view==='options'&&<IndependentOptionsBoard assets={assets} states={states} prices={prices} signals={superSignals}/>}
      {view==='orders'&&<PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} onOpenDashboard={openChart}/>}
      {view==='crypto'&&<CryptoMovers selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel}/>}
      {view==='exchange-markets'&&<ExchangeMarkets aiModel={aiModel} onNavigate={setView}/>}
      {view==='deriv-market'&&<DerivMarket assets={assets.filter(a=>a.exchange==='DERIV')} states={Object.fromEntries(Object.entries(states).filter(([symbol])=>assets.some(a=>a.symbol===symbol&&a.exchange==='DERIV')))} prices={Object.fromEntries(Object.entries(prices).filter(([symbol])=>assets.some(a=>a.symbol===symbol&&a.exchange==='DERIV')))} selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel}/>}
      {['ctrader','connections'].includes(view)&&<IndependentBrokerConnections/>}{['mt5','binance','okx'].includes(view)&&<section className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/[.04] p-5"><p className="text-sm font-semibold text-ink">Broker automation connection</p><p className="mt-2 text-sm leading-6 text-ink-2">This broker is being connected through the independent authenticated Worker. No credentials are requested in the browser until its secure account, risk and order workflows are ready.</p></section>}
      {view==='records'&&<section className="mt-8 rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">Signal history</h2><p className="mt-2 text-sm text-ink-2">Confirmed signal records saved on this device: {views.length} live signal readings.</p>{views.slice(0,30).map(item=><div key={item.key} className="flex flex-wrap justify-between gap-2 border-t border-line/10 py-3 text-xs"><span>{item.assetName} · {item.timeframe} · {item.signal.direction}</span><span>{new Date(item.signal.signalEpoch*1000).toLocaleString()}</span></div>)}</section>}
      {view==='alerts'&&<section className="mt-8 space-y-5"><div className="rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">Push notifications</h2><p className="mt-2 text-sm leading-6 text-ink-2">Register this Android device with the Appwrite notification service. Once enabled, SuperTech AI can deliver alerts while the app is in the background or closed.</p><p className="mt-3 text-xs text-ink-3">Device status: {pushState==='enabled'?'Permission granted':pushState==='blocked'?'Blocked in Android site settings':pushState==='unsupported'?'Browser does not support push':'Not enabled yet'}</p><div className="mt-4 flex flex-wrap gap-3"><button disabled={pushBusy||pushState==='unsupported'} onClick={()=>void activatePush()} className="rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{pushBusy?'Please wait…':pushState==='enabled'?'Register / refresh device':'Enable push notifications'}</button><button disabled={pushBusy||pushState!=='enabled'} onClick={()=>void testPush()} className="rounded-xl border border-line/20 px-4 py-2.5 text-xs font-semibold disabled:opacity-40">Send test notification</button></div>{pushMessage&&<p role="status" className="mt-3 rounded-xl border border-line/15 bg-surface/10 p-3 text-xs leading-5 text-ink-2">{pushMessage}</p>}</div><div className="rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">Signal alert sounds</h2><p className="mt-2 text-sm text-ink-2">Sound: {soundsEnabled?'On':'Off'}. Sound preferences are saved on this device.</p><button onClick={toggleSounds} className="mt-4 rounded-xl border border-line/15 px-4 py-2 text-xs">{soundsEnabled?'Mute alerts':'Enable alert sounds'}</button></div></section>}
      {view==='referrals'&&<MemberReferralsPanel userId={userId} email={email}/>}
      {view==='admin'&&isCompanyAdmin&&<AdminPanel/>}
      {view==='smart-community'&&<section className="mt-8 space-y-4"><div className="rounded-2xl border border-accent/20 bg-surface/[.035] p-5"><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Membership access</p><h2 className="mt-2 text-2xl font-semibold text-ink">Your membership: {membershipPlan==='automation_500'?'$500 Premium':membershipPlan==='standard_300'?'$300 Standard':'Free'}</h2><p className="mt-2 text-sm leading-6 text-ink-2">{membershipPlan==='free'?'Free membership includes the home dashboard, basic market views and your member account. Upgrade to $300 Standard to unlock advanced signals, strategies and analysis.':membershipPlan==='standard_300'?'Your $300 Standard membership includes advanced signals, strategies and analysis. Broker automation is reserved for $500 Premium.':'Your $500 Premium membership includes advanced trading features and automation access.'}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-line/15 p-3 text-sm text-ink-2">Free · Basic platform access</div><div className="rounded-xl border border-line/15 p-3 text-sm text-ink-2">$300 · Advanced trading, no automation</div><div className="rounded-xl border border-line/15 p-3 text-sm text-ink-2 sm:col-span-2">$500 · Advanced trading plus automation</div></div><p className="mt-4 text-xs text-ink-3">To change your membership, contact the company. Paid upgrades are activated only after the company verifies payment and updates your membership.</p></div></section>}
      {['personal-ai','academy','earnings','finance','marketing','governance','network'].includes(view)&&<section className="mt-8 rounded-2xl border border-line/15 bg-surface/[.035] p-5"><h2 className="text-lg font-semibold">{view.replace(/-/g,' ')}</h2><p className="mt-2 text-sm text-ink-2">This member/business module is being connected separately from the trading engines.</p></section>}
     </div>
    </Suspense>
    <footer className="mt-10 rounded-2xl border border-line/10 bg-surface/[.03] p-5 text-xs leading-relaxed text-ink-2"><p className="font-medium text-ink">Trading involves risk. Past signals do not guarantee future results.</p><p className="mt-1">Signals and tracked ideas are not proof of broker execution.</p></footer>
   </div>
   <Toasts toasts={commonAlerts} onDismiss={id=>{signalAlerts.dismiss(id);breakAlerts.dismiss(id);pendingAlerts.dismiss(id)}} onOpenChart={openChart}/>
  </div>
 </SessionContext.Provider>
}

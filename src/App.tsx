import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
const PersonalAIExperience = lazy(() => import('@/components/PersonalAIExperience').then((module) => ({ default: module.PersonalAIExperience })));
const MarketingStudio = lazy(() => import('@/components/MarketingStudio').then((module) => ({ default: module.MarketingStudio })));
const SuperTechAcademy = lazy(() => import('@/components/SuperTechAcademy').then((module) => ({ default: module.SuperTechAcademy })));
const AdminPanel = lazy(() => import('@/components/AdminPanel').then((module) => ({ default: module.AdminPanel })));
const GovernancePanel = lazy(() => import('@/components/GovernancePanel').then((module) => ({ default: module.GovernancePanel })));
const FinancePanel = lazy(() => import('@/components/FinancePanel').then((module) => ({ default: module.FinancePanel })));
const NetworkPanel = lazy(() => import('@/components/NetworkPanel').then((module) => ({ default: module.NetworkPanel })));
const AccountHub = lazy(() => import('@/components/AccountHub').then((module) => ({ default: module.AccountHub })));
const SmartCommunity = lazy(() => import('@/components/SmartCommunity').then((module) => ({ default: module.SmartCommunity })));
import { AssetSelector } from '@/components/AssetSelector';
import { BubbleHistory } from '@/components/BubbleHistory';
import { AmbientBackground } from '@/components/AmbientBackground';
const DashboardView = lazy(() => import('@/components/DashboardView').then((module) => ({ default: module.DashboardView })));
const NotificationSettings = lazy(() => import('@/components/NotificationSettings').then((module) => ({ default: module.NotificationSettings })));
const Mt5AutoTrading = lazy(() => import('@/components/Mt5AutoTrading').then((module) => ({ default: module.Mt5AutoTrading })));
const AutomationConnections = lazy(() => import('@/components/AutomationConnections').then((module) => ({ default: module.AutomationConnections })));
const CTraderAutoTrading = lazy(() => import('@/components/CTraderAutoTrading').then((module) => ({ default: module.CTraderAutoTrading })));
const BinanceSpotAutomation = lazy(() => import('@/components/BinanceSpotAutomation').then((module) => ({ default: module.BinanceSpotAutomation })));
const BinanceFuturesAutomation = lazy(() => import('@/components/BinanceFuturesAutomation').then((module) => ({ default: module.BinanceFuturesAutomation })));
const OKXFuturesAutomation = lazy(() => import('@/components/OKXFuturesAutomation').then((module) => ({ default: module.OKXFuturesAutomation })));
const CryptoMovers = lazy(() => import('@/components/CryptoMovers').then((module) => ({ default: module.CryptoMovers })));
const DerivMarket = lazy(() => import('@/components/DerivMarket').then((module) => ({ default: module.DerivMarket })));
const ExchangeMarkets = lazy(() => import('@/components/ExchangeMarkets').then((module) => ({ default: module.ExchangeMarkets })));
const ServiceHealth = lazy(() => import('@/components/ServiceHealth').then((module) => ({ default: module.ServiceHealth })));
const RecordsPanel = lazy(() => import('@/components/RecordsPanel').then((module) => ({ default: module.RecordsPanel })));
const PendingOrdersPanel = lazy(() => import('@/components/PendingOrdersPanel').then((module) => ({ default: module.PendingOrdersPanel })));
const ThreeHourWickStrategy = lazy(() => import('@/components/ThreeHourWickStrategy').then((module) => ({ default: module.ThreeHourWickStrategy })));
import { SignOutButton } from '@/components/SignOutButton';
import { HeaderBrand, StatusBar, TrendIcons } from '@/components/StatusBar';
const SuperSignalPanel = lazy(() => import('@/components/SuperSignalPanel').then((module) => ({ default: module.SuperSignalPanel })));
const BreakRetestPanel = lazy(() => import('@/components/BreakRetestPanel').then((module) => ({ default: module.BreakRetestPanel })));
const FiveMinuteMomentum = lazy(() => import('@/components/FiveMinuteMomentum').then((module) => ({ default: module.FiveMinuteMomentum })));
import { ThemeToggle } from '@/components/ThemeToggle';
import { Toasts } from '@/components/Toasts';
import { ViewNav, type View } from '@/components/ViewNav';
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
import { useSession } from '@/lib/sessionContext';
import { flattenSignals } from '@/lib/signals';
import { DEFAULT_ASSET } from '@/lib/sma';
import { loadMemberAlertModes } from '@/lib/alertPreferences';

const ASSET_STORAGE_KEY = 'supertech-selected-assets';
const SOUND_STORAGE_KEY = 'supertech-signal-sounds';

function loadSelectedSymbols(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSET_STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved) && saved.every((item) => typeof item === 'string') && saved.length > 0) {
      return saved.slice(0, 1);
    }
  } catch {
    /* use default */
  }
  return [DEFAULT_ASSET];
}

function currentEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

function App() {
  const { isAdmin, session } = useSession();
  const [alertPreferencesReady, setAlertPreferencesReady] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(loadSelectedSymbols);
  const [soundsEnabled, setSoundsEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_STORAGE_KEY) === 'true');
  const [view, setView] = useState<View>('dashboard');
  const [now, setNow] = useState<number>(currentEpoch);
  const [aiModel, setAiModel] = useState<SignalLearningModel>(() => trainSignalLearningModel([]));
  const { theme, toggle: toggleTheme } = useTheme();
  const { assets, states, status, lastTick, prices, loaded } = useDerivSignals(selectedSymbols);
  const pendingOrderIdeas = useMemo(
    () => buildStopOrderIdeas(assets, states, prices, aiModel, now),
    [assets, states, prices, aiModel, now],
  );
  const { toasts: pendingToasts, dismiss: dismissPendingToast } = usePendingOrderAlerts(pendingOrderIdeas, loaded && alertPreferencesReady, soundsEnabled);

  useEffect(() => {
    let cancelled = false;
    loadMemberAlertModes(session.user.id)
      .catch((error: unknown) => console.warn('Could not load member alert preferences:', error))
      .finally(() => { if (!cancelled) setAlertPreferencesReady(true); });
    return () => { cancelled = true; };
  }, [session.user.id]);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.symbol, asset])), [assets]);
  const views = useMemo(() => flattenSignals(assets, states), [assets, states]);
  const superSignals = useMemo(() => buildSuperSignals(assets, states, now), [assets, states, now]);
  // H4 is the single primary trigger. It is allowed to alert only after the
  // complete ten-timeframe confluence engine confirms the same direction.
  const unifiedViews = useMemo(() => views.filter((item) => item.granularity === 14400 && superSignals.some((signal) =>
    signal.symbol === item.symbol && signal.direction === item.signal.direction && signal.signalEpoch === item.signal.signalEpoch,
  )), [views, superSignals]);
  const { toasts, dismiss } = useSignalAlerts(unifiedViews, loaded && alertPreferencesReady, soundsEnabled);
  const { toasts: breakRetestToasts, dismiss: dismissBreakRetestToast } = useBreakRetestAlerts(assets, states, prices, loaded && alertPreferencesReady, soundsEnabled);
  const superSignalHistory = useSuperSignalRecords(superSignals, loaded);
  const sync = useSignalRecordSync(views, loaded);

  useEffect(() => {
    let cancelled = false;
    fetchSignalRecords()
      .then((rows) => {
        if (!cancelled) setAiModel(trainSignalLearningModel(rows));
      })
      .catch(() => {
        if (!cancelled) setAiModel(trainSignalLearningModel([]));
      });
    return () => {
      cancelled = true;
    };
  }, [sync.version]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(currentEpoch()), 3000);
    return () => window.clearInterval(id);
  }, []);

  const updateSelected = (symbols: string[]) => {
    const next = symbols.slice(0, 1);
    setSelectedSymbols(next);
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(next));
  };

  const monitorAsset = (symbol: string) => {
    if (selectedSymbols[0] === symbol) return;
    updateSelected([symbol]);
    setView('dashboard');
  };

  const openSignalChart = (symbol: string) => {
    // Every signal source returns to the single-asset dashboard. Selecting a signal
    // changes the dashboard asset rather than adding another monitored asset.
    updateSelected([symbol]);
    setView('dashboard');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(`asset-dashboard-${encodeURIComponent(symbol)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  };

  const toggleSounds = () => {
    const next = !soundsEnabled;
    setSoundsEnabled(next);
    localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    if (next) {
      playAlertTone('BUY');
      ensureNotificationPermission();
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-canvas text-ink">
      <AmbientBackground />

      <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-10 lg:pb-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <HeaderBrand />
            <div className="flex items-center gap-3">
              <TrendIcons />
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <SignOutButton />
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <ViewNav view={view} isAdmin={isAdmin} onChange={setView} />
            <AssetSelector
              assets={assets}
              selected={selectedSymbols}
              onChange={updateSelected}
              soundsEnabled={soundsEnabled}
              onToggleSounds={toggleSounds}
            />
          </div>
        </header>

        <div className="mt-6">
          <StatusBar
            status={status.status}
            detail={status.detail}
            lastTick={lastTick}
            monitoredCount={selectedSymbols.length}
            saveError={sync.error}
          />
        </div>

        <Suspense fallback={<div className="mt-8 min-h-[40vh] animate-pulse rounded-2xl border border-line/15 bg-surface/[0.025]" aria-label="Loading section" />}>
        <div key={view} className="view-transition">
        {view === 'academy' && <SuperTechAcademy isAdmin={isAdmin} />}

        {view === 'personal-ai' && <PersonalAIExperience signalsCount={views.length} monitoredAssets={selectedSymbols} signalContext={views.filter((item) => !item.signal.outcome.closed).slice(0, 12).map((item) => ({ symbol: item.symbol, timeframe: item.timeframe, direction: item.signal.direction, signalEpoch: item.signal.signalEpoch, status: item.signal.outcome.status, entry: item.signal.levels.entry, stopLoss: item.signal.levels.stopLoss, tp1: item.signal.levels.tp1, tp2: item.signal.levels.tp2, tp3: item.signal.levels.tp3 }))} />}

        {view === 'dashboard' && (
          <DashboardView
            selectedSymbols={selectedSymbols}
            assetMap={assetMap}
            states={states}
            prices={prices}
            loaded={loaded}
            soundsEnabled={soundsEnabled}
            aiModel={aiModel}
            unifiedSignals={superSignals}
            onNavigate={setView}
          />
        )}

        {view === 'strategies' && (
          <section className="mt-8 space-y-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Learn the setup · follow the live scan</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Trading Strategies</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">Explore the price-action strategies SuperTech AI monitors. Each setup has its own rules, chart and live results. A detected setup is an opportunity to review, not a guarantee or an automatic broker order.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-2xl border border-line/20 bg-surface/[0.035] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">01 · Break & Retest</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">Trade the level after it breaks</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">Price closes beyond a support or resistance level, then returns to test that same area from the other side. The setup waits for rejection and a confirming candle close before showing a possible entry.</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">BUY: resistance breaks and holds as support. SELL: support breaks and holds as resistance. The chart shows the zone, confirmation, entry, stop and target.</p>
              </article>
              <article className="rounded-2xl border border-line/20 bg-surface/[0.035] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-up">02 · Triple Bottom</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">Three tests of support</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">Price forms two confirmed swing lows around a similar support zone. SuperTech AI watches for a third return to that zone and tracks a possible BUY limit setup.</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">The stop is placed beyond the opposite edge of the support zone; the target is planned at 3 times the risk distance (3R). A third test can still break support.</p>
              </article>
              <article className="rounded-2xl border border-accent/30 bg-accent/[0.045] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-accent">04 · Market Structure SAR</p>
                  <span className="rounded-full border border-accent/25 px-2.5 py-1 text-[10px] font-semibold text-accent">M30 strategy</span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-ink">Follow confirmed swings with Parabolic SAR</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">This setup looks for two confirmed rising swing highs and two rising swing lows before considering a BUY. For a SELL, it looks for falling swing lows and falling swing highs. Parabolic SAR must also switch sides on a completed candle before an alert is created.</p>
                <div className="mt-3 grid gap-2 text-xs leading-relaxed text-ink-3 sm:grid-cols-2">
                  <p><span className="font-semibold text-up">BUY:</span> Higher High + Higher Low, then SAR flips below price.</p>
                  <p><span className="font-semibold text-down">SELL:</span> Lower Low + Lower High, then SAR flips above price.</p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">Protection reference: initial stop 2 × ATR(14); trailing reference combines SAR with a 1.5 × ATR buffer. Swing points need two candles to confirm, so entries can arrive later. Signals only for now—no broker order is placed and no live stop is modified.</p>
              </article>
              <article className="rounded-2xl border border-accent/30 bg-accent/[0.045] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">05 · 3H Wick Intelligence</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">Trade confirmed H4 wick rejection</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">A bullish lower-wick rejection can qualify a BUY; a bearish upper-wick rejection can qualify a SELL. The same asset's fresh Unified Signal must confirm the same direction before the setup is authorised.</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">Initial protection uses H4 Bollinger Bands (20, 2.5). The strategy's planned trailing activates at +0.7%, advances in +0.5% steps and has a three-hour maximum holding time from actual execution. Manual trades remain separate.</p>
              </article>
              <article className="rounded-2xl border border-line/20 bg-surface/[0.035] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-down">03 · Triple Top</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">Three tests of resistance</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">Price forms two confirmed swing highs around a similar resistance zone. SuperTech AI watches for a third return to that zone and tracks a possible SELL limit setup.</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">The stop is placed beyond the opposite edge of the resistance zone; the target is planned at 3 times the risk distance (3R). A third test can still break resistance.</p>
              </article>
            </div>
            <div className="rounded-xl border border-warn/25 bg-warn/5 p-4 text-xs leading-relaxed text-ink-2">These are pattern scans and tracked trade ideas. “Entry reached” is not proof of a broker fill. Check the live chart, market conditions and risk before placing any trade.</div>
            <BreakRetestPanel assets={assets} states={states} prices={prices} onOpenDashboard={openSignalChart} />
            <ThreeHourWickStrategy assets={assets} states={states} unifiedSignals={superSignals} nowEpoch={now} selectedSymbol={selectedSymbols[0]} />
            <div className="border-t border-line/15 pt-6">
              <PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} onOpenDashboard={openSignalChart} />
            </div>
          </section>
        )}
        {view === 'break-retest' && <BreakRetestPanel assets={assets} states={states} prices={prices} onOpenDashboard={openSignalChart} />}
        {view === 'five-minute' && <FiveMinuteMomentum asset={assetMap.get(selectedSymbols[0])} state={states[selectedSymbols[0]]?.[1800]} currentPrice={prices[selectedSymbols[0]] ?? null} nowEpoch={now} loaded={loaded} />}

        {view === 'super' && (
          <section className="mt-8">
            <div className="mb-5 flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Super Signal</p>
              <h2 className="text-xl font-semibold tracking-tight text-ink">One clear signal from ten timeframes</h2>
              <p className="max-w-2xl text-sm text-ink-2">H4 sets the primary direction. All ten readings must be fresh, at least six of the nine supporting frames must agree, and no timeframe may oppose the signal.</p>
            </div>
            <SuperSignalPanel signals={superSignals} records={superSignalHistory.records} recordsLoading={superSignalHistory.loading} recordsError={superSignalHistory.error} onRefreshRecords={superSignalHistory.refresh} prices={prices} loaded={loaded} aiModel={aiModel} states={states} onOpenDashboard={openSignalChart} />
          </section>
        )}

        {view === 'connections' && <AutomationConnections onOpen={setView} />}
        {view === 'mt5' && <Mt5AutoTrading />}
        {view === 'ctrader' && <CTraderAutoTrading />}
        {view === 'binance' && <div className="space-y-8"><BinanceSpotAutomation /><div className="border-t border-line/15 pt-8"><BinanceFuturesAutomation /></div></div>}
        {view === 'okx' && <OKXFuturesAutomation />}
        {view === 'orders' && <PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} onOpenDashboard={openSignalChart} />}
        {view === 'crypto' && <CryptoMovers selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel} onNavigate={setView} />}
        {view === 'exchange-markets' && <ExchangeMarkets aiModel={aiModel} onNavigate={setView} />}
        {view === 'deriv-market' && <DerivMarket assets={assets.filter((asset) => asset.exchange === 'DERIV')} states={Object.fromEntries(Object.entries(states).filter(([symbol]) => assets.some((asset) => asset.symbol === symbol && asset.exchange === 'DERIV')))} prices={Object.fromEntries(Object.entries(prices).filter(([symbol]) => assets.some((asset) => asset.symbol === symbol && asset.exchange === 'DERIV')))} selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel} onNavigate={setView} />}
        {view === 'records' && <RecordsPanel version={sync.version} />}
        {view === 'bubble-history' && <BubbleHistory onOpenDashboard={openSignalChart} />}

        <section className={`mt-8 grid gap-6 lg:grid-cols-2 ${view === 'alerts' ? '' : 'hidden'}`}>
          <NotificationSettings assets={assets} />
          {view === 'alerts' && <ServiceHealth />}
        </section>

        {view === 'smart-community' && <SmartCommunity />}
        {view === 'network' && <NetworkPanel />}
        {view === 'referrals' && <AccountHub />}
        {view === 'earnings' && <FinancePanel initialTab="wallet" />}
        {view === 'finance' && isAdmin && <FinancePanel initialTab="admin" />}
        {view === 'admin' && isAdmin && <AdminPanel />}
        {view === 'marketing' && isAdmin && <MarketingStudio />}
        {view === 'governance' && isAdmin && <GovernancePanel />}
        </div>
        </Suspense>

        <footer className="mt-10 rounded-2xl border border-line/10 bg-surface/[0.03] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
            <div className="text-xs leading-relaxed text-ink-2">
              <p className="font-medium text-ink">Trading involves risk. Past signals do not guarantee future results.</p>
              <p className="mt-1">AI learns from completed signals. It does not guarantee that a new signal will win.</p>
            </div>
          </div>
        </footer>
      </div>

      <Toasts toasts={[...pendingToasts, ...breakRetestToasts, ...toasts]} onDismiss={(id) => { dismiss(id); dismissBreakRetestToast(id); dismissPendingToast(id); }} onOpenChart={openSignalChart} />
    </div>
  );
}

export default App;

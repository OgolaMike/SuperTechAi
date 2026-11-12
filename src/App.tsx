import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { MarketingStudio } from '@/components/MarketingStudio';
import { SuperTechAcademy } from '@/components/SuperTechAcademy';
import { AdminPanel } from '@/components/AdminPanel';
import { GovernancePanel } from '@/components/GovernancePanel';
import { FinancePanel } from '@/components/FinancePanel';
import { NetworkPanel } from '@/components/NetworkPanel';
import { AccountHub } from '@/components/AccountHub';
import { AssetSelector } from '@/components/AssetSelector';
import { AmbientBackground } from '@/components/AmbientBackground';
import { DashboardView } from '@/components/DashboardView';
import { NotificationSettings } from '@/components/NotificationSettings';
import { Mt5AutoTrading } from '@/components/Mt5AutoTrading';
import { AutomationConnections } from '@/components/AutomationConnections';
import { CTraderAutoTrading } from '@/components/CTraderAutoTrading';
import { BinanceSpotAutomation } from '@/components/BinanceSpotAutomation';
import { BinanceFuturesAutomation } from '@/components/BinanceFuturesAutomation';
import { OKXFuturesAutomation } from '@/components/OKXFuturesAutomation';
import { CryptoMovers } from '@/components/CryptoMovers';
import { ServiceHealth } from '@/components/ServiceHealth';
import { RecordsPanel } from '@/components/RecordsPanel';
import { PendingOrdersPanel } from '@/components/PendingOrdersPanel';
import { SignOutButton } from '@/components/SignOutButton';
import { HeaderBrand, StatusBar, TrendIcons } from '@/components/StatusBar';
import { SuperSignalPanel } from '@/components/SuperSignalPanel';
import { BreakRetestPanel } from '@/components/BreakRetestPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Toasts } from '@/components/Toasts';
import { ViewNav, type View } from '@/components/ViewNav';
import { useDerivSignals } from '@/hooks/useDerivSignals';
import { useSignalAlerts } from '@/hooks/useSignalAlerts';
import { useSuperSignalAlerts } from '@/hooks/useSuperSignalAlerts';
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
import { buildM15StopOrderIdeas } from '@/lib/stopOrders';
import { useSession } from '@/lib/sessionContext';
import { flattenSignals } from '@/lib/signals';
import { DEFAULT_ASSET, MAX_MONITORED_ASSETS } from '@/lib/sma';

const ASSET_STORAGE_KEY = 'supertech-selected-assets';
const SOUND_STORAGE_KEY = 'supertech-signal-sounds';

function loadSelectedSymbols(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSET_STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved) && saved.every((item) => typeof item === 'string') && saved.length > 0) {
      return saved.slice(0, MAX_MONITORED_ASSETS);
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
  const { isAdmin } = useSession();
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(loadSelectedSymbols);
  const [soundsEnabled, setSoundsEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_STORAGE_KEY) === 'true');
  const [view, setView] = useState<View>('dashboard');
  const [selectedSuperSignalKey, setSelectedSuperSignalKey] = useState('');
  const [selectedBreakRetestKey, setSelectedBreakRetestKey] = useState('');
  const [now, setNow] = useState<number>(currentEpoch);
  const [aiModel, setAiModel] = useState<SignalLearningModel>(() => trainSignalLearningModel([]));
  const { theme, toggle: toggleTheme } = useTheme();
  const { assets, states, status, lastTick, prices, loaded } = useDerivSignals(selectedSymbols);
  const pendingOrderIdeas = useMemo(
    () => buildM15StopOrderIdeas(assets, states, prices, aiModel, now),
    [assets, states, prices, aiModel, now],
  );
  usePendingOrderAlerts(pendingOrderIdeas, loaded, soundsEnabled);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.symbol, asset])), [assets]);
  const views = useMemo(() => flattenSignals(assets, states), [assets, states]);
  const superSignals = useMemo(() => buildSuperSignals(assets, states, now), [assets, states, now]);
  const { toasts, dismiss } = useSignalAlerts(views, loaded, soundsEnabled);
  const { toasts: breakRetestToasts, dismiss: dismissBreakRetestToast } = useBreakRetestAlerts(assets, states, prices, loaded, soundsEnabled);
  const { toasts: superToasts, dismiss: dismissSuperToast } = useSuperSignalAlerts(superSignals, loaded, soundsEnabled);
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
    const id = window.setInterval(() => setNow(currentEpoch()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const updateSelected = (symbols: string[]) => {
    const next = symbols.slice(0, MAX_MONITORED_ASSETS);
    setSelectedSymbols(next);
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(next));
  };

  const monitorAsset = (symbol: string) => {
    if (selectedSymbols.includes(symbol) || selectedSymbols.length >= MAX_MONITORED_ASSETS) return;
    updateSelected([...selectedSymbols, symbol]);
  };

  const openSignalChart = (symbol: string, granularity: number, chartTargetId?: string, selectedSignalKey?: string) => {
    if (chartTargetId?.startsWith('break-retest:')) {
      setSelectedBreakRetestKey(chartTargetId.slice('break-retest:'.length));
      setView('break-retest');
    } else if (chartTargetId) {
      if (selectedSignalKey) setSelectedSuperSignalKey(selectedSignalKey);
      setView('super');
    } else {
      setSelectedSymbols((current) => current.includes(symbol) ? current : [...current, symbol].slice(-10));
      setView('dashboard');
    }
    window.setTimeout(() => {
      const targetId = chartTargetId?.startsWith('break-retest:') ? 'break-retest-panel' : chartTargetId ?? `signal-chart-${encodeURIComponent(symbol)}-${granularity}`;
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 450);
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

        <div key={view} className="view-transition">
        {view === 'academy' && <SuperTechAcademy isAdmin={isAdmin} />}

        {view === 'dashboard' && (
          <DashboardView
            selectedSymbols={selectedSymbols}
            assetMap={assetMap}
            states={states}
            prices={prices}
            loaded={loaded}
            soundsEnabled={soundsEnabled}
            aiModel={aiModel}
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
              <article className="rounded-2xl border border-line/20 bg-surface/[0.035] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-down">03 · Triple Top</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">Three tests of resistance</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">Price forms two confirmed swing highs around a similar resistance zone. SuperTech AI watches for a third return to that zone and tracks a possible SELL limit setup.</p>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">The stop is placed beyond the opposite edge of the resistance zone; the target is planned at 3 times the risk distance (3R). A third test can still break resistance.</p>
              </article>
            </div>
            <div className="rounded-xl border border-warn/25 bg-warn/5 p-4 text-xs leading-relaxed text-ink-2">These are pattern scans and tracked trade ideas. “Entry reached” is not proof of a broker fill. Check the live chart, market conditions and risk before placing any trade.</div>
            <BreakRetestPanel assets={assets} states={states} prices={prices} />
            <div className="border-t border-line/15 pt-6">
              <PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} />
            </div>
          </section>
        )}
        {view === 'break-retest' && <BreakRetestPanel assets={assets} states={states} prices={prices} selectedSetupKey={selectedBreakRetestKey} />}

        {view === 'super' && (
          <section className="mt-8">
            <div className="mb-5 flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Super Signal</p>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Clear signals when all timeframes agree</h2>
              <p className="max-w-2xl text-sm text-ink-2">We wait for all eight timeframes to point in the same direction before announcing a Super Signal.</p>
            </div>
            <SuperSignalPanel selectedSignalKey={selectedSuperSignalKey} signals={superSignals} records={superSignalHistory.records} recordsLoading={superSignalHistory.loading} recordsError={superSignalHistory.error} onRefreshRecords={superSignalHistory.refresh} prices={prices} loaded={loaded} aiModel={aiModel} states={states} />
          </section>
        )}

        {view === 'connections' && <AutomationConnections onOpen={setView} />}
        {view === 'mt5' && <Mt5AutoTrading />}
        {view === 'ctrader' && <CTraderAutoTrading />}
        {view === 'binance' && <div className="space-y-8"><BinanceSpotAutomation /><div className="border-t border-line/15 pt-8"><BinanceFuturesAutomation /></div></div>}
        {view === 'okx' && <OKXFuturesAutomation />}
        {view === 'orders' && <PendingOrdersPanel assets={assets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} />}
        {view === 'crypto' && <CryptoMovers selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel} />}
        {view === 'records' && <RecordsPanel version={sync.version} />}

        <section className={`mt-8 grid gap-6 lg:grid-cols-2 ${view === 'alerts' ? '' : 'hidden'}`}>
          <NotificationSettings assets={assets} />
          {view === 'alerts' && <ServiceHealth />}
        </section>

        {view === 'network' && <NetworkPanel />}
        {view === 'referrals' && <AccountHub />}
        {view === 'earnings' && <FinancePanel initialTab="wallet" />}
        {view === 'finance' && isAdmin && <FinancePanel initialTab="admin" />}
        {view === 'admin' && isAdmin && <AdminPanel />}
        {view === 'marketing' && isAdmin && <MarketingStudio />}
        {view === 'governance' && isAdmin && <GovernancePanel />}
        </div>

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

      <Toasts toasts={[...breakRetestToasts, ...superToasts, ...toasts]} onDismiss={(id) => { dismiss(id); dismissSuperToast(id); dismissBreakRetestToast(id); }} onOpenChart={openSignalChart} />
    </div>
  );
}

export default App;

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SuperTechAcademy } from '@/components/SuperTechAcademy';
import { AdminPanel } from '@/components/AdminPanel';
import { FinancePanel } from '@/components/FinancePanel';
import { NetworkPanel } from '@/components/NetworkPanel';
import { AssetSelector } from '@/components/AssetSelector';
import { AmbientBackground } from '@/components/AmbientBackground';
import { DashboardView } from '@/components/DashboardView';
import { NotificationSettings } from '@/components/NotificationSettings';
import { Mt5AutoTrading } from '@/components/Mt5AutoTrading';
import { BinanceSpotAutomation } from '@/components/BinanceSpotAutomation';
import { CryptoMovers } from '@/components/CryptoMovers';
import { ServiceHealth } from '@/components/ServiceHealth';
import { RecordsPanel } from '@/components/RecordsPanel';
import { PendingOrdersPanel } from '@/components/PendingOrdersPanel';
import { SignOutButton } from '@/components/SignOutButton';
import { HeaderBrand, StatusBar, TrendIcons } from '@/components/StatusBar';
import { SuperSignalPanel } from '@/components/SuperSignalPanel';
import { ReversalContextPanel } from '@/components/ReversalContextPanel';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Toasts } from '@/components/Toasts';
import { ViewNav, type View } from '@/components/ViewNav';
import { useDerivSignals } from '@/hooks/useDerivSignals';
import { useSignalAlerts } from '@/hooks/useSignalAlerts';
import { useSuperSignalAlerts } from '@/hooks/useSuperSignalAlerts';
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
  const [now, setNow] = useState<number>(currentEpoch);
  const [aiModel, setAiModel] = useState<SignalLearningModel>(() => trainSignalLearningModel([]));
  const { theme, toggle: toggleTheme } = useTheme();
  const { assets, states, status, lastTick, prices, loaded } = useDerivSignals(selectedSymbols);

  const selectedAssets = useMemo(() => assets.filter((asset) => selectedSymbols.includes(asset.symbol)), [assets, selectedSymbols]);
  const pendingOrderIdeas = useMemo(
    () => buildM15StopOrderIdeas(selectedAssets, states, prices, aiModel, now),
    [selectedAssets, states, prices, aiModel, now],
  );
  usePendingOrderAlerts(pendingOrderIdeas, loaded, soundsEnabled);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.symbol, asset])), [assets]);
  const views = useMemo(() => flattenSignals(assets, states), [assets, states]);
  const superSignals = useMemo(() => buildSuperSignals(assets, states, now), [assets, states, now]);
  const { toasts, dismiss } = useSignalAlerts(views, loaded, soundsEnabled);
  const { toasts: superToasts, dismiss: dismissSuperToast } = useSuperSignalAlerts(superSignals, loaded, soundsEnabled);
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

  const openSignalChart = (symbol: string, timeframe: string) => {
    setView('dashboard');
    window.setTimeout(() => {
      const target = document.getElementById(`signal-chart-${encodeURIComponent(symbol)}-${encodeURIComponent(timeframe)}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
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
    <div className="relative min-h-screen overflow-x-hidden bg-canvas text-ink">
      <AmbientBackground />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
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
          />
        )}

        {view === 'super' && (
          <section className="mt-8">
            <div className="mb-5 flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Super Signal</p>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Clear signals when all timeframes agree</h2>
              <p className="max-w-2xl text-sm text-ink-2">We wait for all eight timeframes to point in the same direction before announcing a Super Signal.</p>
            </div>
            <ReversalContextPanel assets={assets.filter((asset) => selectedSymbols.includes(asset.symbol))} states={states} nowEpoch={now} />
            <SuperSignalPanel signals={superSignals} prices={prices} loaded={loaded} aiModel={aiModel} states={states} />
          </section>
        )}

        {view === 'mt5' && <Mt5AutoTrading />}
        {view === 'binance' && <BinanceSpotAutomation />}
        {view === 'orders' && <PendingOrdersPanel assets={selectedAssets} states={states} prices={prices} aiModel={aiModel} nowEpoch={now} loaded={loaded} />}
        {view === 'crypto' && <CryptoMovers selectedSymbols={selectedSymbols} onMonitorAsset={monitorAsset} aiModel={aiModel} />}
        {view === 'records' && <RecordsPanel version={sync.version} />}

        <section className={`mt-8 grid gap-6 lg:grid-cols-2 ${view === 'alerts' ? '' : 'hidden'}`}>
          <NotificationSettings assets={selectedAssets} />
          {view === 'alerts' && <ServiceHealth />}
        </section>

        {view === 'network' && <NetworkPanel />}
        {view === 'referrals' && <FinancePanel initialTab="referrals" />}
        {view === 'earnings' && <FinancePanel initialTab="wallet" />}
        {view === 'finance' && isAdmin && <FinancePanel initialTab="admin" />}
        {view === 'admin' && isAdmin && <AdminPanel />}
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

      <Toasts toasts={[...superToasts, ...toasts]} onDismiss={(id) => { dismiss(id); dismissSuperToast(id); }} onOpenChart={openSignalChart} />
    </div>
  );
}

export default App;

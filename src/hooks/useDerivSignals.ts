import { useCallback, useEffect, useRef, useState } from 'react';
import { DerivClient, type Candle, type ConnectionStatus, type DerivSymbol } from '@/lib/deriv';
import { BinanceStream, fetchBinanceCandles, loadBinanceAssets } from '@/lib/binance';
import {
  TIMEFRAMES,
  NATIVE_TIMEFRAME_GRANULARITIES,
  aggregateHourlyCandles,
  computeTfState,
  emptyTfState,
  mergeCandle,
  type Asset,
  type TfState,
  type Timeframe,
} from '@/lib/sma';

const LIVE_TIMEFRAMES = TIMEFRAMES;
const NATIVE_TIMEFRAMES = TIMEFRAMES.filter((timeframe) => NATIVE_TIMEFRAME_GRANULARITIES.has(timeframe.granularity));
const SYNTHETIC_TIMEFRAMES = TIMEFRAMES.filter((timeframe) => !NATIVE_TIMEFRAME_GRANULARITIES.has(timeframe.granularity));
const M15_GRANULARITY = 900;
const HOURLY_GRANULARITY = 3600;
const ALL_ASSET_M15_HISTORY = 200;

export type TimeframeStates = Record<number, TfState>;

export type StatusInfo = {
  status: ConnectionStatus;
  detail?: string;
};

export type DashboardData = {
  assets: Asset[];
  states: Record<string, TimeframeStates>;
  status: StatusInfo;
  lastTick: number | null;
  prices: Record<string, number>;
  loaded: boolean;
};

function emptyTimeframes(): TimeframeStates {
  return Object.fromEntries(
    TIMEFRAMES.map((timeframe) => [timeframe.granularity, emptyTfState(timeframe)]),
  ) as TimeframeStates;
}

function toAsset(symbol: DerivSymbol): Asset {
  return {
    symbol: symbol.symbol,
    name: symbol.displayName,
    fullName: symbol.displayName,
    digits: symbol.digits,
    exchange: 'DERIV',
  };
}

function timeframeFor(granularity: number): Timeframe | undefined {
  return TIMEFRAMES.find((timeframe) => timeframe.granularity === granularity);
}

function latestConfirmedEpoch(candles: Candle[], granularity: number, nowEpoch: number): number | null {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index].epoch + granularity <= nowEpoch) return candles[index].epoch;
  }
  return null;
}

async function runTasksInBatches(tasks: Array<() => Promise<void>>, batchSize = 8): Promise<void> {
  for (let index = 0; index < tasks.length; index += batchSize) {
    await Promise.all(tasks.slice(index, index + batchSize).map((task) => task().catch(() => undefined)));
  }
}

export function useDerivSignals(selectedSymbols: string[]): DashboardData {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [states, setStates] = useState<Record<string, TimeframeStates>>({});
  const [status, setStatus] = useState<StatusInfo>({ status: 'closed' });
  const [lastTick, setLastTick] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const candlesRef = useRef<Record<string, Record<number, Candle[]>>>({});
  const computedConfirmedRef = useRef<Record<string, number>>({});
  const pendingPricesRef = useRef<Record<string, number>>({});
  const pendingLastTickRef = useRef<number | null>(null);
  const priceFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChartUpdatesRef = useRef<Record<string, Record<number, Candle[]>>>({});
  const activeSymbolsKey = selectedSymbols.join('|');
  const selectedRef = useRef(selectedSymbols);
  const watchedRef = useRef<Set<string>>(new Set(selectedSymbols));
  selectedRef.current = selectedSymbols;

  const recompute = useCallback((symbol: string, granularity: number) => {
    const timeframe = timeframeFor(granularity);
    if (!timeframe) return;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const candles = candlesRef.current[symbol]?.[granularity] ?? [];
    const state = computeTfState(timeframe, candles, nowEpoch);
    setStates((previous) => ({
      ...previous,
      [symbol]: {
        ...(previous[symbol] ?? emptyTimeframes()),
        [granularity]: state,
      },
    }));
  }, []);

  useEffect(() => {
    const client = new DerivClient();
    const binanceStream = new BinanceStream();
    let derivAssets: Asset[] = [];
    let binanceAssets: Asset[] = [];
    let derivLoaded = false;
    let binanceLoaded = false;
    let stopped = false;
    const publishAssets = () => setAssets([...derivAssets, ...binanceAssets]);
    const markLoaded = () => { if (!stopped && derivLoaded && binanceLoaded) setLoaded(true); };
    candlesRef.current = {};
    computedConfirmedRef.current = {};
    pendingPricesRef.current = {};
    pendingLastTickRef.current = null;
    if (priceFlushTimerRef.current) clearTimeout(priceFlushTimerRef.current);
    if (chartFlushTimerRef.current) clearTimeout(chartFlushTimerRef.current);
    priceFlushTimerRef.current = null;
    chartFlushTimerRef.current = null;
    pendingChartUpdatesRef.current = {};
    setStates({});
    setPrices({});
    setLoaded(false);

    const hydrateSyntheticFromHourly = (symbol: string, hourlyCandles: Candle[]) => {
      for (const timeframe of SYNTHETIC_TIMEFRAMES) {
        const aggregated = aggregateHourlyCandles(hourlyCandles, timeframe.granularity);
        candlesRef.current[symbol] ??= {};
        candlesRef.current[symbol][timeframe.granularity] = aggregated;
        pendingChartUpdatesRef.current[symbol] ??= {};
        pendingChartUpdatesRef.current[symbol][timeframe.granularity] = aggregated;
        const confirmedEpoch = latestConfirmedEpoch(aggregated, timeframe.granularity, Math.floor(Date.now() / 1000));
        const computeKey = `${symbol}:${timeframe.granularity}`;
        if (confirmedEpoch !== null && computedConfirmedRef.current[computeKey] !== confirmedEpoch) {
          computedConfirmedRef.current[computeKey] = confirmedEpoch;
          recompute(symbol, timeframe.granularity);
        }
      }
      if (!chartFlushTimerRef.current) {
        chartFlushTimerRef.current = setTimeout(() => {
          const updates = pendingChartUpdatesRef.current;
          pendingChartUpdatesRef.current = {};
          chartFlushTimerRef.current = null;
          setStates((previous) => {
            let changed = false;
            const next = { ...previous };
            for (const [assetSymbol, timeframeUpdates] of Object.entries(updates)) {
              const existingAsset = next[assetSymbol];
              if (!existingAsset) continue;
              let nextAsset = existingAsset;
              for (const [rawGranularity, chartCandles] of Object.entries(timeframeUpdates)) {
                const granularityKey = Number(rawGranularity);
                const existingState = nextAsset[granularityKey];
                if (!existingState || existingState.chartCandles === chartCandles) continue;
                if (nextAsset === existingAsset) nextAsset = { ...existingAsset };
                nextAsset[granularityKey] = { ...existingState, chartCandles };
                changed = true;
              }
              if (nextAsset !== existingAsset) next[assetSymbol] = nextAsset;
            }
            return changed ? next : previous;
          });
        }, 250);
      }
    };

    const applyCandle = (symbol: string, granularity: number, candle: Candle) => {
      if (!symbol || !watchedRef.current.has(symbol)) return;
      pendingLastTickRef.current = candle.epoch;
      pendingPricesRef.current[symbol] = candle.close;
      if (!priceFlushTimerRef.current) {
        priceFlushTimerRef.current = setTimeout(() => {
          const updates = pendingPricesRef.current;
          pendingPricesRef.current = {};
          priceFlushTimerRef.current = null;
          setPrices((previous) => ({ ...previous, ...updates }));
          if (pendingLastTickRef.current !== null) setLastTick(pendingLastTickRef.current);
          pendingLastTickRef.current = null;
        }, 350);
      }
      candlesRef.current[symbol] ??= {};
      const nextCandles = mergeCandle(candlesRef.current[symbol][granularity] ?? [], candle);
      candlesRef.current[symbol][granularity] = nextCandles;
      if (granularity === HOURLY_GRANULARITY) {
        hydrateSyntheticFromHourly(symbol, nextCandles);
      }
      // Keep chart candles live independently from closed-candle signal calculations.
      pendingChartUpdatesRef.current[symbol] ??= {};
      pendingChartUpdatesRef.current[symbol][granularity] = nextCandles;
      if (!chartFlushTimerRef.current) {
        chartFlushTimerRef.current = setTimeout(() => {
          const updates = pendingChartUpdatesRef.current;
          pendingChartUpdatesRef.current = {};
          chartFlushTimerRef.current = null;
          setStates((previous) => {
            let changed = false;
            const next = { ...previous };
            for (const [assetSymbol, timeframeUpdates] of Object.entries(updates)) {
              const existingAsset = next[assetSymbol];
              if (!existingAsset) continue;
              let nextAsset = existingAsset;
              for (const [rawGranularity, chartCandles] of Object.entries(timeframeUpdates)) {
                const granularityKey = Number(rawGranularity);
                const existingState = nextAsset[granularityKey];
                if (!existingState) continue;
                if (existingState.chartCandles === chartCandles) continue;
                if (nextAsset === existingAsset) nextAsset = { ...existingAsset };
                nextAsset[granularityKey] = { ...existingState, chartCandles };
                changed = true;
              }
              if (nextAsset !== existingAsset) next[assetSymbol] = nextAsset;
            }
            return changed ? next : previous;
          });
        }, 250);
      }
      const confirmedEpoch = latestConfirmedEpoch(nextCandles, granularity, Math.floor(Date.now() / 1000));
      const computeKey = `${symbol}:${granularity}`;
      if (confirmedEpoch !== null && computedConfirmedRef.current[computeKey] !== confirmedEpoch) {
        computedConfirmedRef.current[computeKey] = confirmedEpoch;
        recompute(symbol, granularity);
      }
    };

    const unsubStatus = client.onStatus((nextStatus, detail) => {
      setStatus({ status: nextStatus, detail });
    });

    const unsubOpen = client.onOpen(() => {
      setLoaded(false);
      derivLoaded = false;
      client.forgetAllCandles().finally(() => {
        client
          .loadActiveSymbols()
          .then((symbols) => {
            derivAssets = symbols.map(toAsset);
            publishAssets();
            const currentAssets = selectedRef.current.filter((symbol) =>
              symbols.some((item) => item.symbol === symbol),
            );
            const allSymbols = symbols.map((item) => item.symbol);
            // Keep every discovered market eligible for background 8-timeframe scanning.
            watchedRef.current = new Set([...allSymbols, ...binanceAssets.map((asset) => asset.symbol)]);
            const selectedM15Tasks = currentAssets.map((symbol) => () =>
              client
                .subscribeCandles(symbol, M15_GRANULARITY, ALL_ASSET_M15_HISTORY)
                .then((candles) => {
                  candlesRef.current[symbol] ??= {};
                  candlesRef.current[symbol][M15_GRANULARITY] = candles;
                  const confirmedEpoch = latestConfirmedEpoch(candles, M15_GRANULARITY, Math.floor(Date.now() / 1000));
                  if (confirmedEpoch !== null) computedConfirmedRef.current[`${symbol}:${M15_GRANULARITY}`] = confirmedEpoch;
                  recompute(symbol, M15_GRANULARITY);
                }),
            );
            const selectedHigherTimeframeTasks = currentAssets.flatMap((symbol) =>
              NATIVE_TIMEFRAMES.filter((timeframe) => timeframe.granularity !== M15_GRANULARITY).map((timeframe) => () =>
                client
                  .subscribeCandles(symbol, timeframe.granularity, timeframe.candleCount)
                  .then((candles) => {
                    candlesRef.current[symbol] ??= {};
                    candlesRef.current[symbol][timeframe.granularity] = candles;
                    const confirmedEpoch = latestConfirmedEpoch(candles, timeframe.granularity, Math.floor(Date.now() / 1000));
                    if (confirmedEpoch !== null) computedConfirmedRef.current[`${symbol}:${timeframe.granularity}`] = confirmedEpoch;
                    recompute(symbol, timeframe.granularity);
                    if (timeframe.granularity === HOURLY_GRANULARITY) hydrateSyntheticFromHourly(symbol, candles);
                  }),
              ),
            );
            const selectedSet = new Set(currentAssets);
            const backgroundMarketTasks = allSymbols
              .filter((symbol) => !selectedSet.has(symbol))
              .flatMap((symbol) => NATIVE_TIMEFRAMES.map((timeframe) => () => {
                const granularity = timeframe.granularity;
                const historyCount = granularity === M15_GRANULARITY ? ALL_ASSET_M15_HISTORY : timeframe.candleCount;
                return client.subscribeCandles(symbol, granularity, historyCount).then((candles) => {
                  candlesRef.current[symbol] ??= {};
                  candlesRef.current[symbol][granularity] = candles;
                  const confirmedEpoch = latestConfirmedEpoch(candles, granularity, Math.floor(Date.now() / 1000));
                  if (confirmedEpoch !== null) computedConfirmedRef.current[`${symbol}:${granularity}`] = confirmedEpoch;
                  recompute(symbol, granularity);
                  if (granularity === HOURLY_GRANULARITY) hydrateSyntheticFromHourly(symbol, candles);
                });
              }));

            // Prioritise selected dashboard feeds; finish the all-market scan setup in the background.
            return client.staggerSubscriptions([
              ...selectedM15Tasks,
              ...selectedHigherTimeframeTasks,
            ]).then(() => {
              derivLoaded = true;
              markLoaded();
              // Complete the same eight-timeframe scan for every unselected Deriv market.
              // Selected assets retain their prioritised feeds above.
              if (backgroundMarketTasks.length > 0) void client.staggerSubscriptions(backgroundMarketTasks);
            });
          })
          .catch((error: Error) => {
            setStatus({ status: 'error', detail: error.message });
          });
      });
    });

    const unsubOhlc = client.onOhlc(({ granularity, candle }) => {
      applyCandle(candle.symbol ?? '', granularity, candle);
    });

    // Binance spot is an additional public market-data source. Its assets use
    // the same eight timeframe calculations and state model as Deriv assets.
    void loadBinanceAssets().then(async (markets) => {
      if (stopped) return;
      binanceAssets = markets.map((market) => ({
        symbol: market.symbol, name: market.name, fullName: market.displayName,
        digits: market.digits, exchange: 'BINANCE' as const,
      }));
      publishAssets();
      // Super Signal scans the full Binance spot universe, not only dashboard selections.
      const allMarkets = binanceAssets;
      watchedRef.current = new Set([...watchedRef.current, ...allMarkets.map((asset) => asset.symbol)]);
      const loadMarketTasks = (markets: Asset[]) => markets.flatMap((asset) =>
        NATIVE_TIMEFRAMES.map((timeframe) => async () => {
          const candles = await fetchBinanceCandles(asset.symbol, timeframe, timeframe.candleCount);
          if (stopped) return;
          candlesRef.current[asset.symbol] ??= {};
          candlesRef.current[asset.symbol][timeframe.granularity] = candles;
          const confirmedEpoch = latestConfirmedEpoch(candles, timeframe.granularity, Math.floor(Date.now() / 1000));
          if (confirmedEpoch !== null) computedConfirmedRef.current[`${asset.symbol}:${timeframe.granularity}`] = confirmedEpoch;
          recompute(asset.symbol, timeframe.granularity);
          if (timeframe.granularity === HOURLY_GRANULARITY) hydrateSyntheticFromHourly(asset.symbol, candles);
        }),
      );
      const selectedMarkets = allMarkets.filter((asset) => selectedRef.current.includes(asset.symbol));
      const backgroundMarkets = allMarkets.filter((asset) => !selectedRef.current.includes(asset.symbol));
      // Load selected Binance assets first so the rest of the dashboard becomes usable quickly.
      await runTasksInBatches(loadMarketTasks(selectedMarkets), 8);
      if (stopped) return;
      binanceStream.start(allMarkets.map((asset) => asset.symbol), NATIVE_TIMEFRAMES, (granularity, candle) => applyCandle(candle.symbol ?? '', granularity, candle));
      binanceLoaded = true;
      markLoaded();
      // Continue filling the all-market Super Signal scan without blocking the dashboard.
      void runTasksInBatches(loadMarketTasks(backgroundMarkets), 8);
    }).catch((error: Error) => {
      if (stopped) return;
      binanceLoaded = true;
      setStatus((previous) => ({ ...previous, detail: `Binance market data unavailable: ${error.message}` }));
      markLoaded();
    });

    client.start();
    return () => {
      stopped = true;
      binanceStream.stop();
      unsubStatus();
      unsubOpen();
      unsubOhlc();
      if (priceFlushTimerRef.current) clearTimeout(priceFlushTimerRef.current);
      if (chartFlushTimerRef.current) clearTimeout(chartFlushTimerRef.current);
      priceFlushTimerRef.current = null;
      chartFlushTimerRef.current = null;
      pendingChartUpdatesRef.current = {};
      client.stop();
    };
  }, [activeSymbolsKey, recompute]);

  return { assets, states, status, lastTick, prices, loaded };
}

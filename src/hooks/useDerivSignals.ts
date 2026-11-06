import { useCallback, useEffect, useRef, useState } from 'react';
import { DerivClient, type Candle, type ConnectionStatus, type DerivSymbol } from '@/lib/deriv';
import {
  TIMEFRAMES,
  aggregateWeeklyCandles,
  computeTfState,
  emptyTfState,
  mergeCandle,
  type Asset,
  type TfState,
  type Timeframe,
} from '@/lib/sma';

const DAILY_GRANULARITY = 86400;
const WEEKLY_TIMEFRAME = TIMEFRAMES.find((timeframe) => timeframe.label === 'W1')!;
const LIVE_TIMEFRAMES = TIMEFRAMES.filter((timeframe) => timeframe.label !== 'W1');
const M15_GRANULARITY = 900;
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
  const priceFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const weeklyState = granularity === DAILY_GRANULARITY
      ? computeTfState(WEEKLY_TIMEFRAME, aggregateWeeklyCandles(candles, nowEpoch), nowEpoch)
      : null;
    setStates((previous) => ({
      ...previous,
      [symbol]: {
        ...(previous[symbol] ?? emptyTimeframes()),
        [granularity]: state,
        ...(weeklyState ? { [WEEKLY_TIMEFRAME.granularity]: weeklyState } : {}),
      },
    }));
  }, []);

  useEffect(() => {
    const client = new DerivClient();
    candlesRef.current = {};
    computedConfirmedRef.current = {};
    pendingPricesRef.current = {};
    if (priceFlushTimerRef.current) clearTimeout(priceFlushTimerRef.current);
    priceFlushTimerRef.current = null;
    setStates({});
    setPrices({});
    setLoaded(false);

    const unsubStatus = client.onStatus((nextStatus, detail) => {
      setStatus({ status: nextStatus, detail });
    });

    const unsubOpen = client.onOpen(() => {
      setLoaded(false);
      client.forgetAllCandles().finally(() => {
        client
          .loadActiveSymbols()
          .then((symbols) => {
            setAssets(symbols.map(toAsset));
            const currentAssets = selectedRef.current.filter((symbol) =>
              symbols.some((item) => item.symbol === symbol),
            );
            const allSymbols = symbols.map((item) => item.symbol);
            watchedRef.current = new Set(allSymbols);
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
              LIVE_TIMEFRAMES.filter((timeframe) => timeframe.granularity !== M15_GRANULARITY).map((timeframe) => () =>
                client
                  .subscribeCandles(symbol, timeframe.granularity, timeframe.candleCount)
                  .then((candles) => {
                    candlesRef.current[symbol] ??= {};
                    candlesRef.current[symbol][timeframe.granularity] = candles;
                    const confirmedEpoch = latestConfirmedEpoch(candles, timeframe.granularity, Math.floor(Date.now() / 1000));
                    if (confirmedEpoch !== null) computedConfirmedRef.current[`${symbol}:${timeframe.granularity}`] = confirmedEpoch;
                    recompute(symbol, timeframe.granularity);
                  }),
              ),
            );
            const selectedSet = new Set(currentAssets);
            const backgroundM15Tasks = allSymbols.filter((symbol) => !selectedSet.has(symbol)).map((symbol) => () =>
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

            // Prioritise selected dashboard feeds; finish the all-market scan setup in the background.
            return client.staggerSubscriptions([
              ...selectedM15Tasks,
              ...selectedHigherTimeframeTasks,
            ]).then(() => {
              setLoaded(true);
              if (backgroundM15Tasks.length > 0) void client.staggerSubscriptions(backgroundM15Tasks);
            });
          })
          .catch((error: Error) => {
            setStatus({ status: 'error', detail: error.message });
          });
      });
    });

    const unsubOhlc = client.onOhlc(({ granularity, candle }) => {
      const symbol = candle.symbol ?? '';
      if (!symbol || !watchedRef.current.has(symbol)) return;
      setLastTick(candle.epoch);
      pendingPricesRef.current[symbol] = candle.close;
      if (!priceFlushTimerRef.current) {
        priceFlushTimerRef.current = setTimeout(() => {
          const updates = pendingPricesRef.current;
          pendingPricesRef.current = {};
          priceFlushTimerRef.current = null;
          setPrices((previous) => ({ ...previous, ...updates }));
        }, 350);
      }

      candlesRef.current[symbol] ??= {};
      const current = candlesRef.current[symbol][granularity] ?? [];
      const nextCandles = mergeCandle(current, candle);
      candlesRef.current[symbol][granularity] = nextCandles;

      // Forming-candle updates refresh prices only. Recalculate signals when a
      // newly completed candle becomes available, not on every market tick.
      const confirmedEpoch = latestConfirmedEpoch(nextCandles, granularity, Math.floor(Date.now() / 1000));
      const computeKey = `${symbol}:${granularity}`;
      if (confirmedEpoch !== null && computedConfirmedRef.current[computeKey] !== confirmedEpoch) {
        computedConfirmedRef.current[computeKey] = confirmedEpoch;
        recompute(symbol, granularity);
      }
    });

    client.start();
    return () => {
      unsubStatus();
      unsubOpen();
      unsubOhlc();
      if (priceFlushTimerRef.current) clearTimeout(priceFlushTimerRef.current);
      priceFlushTimerRef.current = null;
      client.stop();
    };
  }, [activeSymbolsKey, recompute]);

  return { assets, states, status, lastTick, prices, loaded };
}

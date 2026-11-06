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

export function useDerivSignals(selectedSymbols: string[]): DashboardData {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [states, setStates] = useState<Record<string, TimeframeStates>>({});
  const [status, setStatus] = useState<StatusInfo>({ status: 'closed' });
  const [lastTick, setLastTick] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const candlesRef = useRef<Record<string, Record<number, Candle[]>>>({});
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
            const tasks = allSymbols.map((symbol) => () =>
              client
                .subscribeCandles(symbol, M15_GRANULARITY, ALL_ASSET_M15_HISTORY)
                .then((candles) => {
                  candlesRef.current[symbol] ??= {};
                  candlesRef.current[symbol][M15_GRANULARITY] = candles;
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
                    recompute(symbol, timeframe.granularity);
                  }),
              ),
            );
            return client.staggerSubscriptions([...tasks, ...selectedHigherTimeframeTasks]);
          })
          .then(() => setLoaded(true))
          .catch((error: Error) => {
            setStatus({ status: 'error', detail: error.message });
          });
      });
    });

    const unsubOhlc = client.onOhlc(({ granularity, candle }) => {
      const symbol = candle.symbol ?? '';
      if (!symbol || !watchedRef.current.has(symbol)) return;
      setLastTick(candle.epoch);
      setPrices((previous) => ({ ...previous, [symbol]: candle.close }));
      candlesRef.current[symbol] ??= {};
      const current = candlesRef.current[symbol][granularity] ?? [];
      candlesRef.current[symbol][granularity] = mergeCandle(current, candle);
      recompute(symbol, granularity);
    });

    client.start();
    return () => {
      unsubStatus();
      unsubOpen();
      unsubOhlc();
      client.stop();
    };
  }, [activeSymbolsKey, recompute]);

  return { assets, states, status, lastTick, prices, loaded };
}

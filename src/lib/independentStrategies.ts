import type { Asset, TfState } from '@/lib/sma';
import type { SignalView } from '@/lib/signals';
import type { StopOrderIdea } from '@/lib/stopOrders';
import type { SuperSignal } from '@/lib/intelligence';
import { buildBreakRetestSetups } from '@/lib/breakRetest';
import { buildMarketStructureSarSignal } from '@/lib/marketStructureSar';
import { evaluateThreeHourWick } from '@/lib/threeHourWick';
import type { StrategyAssessment } from '@/lib/strategyConfluence';

export function buildIndependentStrategyAssessments(
  assets: Asset[],
  states: Record<string, Record<number, TfState>>,
  signals: SignalView[],
  pending: StopOrderIdea[],
  superSignals: SuperSignal[],
  nowEpoch: number,
): StrategyAssessment[] {
  const rows: StrategyAssessment[] = [];

  // Keep every signal still present in the candle history for outcome replay.
  // Confluence independently reduces these rows to the newest result per strategy.
  for (const item of signals) {
    rows.push({
      strategyId: 'bollinger-cross',
      strategyName: 'Bollinger Candle-Close',
      symbol: item.symbol,
      direction: item.signal.direction,
      status: nowEpoch - item.signal.signalEpoch <= item.granularity * 2 ? 'SIGNAL' : 'STALE',
      signalEpoch: item.signal.signalEpoch,
      strength: 76,
      reason: `Confirmed ${item.timeframe} candle-close cross`,
      timeframe: item.timeframe,
      granularity: item.granularity,
      entry: item.signal.levels.entry,
      stopLoss: item.signal.levels.stopLoss,
      target: item.signal.levels.tp3,
      entryMode: 'MARKET',
    });
  }

  for (const setup of buildBreakRetestSetups(assets, states)) {
    rows.push({
      strategyId: 'break-retest',
      strategyName: 'Break & Retest',
      symbol: setup.symbol,
      direction: setup.direction,
      status: 'SIGNAL',
      signalEpoch: setup.confirmationEpoch,
      strength: 82,
      reason: 'Break, retest and confirmation candle closed',
      timeframe: setup.timeframe,
      granularity: setup.granularity,
      entry: setup.entry,
      stopLoss: setup.stopLoss,
      target: setup.target,
      entryMode: 'LIMIT',
    });
  }

  for (const asset of assets) {
    const sar = buildMarketStructureSarSignal(asset.symbol, states[asset.symbol]?.[1800]?.candles ?? [], nowEpoch);
    if (sar) {
      rows.push({
        strategyId: 'market-structure-sar',
        strategyName: 'Market Structure SAR',
        symbol: asset.symbol,
        direction: sar.direction,
        status: 'SIGNAL',
        signalEpoch: sar.signalEpoch,
        strength: 80,
        reason: `Confirmed ${sar.structure} with SAR flip`,
        timeframe: sar.timeframe,
        granularity: 1800,
        entry: sar.entry,
        stopLoss: sar.stopLoss,
        entryMode: 'MARKET',
      });
    }
  }

  for (const idea of pending) {
    if (idea.status === 'INVALIDATED' || idea.status === 'EXPIRED') continue;
    rows.push({
      strategyId: idea.patternType === 'TRIPLE TOP' ? 'triple-top' : 'triple-bottom',
      strategyName: idea.patternType === 'TRIPLE TOP' ? 'Triple Top' : 'Triple Bottom',
      symbol: idea.symbol,
      direction: idea.direction,
      status: 'SIGNAL',
      signalEpoch: idea.signalEpoch,
      strength: 72,
      reason: 'Three-test support/resistance limit setup',
      timeframe: idea.timeframeLabel,
      granularity: idea.granularity,
      entry: idea.entry,
      stopLoss: idea.stopLoss,
      target: idea.takeProfit,
      entryMode: 'LIMIT',
    });
  }

  for (const asset of assets) {
    const unified = superSignals.find((item) => item.symbol === asset.symbol);
    const wick = evaluateThreeHourWick(
      asset.symbol,
      states[asset.symbol]?.[14400]?.candles ?? [],
      nowEpoch,
      unified ? { symbol: unified.symbol, direction: unified.direction, signalEpoch: unified.signalEpoch } : null,
    );
    if (wick.status !== 'CONFIRMED') continue;
    const candidate = wick.candidate;
    rows.push({
      strategyId: 'three-hour-wick',
      strategyName: '3H Wick Intelligence',
      symbol: asset.symbol,
      direction: candidate.direction,
      status: 'SIGNAL',
      signalEpoch: candidate.signalEpoch,
      strength: 78,
      reason: 'H4 wick rejection confirmed by fresh Super Signal',
      timeframe: 'H4',
      granularity: 14400,
      entry: candidate.entry,
      stopLoss: candidate.initialStopLoss,
      entryMode: 'MARKET',
    });
  }

  return rows;
}

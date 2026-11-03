import type { SignalRecordRow } from './signalRecords';
import type { Direction, SignalLevels } from './signals';

type TrainingRow = {
  features: number[];
  label: number;
};

export type SignalLearningModel = {
  ready: boolean;
  sampleCount: number;
  wins: number;
  losses: number;
  weights: number[];
};

function features(granularity: number, direction: Direction, levels: SignalLevels): number[] {
  const timeframe = Math.log2(Math.max(1, granularity / 60)) / 7;
  const side = direction === 'BUY' ? 1 : -1;
  const distance = levels.deviation > 0
    ? Math.max(-3, Math.min(3, (levels.entry - levels.mean) / levels.deviation)) / 3
    : 0;
  return [1, side, timeframe, distance];
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, value))));
}

/**
 * A small logistic-regression model trained only on completed historical outcomes.
 * TP3 is a positive result; Stop-loss is a negative result. Reversed/open records
 * are deliberately excluded because they are not comparable final outcomes.
 */
export function trainSignalLearningModel(rows: SignalRecordRow[]): SignalLearningModel {
  const training: TrainingRow[] = rows
    .filter((row) => row.closed && (row.status === 'TP3' || row.status === 'Stopped'))
    .map((row) => ({
      features: features(row.granularity, row.direction, {
        mean: row.band_mean,
        deviation: row.band_deviation,
        entry: row.entry,
        stopLoss: row.stop_loss,
        tp1: row.tp1,
        tp2: row.tp2,
        tp3: row.tp3,
      }),
      label: row.status === 'TP3' ? 1 : 0,
    }));

  const wins = training.filter((row) => row.label === 1).length;
  const losses = training.length - wins;
  const ready = training.length >= 30 && wins >= 8 && losses >= 8;
  const weights = [0, 0, 0, 0];

  if (ready) {
    const learningRate = 0.08;
    const iterations = 500;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const gradients = [0, 0, 0, 0];
      for (const row of training) {
        const prediction = sigmoid(weights.reduce(
          (sum, weight, index) => sum + weight * row.features[index],
          0,
        ));
        const error = prediction - row.label;
        row.features.forEach((value, index) => {
          gradients[index] += error * value;
        });
      }
      weights.forEach((_, index) => {
        weights[index] -= learningRate * gradients[index] / training.length;
      });
    }
  }

  return { ready, sampleCount: training.length, wins, losses, weights };
}

export function getAiPatternScore(
  model: SignalLearningModel,
  granularity: number,
  direction: Direction,
  levels: SignalLevels,
): number | null {
  if (!model.ready) return null;
  const input = features(granularity, direction, levels);
  const probability = sigmoid(model.weights.reduce(
    (sum, weight, index) => sum + weight * input[index],
    0,
  ));
  return Math.round(probability * 100);
}

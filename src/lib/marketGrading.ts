export type MarketGradeInput = { change24h: number | null; momentum: number | null; acceleration: number | null };
export type MarketGrade = { score: number | null; grade: string; label: string; explanation: string };
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const normalise = (value: number, scale: number) => clamp(Math.tanh(value / scale));
export function gradeMarket(input: MarketGradeInput): MarketGrade {
  const parts = [input.change24h, input.momentum, input.acceleration];
  if (parts.some((value) => value == null || !Number.isFinite(value!))) return { score: null, grade: '—', label: 'Building data', explanation: 'More market data is needed before this asset can be graded.' };
  const daily = normalise(input.change24h!, 8), momentum = normalise(input.momentum!, 2), acceleration = normalise(input.acceleration!, 0.75);
  const score = Math.round((daily * 40 + momentum * 40 + acceleration * 20));
  const grade = score >= 65 ? 'A' : score >= 35 ? 'B' : score >= 10 ? 'C' : score > -10 ? 'D' : score > -35 ? 'E' : score > -65 ? 'F' : 'G';
  const direction = score >= 10 ? 'upward' : score <= -10 ? 'downward' : 'mixed';
  const dailyText = input.change24h! >= 0 ? 'has gained' : 'has fallen';
  const momentumText = input.momentum! >= 0 ? 'recent movement is positive' : 'recent movement is negative';
  const accelerationText = input.acceleration! > 0.03 ? 'and the move is strengthening' : input.acceleration! < -0.03 ? 'but the move is weakening' : 'and the move is steady';
  const label = direction === 'upward' ? 'Strong upward momentum' : direction === 'downward' ? 'Strong downward momentum' : 'Mixed market movement';
  return { score, grade, label, explanation: `This asset ${dailyText} over 24 hours; ${momentumText}, ${accelerationText}.` };
}
export function candleMomentum(closes: number[]): { momentum: number | null; acceleration: number | null } {
  if (closes.length < 13) return { momentum: null, acceleration: null };
  const pct = (a: number, b: number) => b !== 0 ? ((a - b) / b) * 100 : null;
  const latest = closes[closes.length - 1], prior6 = closes[closes.length - 7], prior12 = closes[closes.length - 13];
  const momentum = pct(latest, prior6), previousMomentum = pct(prior6, prior12);
  return { momentum, acceleration: momentum == null || previousMomentum == null ? null : momentum - previousMomentum };
}
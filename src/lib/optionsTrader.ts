/**
 * Shared Deriv Options contract defaults and proposal validation.
 * Keep contract duration independent from the market-analysis timeframe.
 */
export const OPTIONS_CONTRACT_DURATION_MINUTES = 30;
export const OPTIONS_CONTRACT_DURATION_UNIT = 'm' as const;
export const OPTIONS_BB_DEVIATION = 2.5;

export type OptionsDirection = 'BUY' | 'SELL';
export type OptionsContractKind = 'ONETOUCH' | 'NOTOUCH';

export interface OptionsBarrierInputs {
  direction: OptionsDirection;
  contractKind: OptionsContractKind;
  spot: number;
  bollingerUpper: number;
  bollingerLower: number;
}

/**
 * Places the barrier at the relevant 2.5-deviation Bollinger boundary.
 * The offset is relative to spot, as required for short-duration Deriv contracts.
 * Both contract kinds use the same directional barrier: ONETOUCH wins if reached;
 * NOTOUCH wins if it is not reached before expiry.
 * The broker proposal remains the final authority on contract availability/pricing.
 */
export function buildOptionsBarrier(input: OptionsBarrierInputs): string | null {
  const { direction, spot, bollingerUpper, bollingerLower } = input;
  if (![spot, bollingerUpper, bollingerLower].every(Number.isFinite)) return null;
  if (spot <= 0 || bollingerUpper <= bollingerLower) return null;

  const absoluteBarrier = direction === 'BUY' ? bollingerUpper : bollingerLower;
  const offset = absoluteBarrier - spot;
  if (!Number.isFinite(offset) || offset === 0) return null;

  // Deriv expects a signed relative barrier for contracts shorter than 24 hours.
  return offset > 0 ? `+${offset.toString()}` : offset.toString();
}

export function isValidOptionsStake(value: string, minimumStake: number): boolean {
  const stake = Number(value);
  return Number.isFinite(stake) && Number.isFinite(minimumStake) && minimumStake > 0 && stake >= minimumStake;
}

export function optionsContractType(kind: OptionsContractKind): OptionsContractKind {
  return kind;
}

export const OPTIONS_CONTRACT_DURATION_MINUTES = 30;

type BarrierInput = {
  direction: 'BUY' | 'SELL';
  contractKind: 'ONETOUCH' | 'NOTOUCH';
  spot: number;
  bollingerUpper: number;
  bollingerLower: number;
};

/**
 * Returns a signed distance from spot to the relevant Bollinger boundary.
 * This is a quote input only; no contract is purchased by this helper.
 */
export function buildOptionsBarrier(input: BarrierInput): string | null {
  const { direction, spot, bollingerUpper, bollingerLower } = input;
  if (![spot, bollingerUpper, bollingerLower].every(Number.isFinite)) return null;
  if (spot <= 0 || bollingerUpper <= bollingerLower) return null;

  const distance = direction === 'BUY'
    ? bollingerUpper - spot
    : bollingerLower - spot;
  if (!Number.isFinite(distance) || distance === 0) return null;

  return distance.toFixed(6);
}

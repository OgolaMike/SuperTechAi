/**
 * Shared Options Trader execution contract.
 *
 * This module contains deterministic domain rules only. It is not an execution
 * client and must never be treated as the security boundary: each backend
 * (Supabase and Appwrite) must repeat these checks server-side before buying.
 */
export type OptionsTradeStatus =
  | 'PROPOSED'
  | 'PURCHASE_PENDING'
  | 'OPEN'
  | 'WON'
  | 'LOST'
  | 'SOLD'
  | 'REJECTED'
  | 'UNKNOWN';

export type OptionsAccountMode = 'demo' | 'real';

export interface OptionsProposalSnapshot {
  proposalId: string;
  askPrice: number;
  payout: number;
  spot: number;
  barrier: string;
  contractType: OptionsContractKind;
  symbol: string;
  createdAtEpoch: number;
  expiresAtEpoch: number;
}

export interface OptionsPurchaseGuard {
  proposal: OptionsProposalSnapshot;
  nowEpoch: number;
  accountMode: OptionsAccountMode;
  authorisedAccountMode: OptionsAccountMode;
  accountStatus: string;
  automationEnabled: boolean;
  stake: number;
  configuredStakeLimit: number;
  availableBalance: number;
  alreadyPurchasedProposalIds: readonly string[];
  expectedSymbol: string;
  expectedContractType: OptionsContractKind;
}

/**
 * Fail closed. The backend must independently apply the same checks using
 * server-owned account credentials, settings and persisted idempotency keys.
 */
export function validateOptionsPurchase(input: OptionsPurchaseGuard): string | null {
  const { proposal, nowEpoch } = input;
  if (!input.automationEnabled) return 'automation_disabled';
  if (input.accountMode !== input.authorisedAccountMode) return 'account_mode_mismatch';
  if (input.accountStatus.toLowerCase() !== 'active') return 'account_not_active';
  if (!proposal.proposalId.trim()) return 'missing_proposal_id';
  if (proposal.symbol !== input.expectedSymbol) return 'symbol_mismatch';
  if (proposal.contractType !== input.expectedContractType) return 'contract_mismatch';
  if (![proposal.askPrice, proposal.payout, proposal.spot, input.stake, input.configuredStakeLimit, input.availableBalance, nowEpoch, proposal.createdAtEpoch, proposal.expiresAtEpoch].every(Number.isFinite)) return 'invalid_numeric_value';
  if (input.stake <= 0 || input.stake > input.configuredStakeLimit) return 'stake_out_of_bounds';
  if (input.stake > input.availableBalance) return 'insufficient_balance';
  if (proposal.askPrice <= 0 || proposal.payout <= 0 || proposal.spot <= 0) return 'invalid_proposal_price';
  if (proposal.createdAtEpoch > nowEpoch || proposal.expiresAtEpoch <= nowEpoch) return 'proposal_expired';
  if (input.alreadyPurchasedProposalIds.includes(proposal.proposalId)) return 'proposal_already_purchased';
  return null;
}

const ALLOWED_TRANSITIONS: Record<OptionsTradeStatus, readonly OptionsTradeStatus[]> = {
  PROPOSED: ['PURCHASE_PENDING', 'REJECTED', 'UNKNOWN'],
  PURCHASE_PENDING: ['OPEN', 'REJECTED', 'UNKNOWN'],
  OPEN: ['WON', 'LOST', 'SOLD', 'UNKNOWN'],
  WON: [],
  LOST: [],
  SOLD: [],
  REJECTED: [],
  UNKNOWN: ['OPEN', 'WON', 'LOST', 'SOLD', 'REJECTED'],
};

/** Enforce monotonic, auditable lifecycle transitions. */
export function canTransitionOptionsTrade(from: OptionsTradeStatus, to: OptionsTradeStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * A timed-out buy is UNKNOWN, not failed. The backend must reconcile it with
 * Deriv's contract/statement before retrying; blindly retrying can double-buy.
 */
export function resolveOptionsBuyTimeout(): OptionsTradeStatus {
  return 'UNKNOWN';
}

/**
 * Shared, backend-neutral ledger contract for Deriv Options Trader.
 *
 * This file defines the durable record shapes and deterministic idempotency
 * helpers only. Supabase Edge Functions and Appwrite Functions must persist
 * and enforce these rules independently; browser code is never authoritative.
 */
import type { OptionsAccountMode, OptionsTradeStatus, OptionsProposalSnapshot } from './optionsTraderLifecycle';

export type OptionsExecutionStatus =
  | 'RESERVED'
  | 'BUY_SENT'
  | 'UNKNOWN'
  | 'OPEN'
  | 'WON'
  | 'LOST'
  | 'SOLD'
  | 'REJECTED';

export interface OptionsExecutionConfig {
  userId: string;
  backendEdition: 'supabase' | 'appwrite';
  accountId: string;
  accountMode: OptionsAccountMode;
  contractKind: 'ONETOUCH' | 'NOTOUCH' | 'BOTH';
  stake: number;
  automationEnabled: boolean;
  realTradingConsentAt: string | null;
  updatedAt: string;
}

export interface OptionsSignalSnapshot {
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  signalCreatedAt: string;
  analysisTimeframe: string;
  strategyIds: string[];
  confluenceScore: number;
  upperBand: number;
  lowerBand: number;
  middleBand: number;
  deviation: 2.5;
}

export interface OptionsProposalRecord {
  id: string;
  userId: string;
  accountId: string;
  accountMode: OptionsAccountMode;
  proposal: OptionsProposalSnapshot;
  signal: OptionsSignalSnapshot;
  stake: number;
  currency: string;
  brokerResponse: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface OptionsExecutionRecord {
  id: string;
  userId: string;
  proposalRecordId: string;
  idempotencyKey: string;
  status: OptionsExecutionStatus;
  brokerContractId: string | null;
  buyPrice: number | null;
  payout: number | null;
  profitLoss: number | null;
  brokerStatus: string | null;
  lastReconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
}

export interface OptionsExecutionEvent {
  id: string;
  executionId: string;
  fromStatus: OptionsExecutionStatus | null;
  toStatus: OptionsExecutionStatus;
  eventType: string;
  brokerMessage: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Stable key for one signal + account + contract kind. The backend must
 * enforce a UNIQUE constraint on this value before sending any buy request.
 */
export function buildOptionsIdempotencyKey(input: {
  userId: string;
  accountId: string;
  signalId: string;
  contractKind: 'ONETOUCH' | 'NOTOUCH';
}): string {
  const parts = [input.userId, input.accountId, input.signalId, input.contractKind];
  if (parts.some(part => !part.trim() || part.length > 256)) {
    throw new Error('invalid_idempotency_key_input');
  }
  return parts.map(part => encodeURIComponent(part)).join(':');
}

const EXECUTION_TRANSITIONS: Record<OptionsExecutionStatus, readonly OptionsExecutionStatus[]> = {
  RESERVED: ['BUY_SENT', 'REJECTED', 'UNKNOWN'],
  BUY_SENT: ['OPEN', 'REJECTED', 'UNKNOWN'],
  UNKNOWN: ['OPEN', 'WON', 'LOST', 'SOLD', 'REJECTED'],
  OPEN: ['WON', 'LOST', 'SOLD', 'UNKNOWN'],
  WON: [],
  LOST: [],
  SOLD: [],
  REJECTED: [],
};

export function canTransitionOptionsExecution(
  from: OptionsExecutionStatus,
  to: OptionsExecutionStatus,
): boolean {
  return EXECUTION_TRANSITIONS[from].includes(to);
}

export function isTerminalOptionsExecution(status: OptionsExecutionStatus): boolean {
  return ['WON', 'LOST', 'SOLD', 'REJECTED'].includes(status);
}

/** Map persisted executor states to the existing UI lifecycle vocabulary. */
export function toOptionsTradeStatus(status: OptionsExecutionStatus): OptionsTradeStatus {
  if (status === 'RESERVED' || status === 'BUY_SENT') return 'PURCHASE_PENDING';
  if (status === 'UNKNOWN') return 'UNKNOWN';
  if (status === 'OPEN') return 'OPEN';
  return status;
}

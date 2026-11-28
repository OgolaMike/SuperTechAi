import { appwriteRequest } from '@/lib/appwrite';

const apiBase = (
  import.meta.env.VITE_INDEPENDENT_API_URL ||
  'https://supertechai-independent-api.mikedavid45.workers.dev'
).replace(/\/$/, '');

type ApiIdentity = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type IndependentProfile = {
  id: string;
  displayName: string;
  onboardingStatus: string;
};

async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new Error('The independent API has not been configured for this deployment.');

  const jwt = await appwriteRequest<{ jwt: string }>('/account/jwts', {
    method: 'POST',
    body: {},
  });

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt.jwt}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'The independent service could not complete your request.');
  }
  return payload as T;
}

export function getIndependentApiIdentity(): Promise<ApiIdentity> {
  return authenticatedRequest<ApiIdentity>('/api/me');
}

export function getIndependentProfile(): Promise<IndependentProfile> {
  return authenticatedRequest<IndependentProfile>('/api/profile');
}

export function updateIndependentProfile(displayName: string): Promise<IndependentProfile> {
  return authenticatedRequest<IndependentProfile>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export type CTraderAccount = {
  accountId: string;
  isLive: boolean;
  traderLogin: string | null;
  broker: string;
  accountType: string | null;
  permissionScope: string;
};

export type CTraderConnectionStatus = {
  connected: boolean;
  status: string;
  tokenExpiresAt?: string | null;
  accounts?: CTraderAccount[];
  selectedAccountId?: string | null;
  permissionScope?: string | null;
};

export function getCTraderConnectionStatus(): Promise<CTraderConnectionStatus> {
  return authenticatedRequest<CTraderConnectionStatus>('/api/brokers/ctrader/status');
}

export function startCTraderConnection(redirectPath = '/'): Promise<{ authorizationUrl: string; expiresAt: string }> {
  return authenticatedRequest<{ authorizationUrl: string; expiresAt: string }>('/api/brokers/ctrader/connect', {
    method: 'POST',
    body: JSON.stringify({ redirectPath }),
  });
}

export function discoverCTraderAccounts(): Promise<{ accounts: CTraderAccount[]; permissionScope: string; tradingEnabled: false }> {
  return authenticatedRequest<{ accounts: CTraderAccount[]; permissionScope: string; tradingEnabled: false }>('/api/brokers/ctrader/discover', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function selectCTraderAccount(accountId: string): Promise<{ selectedAccount: CTraderAccount; tradingEnabled: false }> {
  return authenticatedRequest<{ selectedAccount: CTraderAccount; tradingEnabled: false }>('/api/brokers/ctrader/select-account', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}
export function refreshCTraderConnection(): Promise<{ connected: boolean; refreshed: boolean; tokenExpiresAt?: string; status?: string }> {
  return authenticatedRequest<{ connected: boolean; refreshed: boolean; tokenExpiresAt?: string; status?: string }>('/api/brokers/ctrader/refresh', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function disconnectCTraderConnection(): Promise<{ disconnected: boolean; providerTokenRevoked: false; note: string }> {
  return authenticatedRequest<{ disconnected: boolean; providerTokenRevoked: false; note: string }>('/api/brokers/ctrader/disconnect', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchIndependentSignalRecords(): Promise<{ records: Array<Record<string, unknown>> }> {
  return authenticatedRequest<{ records: Array<Record<string, unknown>> }>('/api/signals');
}

export function upsertIndependentSignalRecords(records: Array<Record<string, unknown>>): Promise<{ saved: number }> {
  return authenticatedRequest<{ saved: number }>('/api/signals', {
    method: 'POST',
    body: JSON.stringify({ records }),
  });
}

export type IndependentAlertPreferences = {
  categories: Record<string, string>;
  assets: Record<string, string>;
  defaultAssetMode: string;
};

export function fetchIndependentAlertPreferences(): Promise<{ settings: IndependentAlertPreferences; exists: boolean }> {
  return authenticatedRequest<{ settings: IndependentAlertPreferences; exists: boolean }>('/api/alert-preferences');
}

export function saveIndependentAlertPreferences(settings: IndependentAlertPreferences): Promise<{ settings: IndependentAlertPreferences }> {
  return authenticatedRequest<{ settings: IndependentAlertPreferences }>('/api/alert-preferences', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export function fetchIndependentSuperSignalRecords(): Promise<{ records: Array<Record<string, unknown>> }> {
  return authenticatedRequest<{ records: Array<Record<string, unknown>> }>('/api/super-signals');
}

export function upsertIndependentSuperSignalRecords(records: Array<Record<string, unknown>>): Promise<{ saved: number }> {
  return authenticatedRequest<{ saved: number }>('/api/super-signals', { method: 'POST', body: JSON.stringify({ records }) });
}

export type BinanceSpotConnectionStatus = { connected: boolean; status: string; apiKeyLast4?: string | null; verifiedAt?: string | null; tradingEnabled: false };
export function getBinanceSpotConnectionStatus(): Promise<BinanceSpotConnectionStatus> {
  return authenticatedRequest<BinanceSpotConnectionStatus>('/api/brokers/binance-spot/status');
}
export function connectBinanceSpot(apiKey: string, apiSecret: string): Promise<{ connected: boolean; apiKeyLast4: string; tradingEnabled: false }> {
  return authenticatedRequest('/api/brokers/binance-spot/connect', { method: 'POST', body: JSON.stringify({ apiKey, apiSecret }) });
}
export function disconnectBinanceSpot(): Promise<{ disconnected: boolean; providerKeyRevoked: false; note: string }> {
  return authenticatedRequest('/api/brokers/binance-spot/disconnect', { method: 'POST', body: JSON.stringify({}) });
}

export type DerivAccount = { accountId: string; accountType: string; currency: string; isDemo: boolean };
export type DerivConnectionStatus = {
  connected: boolean; status: string; expiresAt?: string | null;
  accounts: DerivAccount[]; selectedAccountId: string; tradingEnabled: false;
};
export function getDerivConnectionStatus(): Promise<DerivConnectionStatus> {
  return authenticatedRequest<DerivConnectionStatus>('/api/brokers/deriv/status');
}
export function startDerivConnection(redirectPath = '/'): Promise<{ authorizationUrl: string; expiresAt: string }> {
  return authenticatedRequest('/api/brokers/deriv/connect', { method: 'POST', body: JSON.stringify({ redirectPath }) });
}
export function selectDerivAccount(accountId: string): Promise<{ selectedAccountId: string; tradingEnabled: false }> {
  return authenticatedRequest('/api/brokers/deriv/select-account', { method: 'POST', body: JSON.stringify({ accountId }) });
}
export function disconnectDerivConnection(): Promise<{ disconnected: boolean; providerTokenRevoked: false; tradingEnabled: false; note: string }> {
  return authenticatedRequest('/api/brokers/deriv/disconnect', { method: 'POST', body: JSON.stringify({}) });
}

export function getBinanceFuturesConnectionStatus(): Promise<BinanceSpotConnectionStatus> {
  return authenticatedRequest<BinanceSpotConnectionStatus>('/api/brokers/binance-futures/status');
}
export function connectBinanceFutures(apiKey: string, apiSecret: string): Promise<{ connected: boolean; apiKeyLast4: string; tradingEnabled: false }> {
  return authenticatedRequest('/api/brokers/binance-futures/connect', { method: 'POST', body: JSON.stringify({ apiKey, apiSecret }) });
}
export function disconnectBinanceFutures(): Promise<{ disconnected: boolean; providerKeyRevoked: false; note: string }> {
  return authenticatedRequest('/api/brokers/binance-futures/disconnect', { method: 'POST', body: JSON.stringify({}) });
}

export type MembershipAccess = { status: "pending" | "approved" | "suspended"; approved: boolean; isAdmin: boolean; planCode?: "free" | "standard_300" | "automation_500" };
export function getMembershipAccess(): Promise<MembershipAccess> {
  return authenticatedRequest<MembershipAccess>('/api/membership/status');
}
export type AdminMember = { id: string; email: string; name: string; emailConfirmed: boolean; createdAt: string; lastSignInAt: string | null; status: string; active?: boolean; isAdmin: boolean };
export function getAdminMembers(): Promise<{ members: AdminMember[] }> {
  return authenticatedRequest<{ members: AdminMember[] }>('/api/admin/members');
}
export function setAdminMemberStatus(userId: string, status: "approved" | "pending" | "suspended"): Promise<{ updated: boolean; userId: string; status: string }> {
  return authenticatedRequest('/api/admin/members', { method: 'PATCH', body: JSON.stringify({ userId, status }) });
}


export type MemberReferralProfile = { assigned: boolean; referralCode?: string; sponsorUserId?: string; teamOwnerId?: string; role?: 'member' | 'owner'; status?: string; reason?: string };
export type MemberNetwork = { teamOwnerId: string; directCount: number; teamCount: number; members: Array<{ memberId: string; sponsorId: string; role: string; joinedAt: string }> };
export function getMemberReferralProfile(): Promise<MemberReferralProfile> { return authenticatedRequest('/api/referrals/me'); }
export function activateMemberReferral(referralCode: string): Promise<MemberReferralProfile> { return authenticatedRequest('/api/referrals/activate', { method: 'POST', body: JSON.stringify({ referralCode }) }); }
export function getMemberNetwork(): Promise<MemberNetwork> { return authenticatedRequest('/api/referrals/network'); }
export type IndependentPayment = { id: string; planCode: string; amountUsd: number; currency: string; reference: string; status: string; submittedAt: string; reviewedAt?: string | null; reviewNote?: string | null };
export function listMyIndependentPayments(): Promise<{ payments: IndependentPayment[] }> { return authenticatedRequest('/api/payments/me'); }
export function submitIndependentPayment(planCode: 'standard_300' | 'automation_500', transactionReference: string): Promise<{ submitted: boolean; payment: { id: string; planCode: string; amountUsd: number; status: string } }> {
  return authenticatedRequest('/api/payments/submit', { method: 'POST', body: JSON.stringify({ planCode, currency: 'USDT-TRC20', transactionReference }) });
}
export type IndependentLedgerEntry = { type: string; amount: number; currency: string; referenceId: string; status: string; createdAt: string };
export function getIndependentFinancialLedger(): Promise<{ entries: IndependentLedgerEntry[] }> { return authenticatedRequest('/api/finance/ledger'); }
export type IndependentCommission = { id: string; type: string; level: number | null; amount: number; currency: string; status: string; sourceUserId: string; referenceId: string; createdAt: string };
export function getIndependentCommissions(): Promise<{ commissions: IndependentCommission[] }> { return authenticatedRequest('/api/finance/commissions'); }
export type IndependentAcademyProgress = { lessonId: string; progress: number; completedAt: string | null; updatedAt: string };
export function getIndependentAcademyProgress(): Promise<{ lessons: IndependentAcademyProgress[] }> { return authenticatedRequest('/api/academy/progress'); }
export function saveIndependentAcademyProgress(lessonId: string, progress: number): Promise<IndependentAcademyProgress> {
  return authenticatedRequest('/api/academy/progress', { method: 'PUT', body: JSON.stringify({ lessonId, progress }) });
}


export type CompanyBusinessOverview = {
  currency: string; totalSales: number; approvedPayments: number; pendingPayments: number;
  pendingPaymentValue: number; rejectedPayments: number; companyRevenue: number; companyReferralIncome: number; companyTotalIncome: number;
  companyRevenueRecords: number;
  income: Record<string, { accrued: number; pending: number; paid: number; records: number }>;
  weekly: { start: string; end: string; qualifyingSales: number; just4youPool: number };
  just4youReservedTotal: number; withdrawalRecords: number;
  planSales: { standard300: number; automation500: number };
};
export type CompanyJust4YouDashboard = {
  weekStart: string; weekEnd: string; qualifyingSales: number; bonusRatePct: number;
  salesPool: number; eligibleMembers: number;
  latestDraw: null | { weekStart: string; weekEnd: string; winnerName: string; winnerUserId: string; prizeAmount: number; drawnAt: string; status: string };
  currentDraw: null | { weekStart: string; winnerName: string; prizeAmount: number; drawnAt: string; status: string };
  canDraw: boolean;
};
export function getCompanyBusinessOverview(): Promise<CompanyBusinessOverview> {
  return authenticatedRequest('/api/company/business');
}
export function getCompanyJust4YouDashboard(): Promise<CompanyJust4YouDashboard> {
  return authenticatedRequest('/api/company/just4you');
}
export function runCompanyJust4YouDraw(): Promise<{ drawn: boolean; winnerName: string; prizeAmount: number; eligibleMembers: number; weekStart: string; weekEnd: string }> {
  return authenticatedRequest('/api/company/just4you/draw', { method: 'POST', body: JSON.stringify({}) });
}

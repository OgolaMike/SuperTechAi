import { appwriteConfigured, appwriteRequest } from './appwrite';

export type AIBrainModule =
  | 'dashboard' | 'signals' | 'crypto' | 'deriv' | 'analysis'
  | 'automation' | 'account' | 'services' | 'academy' | 'business' | 'companion';

export type AIBrainRequest = {
  module: AIBrainModule;
  task: string;
  message?: string;
  context?: Record<string, unknown>;
  conversationId?: string;
};

export type AIBrainResponse = {
  answer: string;
  requestId: string;
  provider: string;
  model: string;
  module: AIBrainModule;
};

type FunctionExecution = {
  responseBody?: string;
  responseStatusCode?: number;
  status?: string;
};

const functionId = import.meta.env.VITE_APPWRITE_AI_BRAIN_FUNCTION_ID || '';

export function isAIBrainConfigured(): boolean {
  return appwriteConfigured && Boolean(functionId);
}

export async function askAIBrain(input: AIBrainRequest): Promise<AIBrainResponse> {
  if (!appwriteConfigured) throw new Error('Appwrite is not configured.');
  if (!functionId) throw new Error('The SuperTech AI Brain function has not been connected yet.');

  const execution = await appwriteRequest<FunctionExecution>(
    `/functions/${encodeURIComponent(functionId)}/executions`,
    {
      method: 'POST',
      body: { body: JSON.stringify(input), async: false },
    },
  );

  if (execution.responseStatusCode && execution.responseStatusCode >= 400) {
    let detail: { message?: string; error?: string } = {};
    try { detail = JSON.parse(execution.responseBody || '{}'); } catch { /* use safe fallback */ }
    throw new Error(detail.message || detail.error || 'The SuperTech AI Brain could not complete this request.');
  }

  let payload: AIBrainResponse & { error?: string; message?: string };
  try {
    payload = JSON.parse(execution.responseBody || '{}') as typeof payload;
  } catch {
    throw new Error('The AI Brain returned an unreadable response.');
  }
  if (!payload.answer) throw new Error(payload.message || payload.error || 'The AI Brain returned no answer.');
  return payload;
}

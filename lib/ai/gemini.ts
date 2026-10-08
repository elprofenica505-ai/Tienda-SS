import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  type Content,
} from '@google/generative-ai';
import type { AiHistoryMessage } from '@/lib/ai/types';

export const GEMINI_MODEL = 'gemini-1.5-flash';

export type GeminiFailureCode = 'QUOTA_EXCEEDED' | 'API_KEY_INVALID' | 'GEMINI_UNAVAILABLE' | 'GEMINI_EMPTY_RESPONSE';

export class GeminiCallError extends Error {
  constructor(public readonly code: GeminiFailureCode) {
    super(code);
    this.name = 'GeminiCallError';
  }
}

function historyToContents(history: AiHistoryMessage[]): Content[] {
  return history
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content.trim())
    .slice(-10)
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content.trim() }],
    }));
}

function classifyGeminiError(error: unknown): GeminiCallError {
  const status = error instanceof GoogleGenerativeAIFetchError ? error.status : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (status === 429 || /resource[_ ]exhausted|quota|rate limit|too many requests/.test(message)) {
    return new GeminiCallError('QUOTA_EXCEEDED');
  }
  if (status === 400 || status === 401 || status === 403 || /api[_ ]key|api key|credential|permission denied|unauthenticated/.test(message)) {
    return new GeminiCallError('API_KEY_INVALID');
  }
  return new GeminiCallError('GEMINI_UNAVAILABLE');
}

/**
 * Calls Gemini's `models/gemini-1.5-flash:generateContent` endpoint through
 * Google's official SDK. The API key stays server-side and is never logged.
 */
export async function callGemini({
  apiKey,
  systemInstruction,
  history,
  message,
}: {
  apiKey: string;
  systemInstruction: string;
  history: AiHistoryMessage[];
  message: string;
}): Promise<string> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new GeminiCallError('API_KEY_INVALID');

  try {
    const client = new GoogleGenerativeAI(normalizedKey);
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction,
    });
    const result = await model.generateContent({
      contents: [
        ...historyToContents(history),
        { role: 'user', parts: [{ text: message.trim() }] },
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1024,
      },
    });
    const response = result.response.text().trim();
    if (!response) throw new GeminiCallError('GEMINI_EMPTY_RESPONSE');
    return response.slice(0, 10000);
  } catch (error) {
    if (error instanceof GeminiCallError) throw error;
    throw classifyGeminiError(error);
  }
}

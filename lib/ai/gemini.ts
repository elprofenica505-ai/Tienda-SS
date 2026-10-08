import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  type Content,
} from '@google/generative-ai';
import type { AiHistoryMessage } from '@/lib/ai/types';

/**
 * Modelo del nivel gratuito de Gemini. `gemini-1.5-flash` fue retirado por
 * Google y hoy devuelve 404 en `generateContent`, por eso el asistente usa
 * `gemini-3.1-flash-lite`, que sigue disponible sin tarjeta de crédito.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Alias heredado: el resto del código importa `GEMINI_MODEL`. Se conserva para
 * no romper las llamadas existentes y para que las pruebas sigan verificando
 * exactamente qué modelo sale por defecto.
 */
export const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;

/**
 * Un retiro de modelo debe resolverse cambiando una variable de entorno en
 * Vercel, no publicando código. `GEMINI_MODEL` vacío o con espacios no sustituye
 * al modelo por defecto.
 */
export function resolveGeminiModel(): string {
  const override = process.env.GEMINI_MODEL?.trim();
  return override || DEFAULT_GEMINI_MODEL;
}

export type GeminiFailureCode =
  | 'QUOTA_EXCEEDED'
  | 'API_KEY_INVALID'
  | 'MODEL_NOT_FOUND'
  | 'GEMINI_UNAVAILABLE'
  | 'GEMINI_EMPTY_RESPONSE';

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

function errorStatus(error: unknown): number | undefined {
  if (error instanceof GoogleGenerativeAIFetchError) return error.status;
  const candidate = (error as { status?: unknown } | null)?.status;
  return typeof candidate === 'number' ? candidate : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

function classifyGeminiError(error: unknown): GeminiCallError {
  const status = errorStatus(error);
  const message = errorMessage(error);

  if (status === 429 || /resource[_ ]exhausted|quota|rate limit|too many requests/.test(message)) {
    return new GeminiCallError('QUOTA_EXCEEDED');
  }
  // Modelo retirado o inexistente. Se evalúa antes de las credenciales porque
  // Google responde 404/400 con "not found"/"not supported", no con 401.
  if (/models?\/[a-z0-9.\-_]+ is not found|not supported for|model[_ ]not[_ ]found|not[_ ]found/.test(message)) {
    return new GeminiCallError('MODEL_NOT_FOUND');
  }
  if (status === 404) return new GeminiCallError('MODEL_NOT_FOUND');
  if (status === 400 || status === 401 || status === 403 || /api[_ ]key|api key|credential|permission denied|unauthenticated/.test(message)) {
    return new GeminiCallError('API_KEY_INVALID');
  }
  return new GeminiCallError('GEMINI_UNAVAILABLE');
}

/**
 * Calls Gemini's `models/<modelo>:generateContent` endpoint through Google's
 * official SDK. The API key stays server-side and is never logged nor returned
 * to the client, so no error branch may echo the provider payload.
 */
export async function callGemini({
  apiKey,
  systemInstruction,
  history,
  message,
  model = resolveGeminiModel(),
}: {
  apiKey: string;
  systemInstruction: string;
  history: AiHistoryMessage[];
  message: string;
  model?: string;
}): Promise<string> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new GeminiCallError('API_KEY_INVALID');

  try {
    const client = new GoogleGenerativeAI(normalizedKey);
    const generativeModel = client.getGenerativeModel({
      model,
      systemInstruction,
    });
    const result = await generativeModel.generateContent({
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

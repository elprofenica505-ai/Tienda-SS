import { NextRequest, NextResponse } from 'next/server';
import { assertAiAssistantAccess, AI_RESTRICTED_MESSAGE } from '@/lib/ai/access';
import { requireTenantMember, tenantErrorResponse, type TenantContext } from '@/lib/tenant';

export async function requireAiManager(request: NextRequest): Promise<TenantContext> {
  const context = await requireTenantMember(request);
  assertAiAssistantAccess(context);
  return context;
}

export async function aiJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('AI_INVALID_JSON');
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === 'AI_INVALID_JSON') throw error;
    throw new Error('AI_INVALID_JSON');
  }
}

export function aiErrorResponse(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : '';
  if (code === 'AI_ACCESS_RESTRICTED') return NextResponse.json({ error: AI_RESTRICTED_MESSAGE, code }, { status: 403 });
  if (code === 'AI_INVALID_JSON') return NextResponse.json({ error: 'El cuerpo de la solicitud debe ser JSON válido.' }, { status: 400 });
  if (code === 'AI_MESSAGE_INVALID') return NextResponse.json({ error: 'Escribe una consulta de entre 1 y 2000 caracteres.' }, { status: 400 });
  if (code === 'AI_CONFIG_INVALID') return NextResponse.json({ error: 'La configuración de IA no es válida.' }, { status: 400 });
  if (code === 'AI_DAILY_LIMIT_INVALID') return NextResponse.json({ error: 'El límite diario debe estar entre 1 y 100 consultas.' }, { status: 400 });
  if (code === 'AI_CUSTOM_INSTRUCTIONS_INVALID') return NextResponse.json({ error: 'Las instrucciones personalizadas pueden tener hasta 2000 caracteres.' }, { status: 400 });
  if (code === 'AI_API_KEY_INVALID_INPUT') return NextResponse.json({ error: 'La API Key de Gemini no tiene un formato válido.' }, { status: 400 });
  if (code === 'AI_ENCRYPTION_KEY_MISSING') return NextResponse.json({ error: 'La configuración de cifrado no está lista. Configura AI_ENCRYPTION_KEY en Vercel antes de guardar una API Key.' }, { status: 503 });
  if (code === 'AI_API_KEY_DECRYPT_FAILED') return NextResponse.json({ error: 'No se pudo leer la API Key guardada. Guárdala nuevamente en Configuración IA.' }, { status: 503 });
  if (code.includes('AI_CHAT_LIMIT_INVALID')) return NextResponse.json({ error: 'El límite diario debe estar entre 1 y 100 consultas.' }, { status: 400 });
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export function noStoreJson(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

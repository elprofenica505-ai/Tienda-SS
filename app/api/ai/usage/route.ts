import { NextRequest, NextResponse } from 'next/server';
import { consumeAiQuery, getAiUsageStatus } from '@/lib/ai-usage';
import { requireTenantMember, tenantErrorResponse } from '@/lib/tenant';
import type { TenantRole } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_MANAGER_ROLES: TenantRole[] = ['owner', 'admin', 'gerente', 'jefe'];
const NO_STORE = { 'Cache-Control': 'no-store' };
const LIMIT_REACHED_MESSAGE = 'Límite diario de consultas alcanzado, disponible mañana.';

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('AI_LIMIT_CONFIGURATION_MISSING')) {
    return NextResponse.json(
      { ok: false, error: 'La configuración de límites de IA no está lista. Contacta al administrador.', code: 'AI_LIMIT_CONFIGURATION_MISSING' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (code.startsWith('AI_USAGE_')) {
    console.error('ai_usage_request_failed', { code });
  }
  const response = tenantErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
}

/** Reads today's company quota without consuming a query. */
export async function GET(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, AI_MANAGER_ROLES);
    const usage = await getAiUsageStatus(context.tenantId);
    return NextResponse.json({ ok: true, usage }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}

/** Atomically consumes one query slot before a later AI provider call. */
export async function POST(request: NextRequest) {
  try {
    const context = await requireTenantMember(request, AI_MANAGER_ROLES);
    const usage = await consumeAiQuery(context.tenantId);
    if (usage.allowed !== true) {
      return NextResponse.json(
        {
          ok: false,
          code: 'AI_DAILY_LIMIT_REACHED',
          error: LIMIT_REACHED_MESSAGE,
          usage,
        },
        { status: 429, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, message: 'Consulta autorizada.', usage }, { headers: NO_STORE });
  } catch (error: unknown) {
    return failure(error);
  }
}

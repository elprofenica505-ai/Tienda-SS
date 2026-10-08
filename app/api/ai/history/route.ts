import { NextRequest } from 'next/server';
import { aiErrorResponse, noStoreJson, requireAiManager } from '@/lib/ai/route-utils';
import { clearAiHistory, getRecentAiHistory } from '@/lib/ai/store';

export const runtime = 'nodejs';

/** Last 50 messages, oldest first so the client can render a natural chat. */
export async function GET(request: NextRequest) {
  try {
    const context = await requireAiManager(request);
    const history = await getRecentAiHistory(context.tenantId, 50);
    return noStoreJson({ ok: true, history });
  } catch (error) {
    return aiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireAiManager(request);
    await clearAiHistory(context.tenantId);
    return noStoreJson({ ok: true });
  } catch (error) {
    return aiErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePublicApiKey, publicApiError } from '@/lib/public-api';
import { verifyWebhook } from '@/lib/integrations';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePublicApiKey(request);
    const payload = await request.text();
    const signature = request.headers.get('x-webhook-signature') || '';
    const secret = process.env.PUBLIC_WEBHOOK_PREVIEW_SECRET || '';
    if (!secret || !verifyWebhook(payload, signature, secret)) return NextResponse.json({ error: 'Firma de webhook inválida.' }, { status: 400 });
    const event = JSON.parse(payload) as { id?: unknown; type?: unknown; tenantId?: unknown; data?: unknown };
    const eventId = typeof event.id === 'string' ? event.id.slice(0, 160) : '';
    if (!eventId || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object') return NextResponse.json({ error: 'Envelope de webhook inválido.' }, { status: 400 });
    if (event.tenantId !== undefined && event.tenantId !== auth.tenantId) return NextResponse.json({ error: 'El webhook no pertenece a esta empresa.' }, { status: 403 });
    const ref = getAdminDb().collection('tenants').doc(auth.tenantId).collection('integrationEvents').doc(eventId);
    const result = await getAdminDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) return { duplicate: true };
      transaction.create(ref, { eventId, type: event.type, data: event.data, receivedAt: new Date(), status: 'received', source: 'preview-webhook' });
      return { duplicate: false };
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, eventId }, { status: result.duplicate ? 200 : 202 });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
    const response = publicApiError(error); return NextResponse.json(response.body, { status: response.status });
  }
}

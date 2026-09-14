import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';

function configuredIds() { return (process.env.SUPERADMIN_UIDS || '').split(',').map((value) => value.trim()).filter(Boolean); }
export async function requireSuperadmin(request: NextRequest) {
  const header = request.headers.get('authorization') || ''; const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''; if (!token) throw new Error('UNAUTHENTICATED');
  const auth = await getSupabaseServer().auth.getUser(token); const user = auth.data.user;
  if (auth.error || !user) throw new Error('UNAUTHENTICATED');
  if (!configuredIds().includes(user.id) && user.app_metadata?.superadmin !== true && user.user_metadata?.superadmin !== true) throw new Error('FORBIDDEN');
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), uid: user.id }, { ip: 120, uid: 300, endpoint: 600, composite: 100 }, 60_000);
  if (!rate.allowed) throw new Error(`RATE_LIMITED:${rate.blockedBy || 'composite'}:${rate.retryAfterSeconds}`);
  return { uid: user.id, email: user.email || '' };
}
export function superadminErrorResponse(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code === 'UNAUTHENTICATED') return { status: 401, body: { error: 'Autenticación requerida.' } }; if (code === 'FORBIDDEN') return { status: 403, body: { error: 'Solo un superadministrador puede acceder a este panel.' } }; if (code.startsWith('RATE_LIMITED:')) return { status: 429, body: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.', code: 'RATE_LIMITED' } }; if (code.includes('SUPABASE_') || code.includes('schema cache')) return { status: 503, body: { error: 'La conexión del servidor con Supabase no está configurada correctamente.' } }; return { status: 500, body: { error: 'Error interno del servidor.' } }; }

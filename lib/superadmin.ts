import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdmin';
import { assertTokenSessionPolicy } from '@/lib/auth-policy';
import { consumeDistributedRateLimits, getClientAddress } from '@/lib/rate-limit';

function configuredIds() { return (process.env.SUPERADMIN_UIDS || '').split(',').map((value) => value.trim()).filter(Boolean); }
export async function requireSuperadmin(request: NextRequest) {
  const header = request.headers.get('authorization') || ''; const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''; if (!token) throw new Error('UNAUTHENTICATED');
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new Error('UNAUTHENTICATED');
  }
  const ids = configuredIds(); const claim = decoded.superadmin === true;
  assertTokenSessionPolicy(decoded, 'admin');
  if (!claim && !ids.includes(decoded.uid)) throw new Error('FORBIDDEN');
  const rate = await consumeDistributedRateLimits({ endpoint: request.nextUrl.pathname, ip: getClientAddress(request), uid: decoded.uid }, { ip: 120, uid: 300, endpoint: 600, composite: 100 }, 60_000);
  if (!rate.allowed) throw new Error(`RATE_LIMITED:${rate.blockedBy || 'composite'}:${rate.retryAfterSeconds}`);
  return { uid: decoded.uid, email: decoded.email || '' };
}
export function superadminErrorResponse(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code === 'UNAUTHENTICATED') return { status: 401, body: { error: 'Autenticación requerida.' } }; if (code === 'FORBIDDEN') return { status: 403, body: { error: 'Solo un superadministrador puede acceder a este panel.' } }; if (code === 'EMAIL_NOT_VERIFIED') return { status: 403, body: { error: 'Verifica tu correo electrónico antes de continuar.', code } }; if (code === 'SESSION_EXPIRED') return { status: 401, body: { error: 'Tu sesión expiró. Inicia sesión nuevamente.', code } }; if (code === 'MFA_REQUIRED') return { status: 403, body: { error: 'La autenticación multifactor es obligatoria para este rol.', code } }; if (code.startsWith('RATE_LIMITED:')) return { status: 429, body: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.', code: 'RATE_LIMITED' } }; return { status: 500, body: { error: 'Error interno del servidor.' } }; }

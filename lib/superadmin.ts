import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdmin';

function configuredIds() { return (process.env.SUPERADMIN_UIDS || '').split(',').map((value) => value.trim()).filter(Boolean); }
export async function requireSuperadmin(request: NextRequest) {
  const header = request.headers.get('authorization') || ''; const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''; if (!token) throw new Error('UNAUTHENTICATED');
  const decoded = await getAdminAuth().verifyIdToken(token); const ids = configuredIds(); const claim = decoded.superadmin === true;
  if (!claim && !ids.includes(decoded.uid)) throw new Error('FORBIDDEN');
  return { uid: decoded.uid, email: decoded.email || '' };
}
export function superadminErrorResponse(error: unknown) { const code = error instanceof Error ? error.message : ''; if (code === 'UNAUTHENTICATED') return { status: 401, body: { error: 'Autenticación requerida.' } }; if (code === 'FORBIDDEN') return { status: 403, body: { error: 'Solo un superadministrador puede acceder a este panel.' } }; return { status: 500, body: { error: 'Error interno del servidor.' } }; }

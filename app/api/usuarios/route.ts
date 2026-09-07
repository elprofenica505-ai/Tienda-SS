// Compatibilidad legacy: la administración real vive en /api/members.
// Mantener este alias evita romper clientes antiguos sin duplicar autorización,
// límites, validación ni estados de membresía.
import { DELETE, GET, PATCH, POST } from '@/app/api/members/route';

export const runtime = 'nodejs';
export { DELETE, GET, PATCH, POST };

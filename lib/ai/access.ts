import type { TenantContext, TenantRole } from '@/lib/tenant';

/** Roles explicitly authorized by the owner for strategic business intelligence. */
export const AI_MANAGER_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);

export function canUseAiAssistant(role: TenantRole | string | undefined | null): boolean {
  return typeof role === 'string' && AI_MANAGER_ROLES.has(role as TenantRole);
}

export function assertAiAssistantAccess(context: TenantContext): void {
  if (!canUseAiAssistant(context.role)) throw new Error('AI_ACCESS_RESTRICTED');
}

export const AI_RESTRICTED_MESSAGE = 'Acceso restringido, solo dueño';

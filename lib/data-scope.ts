import type { TenantRole } from '@/lib/tenant';

const ADMIN_ROLES = new Set<TenantRole>(['owner', 'admin', 'gerente', 'jefe']);
const SENSITIVE_FIELDS = new Set(['cost', 'unitCost', 'margin', 'profit', 'supplierCost', 'bankAccount', 'taxId', 'internalNotes']);

export type ScopeContext = {
  role: TenantRole;
  branchIds?: readonly string[];
};

export function canAccessBranch(context: ScopeContext, branchId: unknown): boolean {
  if (ADMIN_ROLES.has(context.role)) return true;
  if (typeof branchId !== 'string' || !branchId.trim()) return false;
  return Boolean(context.branchIds?.includes(branchId));
}

export function assertBranchAccess(context: ScopeContext, branchId: unknown): void {
  if (!canAccessBranch(context, branchId)) throw new Error('BRANCH_OUT_OF_SCOPE');
}

export function redactSensitiveFields<T extends Record<string, unknown>>(value: T, context: ScopeContext): T {
  if (ADMIN_ROLES.has(context.role)) return { ...value };
  const result = { ...value };
  SENSITIVE_FIELDS.forEach((field) => { delete result[field]; });
  return result;
}

export function filterByBranch<T extends Record<string, unknown>>(rows: readonly T[], context: ScopeContext): T[] {
  if (ADMIN_ROLES.has(context.role)) return rows.map((row) => redactSensitiveFields(row, context));
  return rows
    .filter((row) => canAccessBranch(context, row.branchId ?? row.sucursalId))
    .map((row) => redactSensitiveFields(row, context));
}

export function assertWritableFields(before: Record<string, unknown>, patch: Record<string, unknown>, context: ScopeContext): void {
  if (ADMIN_ROLES.has(context.role)) return;
  for (const field of Object.keys(patch)) {
    if (SENSITIVE_FIELDS.has(field) || field === 'tenantId' || field === 'ownerId') throw new Error('FIELD_OUT_OF_SCOPE');
  }
  if ('branchId' in patch && patch.branchId !== before.branchId) throw new Error('BRANCH_OUT_OF_SCOPE');
}

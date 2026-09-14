import type { TenantRole } from '@/lib/tenant';

export type OrganizationResource = 'branches' | 'warehouses' | 'cashRegisters';
export type Branch = { id: string; name: string; code: string; active: boolean; timezone: string; createdAt?: unknown; updatedAt?: unknown };
export type Warehouse = { id: string; branchId: string; name: string; code: string; type: 'store' | 'warehouse' | 'transit'; active: boolean; createdAt?: unknown; updatedAt?: unknown };
export type CashRegister = { id: string; branchId: string; name: string; code: string; active: boolean; createdAt?: unknown; updatedAt?: unknown };
function normalizedText(value: unknown, fallback: string, max = 100): string { const text = typeof value === 'string' ? value.trim().slice(0, max) : ''; return text || fallback; }
export function safeCode(value: unknown, fallback: string): string { return normalizedText(value, fallback, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '-').slice(0, 40); }
export function branchIdsFrom(value: unknown): string[] { if (!Array.isArray(value)) return []; return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item)).slice(0, 50))); }
export function filterOrganizationMembers<T extends Record<string, unknown>>(members: readonly T[], role: TenantRole, branchIds: readonly string[]): T[] { if (['owner', 'admin', 'gerente', 'jefe'].includes(role)) return [...members]; const allowed = new Set(branchIds); return members.filter((member) => { const assigned = Array.isArray(member.branchIds) ? member.branchIds : []; return assigned.some((branchId) => typeof branchId === 'string' && allowed.has(branchId)); }); }
export function assertOrganizationResource(value: unknown): asserts value is OrganizationResource { if (value !== 'branches' && value !== 'warehouses' && value !== 'cashRegisters') throw new Error('ORGANIZATION_RESOURCE_INVALID'); }
export function organizationParentId(resource: OrganizationResource, value: unknown): string { if (resource === 'branches') return ''; const branchId = typeof value === 'string' ? value.trim() : ''; if (!branchId) throw new Error('BRANCH_REQUIRED'); return branchId; }
export function organizationName(value: unknown, resource: OrganizationResource): string { const fallback = resource === 'branches' ? 'Sucursal' : resource === 'warehouses' ? 'Almacén' : 'Caja'; return normalizedText(value, fallback); }

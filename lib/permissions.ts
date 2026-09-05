import type { TenantRole } from '@/lib/tenant';

export const permissionModules = [
  { key: 'dashboard', label: 'Resumen' },
  { key: 'catalog', label: 'Catálogo' },
  { key: 'inventory', label: 'Inventario' },
  { key: 'sales', label: 'Ventas / POS' },
  { key: 'contacts', label: 'Clientes y proveedores' },
  { key: 'receivables', label: 'Cuentas por cobrar' },
  { key: 'finance', label: 'Gastos y flujo de caja' },
  { key: 'reports', label: 'Reportes' },
  { key: 'members', label: 'Usuarios y roles' }
] as const;

export type PermissionModule = typeof permissionModules[number]['key'];
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
export type PermissionMap = Record<PermissionModule, Record<PermissionAction, boolean>>;

const actions: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'export'];
function row(view = false, create = false, edit = false, del = false, exportData = false) { return { view, create, edit, delete: del, export: exportData }; }
function all(view = true, create = true, edit = true, del = true, exportData = true): PermissionMap { return Object.fromEntries(permissionModules.map(({ key }) => [key, row(view, create, edit, del, exportData)])) as PermissionMap; }

export const defaultPermissions: Record<TenantRole, PermissionMap> = {
  owner: all(),
  admin: all(),
  jefe: all(true, true, true, false, true),
  vendedor: { dashboard: row(), catalog: row(true), inventory: row(true), sales: row(true, true, true, false), contacts: row(true, true, true), receivables: row(true, true), finance: row(), reports: row(true, false, false, false, true), members: row() },
  bodega: { dashboard: row(true), catalog: row(true, true, true), inventory: row(true, true, true), sales: row(), contacts: row(true), receivables: row(), finance: row(), reports: row(), members: row() },
  chofer: { dashboard: row(true), catalog: row(), inventory: row(true), sales: row(), contacts: row(true), receivables: row(), finance: row(), reports: row(), members: row() },
  cajero: { dashboard: row(true), catalog: row(true), inventory: row(true), sales: row(true, true, true), contacts: row(true, true, true), receivables: row(true, true), finance: row(true, true), reports: row(true, false, false, false, true), members: row() }
};

export function normalizePermissions(value: unknown, role: TenantRole): PermissionMap {
  const fallback = defaultPermissions[role] || defaultPermissions.vendedor;
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(permissionModules.map(({ key }) => {
    const source = input[key] && typeof input[key] === 'object' ? input[key] as Record<string, unknown> : {};
    return [key, Object.fromEntries(actions.map((action) => [action, typeof source[action] === 'boolean' ? source[action] : fallback[key][action]]))];
  })) as PermissionMap;
}

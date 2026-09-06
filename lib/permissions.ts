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
  { key: 'members', label: 'Usuarios y roles' },
] as const;

export type PermissionModule = typeof permissionModules[number]['key'];
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
export type PermissionMap = Record<PermissionModule, Record<PermissionAction, boolean>>;

export const tenantRoleLabels: Record<TenantRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  gerente: 'Gerente',
  supervisor_sucursal: 'Supervisor de Sucursal',
  vendedor: 'Vendedor',
  cajero: 'Cajero',
  bodega: 'Bodega',
  compras: 'Compras',
  chofer: 'Chofer',
  despachador: 'Despachador',
  solo_lectura: 'Solo Lectura',
  jefe: 'Jefe (legado)',
};

export const tenantRoleOptions = (Object.entries(tenantRoleLabels) as [TenantRole, string][])
  .filter(([role]) => role !== 'jefe');

const actions: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'export'];
function row(view = false, create = false, edit = false, del = false, exportData = false) {
  return { view, create, edit, delete: del, export: exportData };
}
function all(view = true, create = true, edit = true, del = true, exportData = true): PermissionMap {
  return Object.fromEntries(permissionModules.map(({ key }) => [key, row(view, create, edit, del, exportData)])) as PermissionMap;
}

const manager = all(true, true, true, true, true);
const operationalRead = row(true);

export const defaultPermissions: Record<TenantRole, PermissionMap> = {
  owner: manager,
  admin: manager,
  gerente: all(true, true, true, true, true),
  supervisor_sucursal: {
    dashboard: row(true, false, false, false, true),
    catalog: row(true, true, true, false, true),
    inventory: row(true, true, true, false, true),
    sales: row(true, true, true, false, true),
    contacts: row(true, true, true, false, true),
    receivables: row(true, true, true, false, true),
    finance: row(true, true, true, false, true),
    reports: row(true, false, false, false, true),
    members: row(true, true, true, false, false),
  },
  vendedor: {
    dashboard: operationalRead,
    catalog: row(true),
    inventory: row(true),
    sales: row(true, true, true, false),
    contacts: row(true, true, true),
    receivables: row(true, true),
    finance: row(),
    reports: row(true, false, false, false, true),
    members: row(),
  },
  cajero: {
    dashboard: operationalRead,
    catalog: row(true),
    inventory: row(true),
    sales: row(true, true, true, false),
    contacts: row(true, true, true),
    receivables: row(true, true),
    finance: row(true, true),
    reports: row(true, false, false, false, true),
    members: row(),
  },
  bodega: {
    dashboard: operationalRead,
    catalog: row(true, true, true),
    inventory: row(true, true, true),
    sales: row(),
    contacts: row(true),
    receivables: row(),
    finance: row(),
    reports: row(true, false, false, false, true),
    members: row(),
  },
  compras: {
    dashboard: operationalRead,
    catalog: row(true, true, true),
    inventory: row(true, true, true),
    sales: row(true),
    contacts: row(true, true, true),
    receivables: row(),
    finance: row(true, true, true),
    reports: row(true, false, false, false, true),
    members: row(),
  },
  chofer: {
    dashboard: operationalRead,
    catalog: row(true),
    inventory: row(true),
    sales: row(true),
    contacts: row(true),
    receivables: row(),
    finance: row(),
    reports: row(),
    members: row(),
  },
  despachador: {
    dashboard: operationalRead,
    catalog: row(true),
    inventory: row(true, true, true),
    sales: row(true, true, true, false),
    contacts: row(true),
    receivables: row(),
    finance: row(),
    reports: row(true, false, false, false, true),
    members: row(),
  },
  solo_lectura: {
    dashboard: row(true, false, false, false, true),
    catalog: row(true, false, false, false, true),
    inventory: row(true, false, false, false, true),
    sales: row(true, false, false, false, true),
    contacts: row(true, false, false, false, true),
    receivables: row(true, false, false, false, true),
    finance: row(true, false, false, false, true),
    reports: row(true, false, false, false, true),
    members: row(),
  },
  // Compatibilidad con miembros creados antes de la ampliación de roles.
  jefe: all(true, true, true, false, true),
};

export function normalizePermissions(value: unknown, role: TenantRole): PermissionMap {
  const fallback = defaultPermissions[role] || defaultPermissions.solo_lectura;
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(permissionModules.map(({ key }) => {
    const source = input[key] && typeof input[key] === 'object' ? input[key] as Record<string, unknown> : {};
    return [key, Object.fromEntries(actions.map((action) => [
      action,
      typeof source[action] === 'boolean' ? source[action] : fallback[key][action],
    ]))];
  })) as PermissionMap;
}

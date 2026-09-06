'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Action = 'view' | 'create' | 'edit' | 'delete' | 'export';
type Module = { key: string; label: string };
type TenantRole =
  | 'owner'
  | 'admin'
  | 'gerente'
  | 'supervisor_sucursal'
  | 'vendedor'
  | 'cajero'
  | 'bodega'
  | 'compras'
  | 'chofer'
  | 'despachador'
  | 'solo_lectura';
type PermissionRow = Record<Action, boolean>;
type PermissionMatrix = Record<string, PermissionRow>;

const roleLabels: Record<TenantRole, string> = {
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
};

const roleOrder: TenantRole[] = [
  'owner',
  'admin',
  'gerente',
  'supervisor_sucursal',
  'vendedor',
  'cajero',
  'bodega',
  'compras',
  'chofer',
  'despachador',
  'solo_lectura',
];

const actionLabels: Record<Action, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
};
const actions = Object.keys(actionLabels) as Action[];
const emptyRow: PermissionRow = { view: false, create: false, edit: false, delete: false, export: false };

function PermissionsContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [modules, setModules] = useState<Module[]>([]);
  const [roles, setRoles] = useState<Record<string, PermissionMatrix>>({});
  const [selectedRole, setSelectedRole] = useState<TenantRole>('owner');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    try {
      const response = await fetch('/api/permissions', {
        headers: {
          Authorization: `Bearer ${await authUser.getIdToken()}`,
          'x-tenant-id': tenant.id,
        },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar permisos.');
      setModules(data.modules || []);
      setRoles(data.roles || {});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error cargando permisos.');
    } finally {
      setLoading(false);
    }
  }, [authUser, tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(moduleKey: string, action: Action) {
    if (selectedRole === 'owner') return;
    setRoles((current) => ({
      ...current,
      [selectedRole]: {
        ...current[selectedRole],
        [moduleKey]: {
          ...(current[selectedRole]?.[moduleKey] || emptyRow),
          [action]: !current[selectedRole]?.[moduleKey]?.[action],
        },
      },
    }));
  }

  function toggleModule(moduleKey: string, enabled: boolean) {
    if (selectedRole === 'owner') return;
    setRoles((current) => ({
      ...current,
      [selectedRole]: {
        ...current[selectedRole],
        [moduleKey]: { view: enabled, create: enabled, edit: enabled, delete: enabled, export: enabled },
      },
    }));
  }

  async function save() {
    if (!authUser || !tenant || selectedRole === 'owner') return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await authUser.getIdToken()}`,
          'x-tenant-id': tenant.id,
        },
        body: JSON.stringify({ role: selectedRole, permissions: roles[selectedRole] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar permisos.');
      setMessage(`Permisos guardados para ${roleLabels[selectedRole]}.`);
      setRoles((current) => ({ ...current, [selectedRole]: data.permissions }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron guardar permisos.');
    } finally {
      setSaving(false);
    }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando permisos...</div>;
  if (!authUser || !tenant || !member) {
    router.replace('/');
    return null;
  }

  const matrix = roles[selectedRole] || {};
  const ownerSelected = selectedRole === 'owner';

  return (
    <main className="workspace-page">
      <aside className="workspace-sidebar">
        <div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div>
        <div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div></div>
        <nav>
          <a onClick={() => router.push('/workspace')}>▦ <span>Resumen</span></a>
          <a onClick={() => router.push('/workspace/members')}>♙ <span>Usuarios y roles</span></a>
          <a className="active">⚙ <span>Permisos</span></a>
        </nav>
      </aside>
      <section className="workspace-main permissions-main">
        <header className="permissions-header">
          <div>
            <button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button>
            <div className="eyebrow catalog-eyebrow">Tu espacio / Administración</div>
            <h1>Permisos por rol</h1>
            <p>Configura accesos granulares para <strong>{tenant.name}</strong>.</p>
          </div>
          <button className="button" onClick={() => void save()} disabled={saving || ownerSelected}>
            {saving ? 'Guardando...' : ownerSelected ? 'Owner protegido' : 'Guardar cambios ↗'}
          </button>
        </header>
        {message && <div className="catalog-message">{message}</div>}
        <div className="permissions-layout">
          <aside className="role-list">
            <div className="eyebrow">Roles principales</div>
            {roleOrder.map((role) => (
              <button className={selectedRole === role ? 'selected' : ''} key={role} onClick={() => setSelectedRole(role)}>
                <span>{roleLabels[role]}</span>
                <small>{Object.values(roles[role] || {}).filter((item) => item.view).length} módulos</small>
              </button>
            ))}
            <div className="owner-note"><b>Owner</b><small>Acceso total permanente. La matriz no se puede restringir.</small></div>
          </aside>
          <div className="permissions-panel">
            <div className="permissions-panel-head">
              <div><div className="eyebrow">Configurando</div><h2>{roleLabels[selectedRole]}</h2></div>
              <span>Los cambios aplican solo a este tenant</span>
            </div>
            <div className="permission-table">
              <div className="permission-row permission-head"><span>Módulo</span>{actions.map((action) => <span key={action}>{actionLabels[action]}</span>)}</div>
              {modules.map((module) => {
                const row = matrix[module.key] || emptyRow;
                const enabled = Object.values(row).some(Boolean);
                return <div className="permission-row" key={module.key}>
                  <div><b>{module.label}</b><small>{enabled ? 'Acceso configurado' : 'Sin acceso'}</small></div>
                  {actions.map((action) => <button disabled={ownerSelected} aria-label={`${module.label}: ${actionLabels[action]}`} className={row[action] ? 'permission-check checked' : 'permission-check'} key={action} onClick={() => toggle(module.key, action)}>{row[action] ? '✓' : ''}</button>)}
                </div>;
              })}
            </div>
            <div className="permission-footer"><span>{ownerSelected ? 'Selecciona otro rol para editar sus permisos.' : 'Activa o desactiva cada permiso individualmente.'}</span><button disabled={ownerSelected} className="text-link" onClick={() => modules.forEach((module) => toggleModule(module.key, false))}>Quitar todos</button><button disabled={ownerSelected} className="text-link" onClick={() => modules.forEach((module) => toggleModule(module.key, true))}>Dar acceso total</button></div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function PermissionsPage() {
  return <TenantProvider><PermissionsContent /></TenantProvider>;
}

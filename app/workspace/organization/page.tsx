'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';

type Organization = {
  branches: Array<{ id: string; name: string; code: string; active: boolean; timezone?: string }>;
  warehouses: Array<{ id: string; branchId: string; name: string; code: string; active: boolean; type?: string }>;
  cashRegisters: Array<{ id: string; branchId: string; name: string; code: string; active: boolean }>;
  members: Array<{ uid: string; name?: string; email?: string; role?: string; branchIds?: string[]; status?: string }>;
};

const roles: Record<string, string> = { owner: 'Owner', admin: 'Administrador', gerente: 'Gerente', supervisor_sucursal: 'Supervisor', vendedor: 'Vendedor', cajero: 'Cajero', bodega: 'Bodega', compras: 'Compras', chofer: 'Chofer', despachador: 'Despachador', solo_lectura: 'Solo lectura', jefe: 'Jefe' };

function OrganizationContent() {
  const router = useRouter();
  const { authUser, tenant, member, organization: contextOrganization, activeBranchId, setActiveBranchId, loading: tenantLoading, refresh } = useTenant();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [resource, setResource] = useState<'branches' | 'warehouses' | 'cashRegisters'>('branches');
  const [form, setForm] = useState({ name: '', code: '', branchId: '', timezone: 'America/Managua' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    const response = await fetch('/api/organization', { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar la organización.');
    setOrganization(data.organization);
  }, [authUser, tenant]);
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : 'No se pudo cargar la organización.')); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/organization', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ resource, ...form }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo crear el registro.');
      setMessage(`${resource === 'branches' ? 'Sucursal' : resource === 'warehouses' ? 'Almacén' : 'Caja'} creado correctamente.`); setForm({ name: '', code: '', branchId: '', timezone: 'America/Managua' }); await load(); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el registro.'); }
    finally { setSaving(false); }
  }

  async function assign(uid: string, branchIds: string[]) {
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/organization', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ uid, branchIds }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo asignar la sucursal.');
      setMessage('Asignación de sucursal actualizada.'); await load(); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo asignar la sucursal.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || !tenant || !member || !organization) return <div className="workspace-loading">Cargando organización...</div>;
  const canEdit = ['owner', 'admin', 'gerente', 'jefe'].includes(member.role);
  const branches = organization.branches;
  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main"><header className="members-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Organización</div><h1>Sucursales y operación</h1><p>Define dónde trabaja tu equipo y separa la operación de {tenant.name}.</p></div></header>{message && <div className="catalog-message" role="status">{message}</div>}<section className="section-card"><div className="section-card-header"><div><div className="eyebrow">Contexto operativo</div><h2>Sucursal activa</h2><p>Las operaciones nuevas se asociarán a esta sucursal.</p></div><select value={activeBranchId || ''} onChange={(event) => setActiveBranchId(event.target.value)} aria-label="Sucursal activa">{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name} · {branch.code}</option>)}</select></div></section><section className="section-card"><div className="section-card-header"><div><div className="eyebrow">Estructura</div><h2>Agregar recurso organizativo</h2></div></div>{canEdit ? <form className="organization-form" onSubmit={create}><select value={resource} onChange={(event) => setResource(event.target.value as typeof resource)}><option value="branches">Sucursal</option><option value="warehouses">Almacén</option><option value="cashRegisters">Caja</option></select><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre" /><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Código opcional" />{resource !== 'branches' && <select required value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}><option value="">Selecciona sucursal</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select>}{resource === 'branches' && <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="Zona horaria" />}<button className="button" disabled={saving}>{saving ? 'Guardando...' : 'Crear'}</button></form> : <p>Tu rol puede operar en las sucursales asignadas, pero no modificar la estructura.</p>}<div className="organization-grid"><div><h3>Sucursales ({branches.length})</h3>{branches.map((branch) => <div className="organization-row" key={branch.id}><span>●</span><div><b>{branch.name}</b><small>{branch.code} · {branch.timezone || 'America/Managua'}</small></div></div>)}</div><div><h3>Almacenes ({organization.warehouses.length})</h3>{organization.warehouses.map((item) => <div className="organization-row" key={item.id}><span>◇</span><div><b>{item.name}</b><small>{item.code} · {branches.find((branch) => branch.id === item.branchId)?.name || 'Sucursal'}</small></div></div>)}</div><div><h3>Cajas ({organization.cashRegisters.length})</h3>{organization.cashRegisters.map((item) => <div className="organization-row" key={item.id}><span>$</span><div><b>{item.name}</b><small>{item.code} · {branches.find((branch) => branch.id === item.branchId)?.name || 'Sucursal'}</small></div></div>)}</div></div></section>{canEdit && <section className="section-card"><div className="section-card-header"><div><div className="eyebrow">Alcance de datos</div><h2>Asignar usuarios a sucursales</h2><p>Los usuarios operativos solo deben ver las sucursales que necesitan.</p></div></div><div className="organization-members">{organization.members.filter((item) => item.status === 'active').map((item) => <div className="organization-member" key={item.uid}><div><b>{item.name || item.email}</b><small>{item.email} · {roles[item.role || ''] || item.role}</small></div><div className="branch-checks">{branches.map((branch) => <label key={branch.id}><input type="checkbox" checked={(item.branchIds || []).includes(branch.id)} disabled={item.role === 'owner' || saving} onChange={(event) => { const current = item.branchIds || []; void assign(item.uid, event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id)); }} />{branch.name}</label>)}</div></div>)}</div></section>}</section></main>;
}

export default function OrganizationPage() { return <TenantProvider><OrganizationContent /></TenantProvider>; }

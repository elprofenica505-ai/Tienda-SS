'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { useCallback, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Member = { id: string; uid: string; name: string; email: string; role: string; status: string };
const roleLabels: Record<string, string> = { owner: 'Propietario', admin: 'Administrador', gerente: 'Gerente', supervisor_sucursal: 'Supervisor de sucursal', vendedor: 'Vendedor', cajero: 'Cajero', bodega: 'Bodega / inventario', compras: 'Compras', chofer: 'Chofer', despachador: 'Despachador', solo_lectura: 'Solo lectura', jefe: 'Jefe (compatibilidad)' };
const roles = ['admin', 'gerente', 'supervisor_sucursal', 'vendedor', 'cajero', 'bodega', 'compras', 'chofer', 'despachador', 'solo_lectura', 'jefe'];
const roleDescriptions: Record<string, string> = { admin: 'Administra usuarios, permisos y toda la operación.', gerente: 'Supervisa resultados, finanzas, reportes y decisiones del negocio.', supervisor_sucursal: 'Coordina una sucursal y valida la operación diaria.', vendedor: 'Gestiona clientes, ventas, pedidos y cuentas por cobrar.', cajero: 'Opera caja, cobros, ventas y movimientos de efectivo.', bodega: 'Controla inventario, existencias y movimientos de almacén.', compras: 'Gestiona proveedores, compras, costos y reposición.', chofer: 'Consulta pedidos y coordina entregas asignadas.', despachador: 'Prepara pedidos, salidas y coordinación de despacho.', solo_lectura: 'Consulta información y reportes sin modificar datos.', jefe: 'Perfil heredado con control operativo amplio.' };

function MembersContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'vendedor' });

  const load = useCallback(async () => {
    if (!authUser || !tenant) return;
    setLoading(true);
    try {
      const response = await fetch('/api/members', { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los usuarios.');
      setMembers(data.members || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando usuarios.'); }
    finally { setLoading(false); }
  }, [authUser, tenant]);

  useEffect(() => { void load(); }, [load]);

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar la invitación.');
      setMessage(`Invitación enviada a ${form.email}. La persona creará su cuenta al aceptar.`);
      setShowForm(false); setForm({ email: '', role: 'vendedor' });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo enviar la invitación.'); }
    finally { setSaving(false); }
  }

  async function update(uid: string, payload: Record<string, unknown>, success: string) {
    if (!authUser || !tenant) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ uid, ...payload }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el usuario.');
      setMessage(success); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo actualizar el usuario.'); }
    finally { setSaving(false); }
  }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando usuarios...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  const filtered = members.filter((item) => `${item.name} ${item.email} ${roleLabels[item.role] || item.role}`.toLowerCase().includes(query.toLowerCase()));

  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main members-main"><header className="members-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Administración</div><h1>Usuarios y roles</h1><p>Invita y administra quién puede operar en <strong>{tenant.name}</strong>.</p></div><button className="button" onClick={() => setShowForm(true)}>+ Invitar empleado</button></header>{message && <div className="catalog-message" role="status">{message}</div>}<div className="members-toolbar"><div className="members-count"><strong>{members.filter((item) => item.status === 'active').length}</strong><span>usuarios activos</span></div><input className="contacts-search" aria-label="Buscar usuarios" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o correo" /></div><div className="members-list">{filtered.length === 0 ? <div className="catalog-empty"><div className="empty-spark">♙</div><h2>Aún no hay usuarios adicionales</h2><p>Envía una invitación y la persona creará su cuenta dentro de este tenant.</p><button className="button" onClick={() => setShowForm(true)}>Invitar primer empleado ↗</button></div> : filtered.map((item) => <article className={`member-card ${item.status !== 'active' ? 'is-archived' : ''}`} key={item.uid}><div className="contact-avatar">{item.name.slice(0, 1).toUpperCase()}</div><div className="member-info"><h3>{item.name}</h3><small>{item.email}</small><span className={`member-status ${item.status === 'active' ? 'active' : 'disabled'}`}>{item.status === 'active' ? 'Activo' : 'Desactivado'}</span></div><select aria-label={`Rol de ${item.email}`} value={item.role} disabled={item.role === 'owner' || item.uid === member.uid || saving} onChange={(event) => void update(item.uid, { role: event.target.value }, 'Rol actualizado.')}><option value={item.role}>{roleLabels[item.role] || item.role}</option>{item.role !== 'owner' && roles.filter((role) => role !== item.role).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>{item.role !== 'owner' && item.uid !== member.uid && <button className="member-toggle" disabled={saving} onClick={() => void update(item.uid, { status: item.status === 'active' ? 'disabled' : 'active' }, item.status === 'active' ? 'Usuario desactivado.' : 'Usuario reactivado.')}>{item.status === 'active' ? 'Desactivar' : 'Reactivar'}</button>}</article>)}</div>{showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><div className="catalog-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Cerrar invitación" onClick={() => setShowForm(false)}>×</button><div className="eyebrow">Invitación de equipo</div><h2>Invita a tu equipo.</h2><p>La persona recibirá un enlace, creará su contraseña y quedará activa en este tenant al aceptar.</p><form onSubmit={createInvitation}><label>Correo<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="usuario@empresa.com" /></label><label>Rol<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select><small className="role-helper">{roleDescriptions[form.role]}</small></label><button className="button auth-submit" disabled={saving}>{saving ? 'Enviando...' : 'Enviar invitación ↗'}</button></form></div></div>}</section></main>;
}

export default function MembersPage() { return <TenantProvider><MembersContent /></TenantProvider>; }

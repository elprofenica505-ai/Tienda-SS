'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

type Contact = { id: string; name: string; email?: string; phone?: string; taxId?: string; address?: string; notes?: string; active: boolean };
type Editing = Contact & { type: 'customer' | 'supplier' };

function ContactsContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading: tenantLoading } = useTenant();
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', taxId: '', address: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!authUser || !tenant) return;
    setLoading(true);
    try { const response = await fetch(`/api/contacts?type=${tab}${showArchived ? '&includeArchived=true' : ''}`, { headers: { Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los contactos.'); setContacts(data.contacts || []); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Error cargando contactos.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [authUser, tenant, tab, showArchived]);

  function openNew() { setEditing(null); setForm({ name: '', email: '', phone: '', taxId: '', address: '', notes: '' }); setShowForm(true); }
  function openEdit(item: Contact) { setShowForm(false); setEditing({ ...item, type: tab }); }
  async function save(event: FormEvent) { event.preventDefault(); if (!authUser || !tenant) return; setSaving(true); setMessage(''); try { const body = editing ? { type: tab, id: editing.id, ...form } : { type: tab, ...form }; const response = await fetch('/api/contacts', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo guardar.'); setMessage(editing ? 'Cambios guardados.' : `${tab === 'customer' ? 'Cliente' : 'Proveedor'} creado.`); setShowForm(false); setEditing(null); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); } finally { setSaving(false); } }
  async function toggle(item: Contact) { if (!authUser || !tenant) return; setSaving(true); try { const response = await fetch('/api/contacts', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authUser.getIdToken()}`, 'x-tenant-id': tenant.id }, body: JSON.stringify({ type: tab, id: item.id, active: !item.active }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado.'); setMessage(item.active ? 'Registro archivado.' : 'Registro reactivado.'); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cambiar el estado.'); } finally { setSaving(false); } }

  if (tenantLoading || loading) return <div className="workspace-loading">Cargando {tab === 'customer' ? 'clientes' : 'proveedores'}...</div>;
  if (!authUser || !tenant || !member) { router.replace('/'); return null; }
  const filtered = contacts.filter((item) => `${item.name} ${item.email || ''} ${item.phone || ''} ${item.taxId || ''}`.toLowerCase().includes(query.toLowerCase()));
  const currentForm = editing || form;
  const updateForm = (field: string, value: string) => editing ? setEditing({ ...editing, [field]: value }) : setForm({ ...form, [field]: value });

  return <main className="workspace-page"><aside className="workspace-sidebar"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div><div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div></div><nav><a onClick={() => router.push('/workspace')}>▦ <span>Resumen</span></a><a onClick={() => router.push('/workspace/catalog')}>◇ <span>Catálogo</span></a><a onClick={() => router.push('/workspace/inventory')}>▤ <span>Inventario</span></a><a onClick={() => router.push('/workspace/sales')}>◈ <span>Ventas / POS</span></a><a className="active">○ <span>Contactos</span></a></nav></aside><section className="workspace-main contacts-main"><header className="contacts-header"><div><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><div className="eyebrow catalog-eyebrow">Tu espacio / Contactos</div><h1>Contactos</h1><p>Gestiona clientes y proveedores de <strong>{tenant.name}</strong>.</p></div><button className="button" onClick={openNew}>+ Nuevo {tab === 'customer' ? 'cliente' : 'proveedor'}</button></header>{message && <div className="catalog-message">{message}</div>}<div className="contacts-toolbar"><div className="catalog-tabs"><button className={tab === 'customer' ? 'selected' : ''} onClick={() => setTab('customer')}>Clientes</button><button className={tab === 'supplier' ? 'selected' : ''} onClick={() => setTab('supplier')}>Proveedores</button></div><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivados</label><input className="contacts-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, correo o teléfono" /></div><div className="contacts-grid">{filtered.length === 0 ? <div className="catalog-empty"><div className="empty-spark">○</div><h2>{showArchived ? 'No hay registros archivados' : `Aún no hay ${tab === 'customer' ? 'clientes' : 'proveedores'}`}</h2><p>Comienza agregando contactos propios de {tenant.name}.</p><button className="button" onClick={openNew}>Crear {tab === 'customer' ? 'cliente' : 'proveedor'} ↗</button></div> : filtered.map((item) => <article className={`contact-card ${!item.active ? 'is-archived' : ''}`} key={item.id}><div className="contact-avatar">{item.name.slice(0, 1).toUpperCase()}</div><div className="contact-info"><span>{!item.active ? 'Archivado' : tab === 'customer' ? 'Cliente' : 'Proveedor'}</span><h3>{item.name}</h3><small>{item.email || 'Sin correo'}</small><small>{item.phone || 'Sin teléfono'} {item.taxId ? `· ${item.taxId}` : ''}</small></div><div className="card-actions"><button onClick={() => openEdit(item)}>Editar</button><button disabled={saving} onClick={() => void toggle(item)}>{item.active ? 'Archivar' : 'Reactivar'}</button></div></article>)}</div>{(showForm || editing) && <div className="modal-backdrop" onClick={() => { setShowForm(false); setEditing(null); }}><div className="catalog-modal contact-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => { setShowForm(false); setEditing(null); }}>×</button><div className="eyebrow">{editing ? 'Editar contacto' : `Nuevo ${tab === 'customer' ? 'cliente' : 'proveedor'}`}</div><h2>{editing ? 'Actualiza sus datos.' : 'Agrega un contacto.'}</h2><form onSubmit={save}><label>Nombre o razón social<input required minLength={2} value={currentForm.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Ej. Comercial Central" /></label><div className="form-two"><label>Correo<input type="email" value={currentForm.email || ''} onChange={(event) => updateForm('email', event.target.value)} placeholder="correo@empresa.com" /></label><label>Teléfono<input value={currentForm.phone || ''} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+505 0000 0000" /></label></div><label>Identificación fiscal<input value={currentForm.taxId || ''} onChange={(event) => updateForm('taxId', event.target.value)} placeholder="Opcional" /></label><label>Dirección<input value={currentForm.address || ''} onChange={(event) => updateForm('address', event.target.value)} placeholder="Opcional" /></label><label>Notas<textarea value={currentForm.notes || ''} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Información adicional" /></label><button className="button auth-submit" disabled={saving}>{saving ? 'Guardando...' : editing ? 'Guardar cambios ↗' : 'Crear contacto ↗'}</button></form></div></div>}</section></main>;
}

export default function ContactsPage() { return <TenantProvider><ContactsContent /></TenantProvider>; }

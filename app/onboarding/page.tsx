'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { cerrarSesion } from '@/lib/auth';

type Step = 1 | 2 | 3 | 4;
const roles = ['vendedor', 'cajero', 'bodega', 'chofer'] as const;
const roleLabels: Record<(typeof roles)[number], string> = { vendedor: 'Vendedor', cajero: 'Cajero', bodega: 'Bodega', chofer: 'Chofer' };

function OnboardingContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading, error, refresh } = useTenant();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'vendedor' as (typeof roles)[number] });
  const [product, setProduct] = useState({ name: '', sku: '', price: '', stock: '0' });

  useEffect(() => {
    if (tenant) setBusinessName(tenant.name);
  }, [tenant]);
  useEffect(() => {
    if (!loading && tenant?.onboardingCompleted) router.replace('/workspace');
  }, [loading, tenant?.onboardingCompleted, router]);

  if (loading) return <div className="onboarding-loading" role="status" aria-live="polite">Preparando tu espacio...</div>;
  if (!authUser) { router.replace('/'); return null; }
  if (error || !tenant || !member) return <div className="onboarding-loading"><div className="onboarding-error" role="alert"><h1>No pudimos cargar tu espacio</h1><p>{error || 'Tu cuenta todavía no tiene una empresa activa.'}</p><button className="button" onClick={() => router.replace('/')}>Volver al inicio</button></div></div>;

  async function request(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    const token = await authUser!.getIdToken();
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-tenant-id': tenant!.id }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el avance.');
    return data;
  }

  async function saveBusiness(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage('');
    try { await request('/api/tenants/me', 'PATCH', { name: businessName }); setStep(2); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar el negocio.'); }
    finally { setSaving(false); }
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage('');
    try { await request('/api/invitations', 'POST', { email: invite.email, role: invite.role }); setMessage('Invitación enviada. Puedes continuar o invitar a otra persona.'); setInvite({ ...invite, email: '' }); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo enviar la invitación.'); }
    finally { setSaving(false); }
  }

  async function createFirstProduct(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage('');
    try { await request('/api/catalog', 'POST', { type: 'product', name: product.name.trim(), sku: product.sku.trim(), price: Number(product.price || 0), stock: Number(product.stock || 0), itemType: 'physical' }); setStep(4); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo crear el producto.'); }
    finally { setSaving(false); }
  }

  async function finishOnboarding() {
    setSaving(true); setMessage('');
    try { await request('/api/tenants/me', 'PATCH', { onboardingCompleted: true }); await refresh(); router.push('/workspace'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar el avance.'); setSaving(false); }
  }

  async function finishAndOpenSales() {
    setSaving(true); setMessage('');
    try { await request('/api/tenants/me', 'PATCH', { onboardingCompleted: true }); await refresh(); router.push('/workspace/sales'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar el avance.'); setSaving(false); }
  }

  return <main className="onboarding-page"><div className="onboarding-shell"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>ConexiaX</b></div><div className="onboarding-progress" aria-label={`Paso ${step} de 4`}>{[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? 'current' : ''} />)}</div><div className="onboarding-card"><div className="onboarding-icon">{step === 1 ? '✦' : step === 2 ? '◇' : step === 3 ? '□' : '↗'}</div><div className="eyebrow">Paso {step} de 4</div>{step === 1 && <><h1>Configura tu negocio.</h1><p>Confirma el nombre que verá tu equipo y en tus documentos.</p><form className="onboarding-form" onSubmit={saveBusiness}><label>Nombre del negocio<input autoFocus required minLength={2} maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label>{message && <div className="form-message" role="alert">{message}</div>}<div className="onboarding-actions"><button className="button button-large" disabled={saving}>{saving ? 'Guardando...' : 'Continuar ↗'}</button></div></form></>}{step === 2 && <><h1>Invita a tu equipo.</h1><p>Es opcional, pero puedes enviar ahora una invitación a un vendedor, cajero, bodega o chofer.</p><form className="onboarding-form" onSubmit={sendInvite}><label>Correo del empleado<input type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="persona@empresa.com" /></label><label>Rol<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as (typeof roles)[number] })}>{roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{message && <div className="form-message" role="status">{message}</div>}<div className="onboarding-actions"><button type="button" className="onboarding-logout" onClick={() => setStep(1)}>Atrás</button><button className="button button-large" disabled={saving}>{saving ? 'Enviando...' : 'Enviar invitación ↗'}</button></div></form><button className="onboarding-secondary" disabled={saving} onClick={() => { setMessage(''); setStep(3); }}>Saltar por ahora</button></>}{step === 3 && <><h1>Agrega tu primer producto.</h1><p>Con un producto podrás registrar una venta real. Puedes editarlo después.</p><form className="onboarding-form" onSubmit={createFirstProduct}><label>Nombre del producto<input autoFocus required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} placeholder="Ej. Café molido 250 g" /></label><label>SKU<input required value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} placeholder="Ej. CAFE-250" /></label><div className="form-two"><label>Precio<input type="number" min="0" step="0.01" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} placeholder="0.00" /></label><label>Stock inicial<input type="number" min="0" step="1" value={product.stock} onChange={(event) => setProduct({ ...product, stock: event.target.value })} /></label></div>{message && <div className="form-message" role="alert">{message}</div>}<div className="onboarding-actions"><button type="button" className="onboarding-logout" onClick={() => setStep(2)}>Atrás</button><button className="button button-large" disabled={saving}>{saving ? 'Creando...' : 'Guardar producto ↗'}</button></div></form><button className="onboarding-secondary" disabled={saving} onClick={() => setStep(4)}>Saltar por ahora</button></>}{step === 4 && <><h1>Haz tu primera venta.</h1><p>El punto de venta está listo. Cobra tu primer ticket o entra al resumen si prefieres hacerlo después.</p><div className="onboarding-next"><strong>Tu operación empieza aquí</strong><span>Ventas / POS · selección de producto · cobro</span></div>{message && <div className="form-message" role="alert">{message}</div>}<div className="onboarding-actions"><button className="button button-large" onClick={() => void finishAndOpenSales()} disabled={saving}>{saving ? 'Guardando...' : 'Abrir Ventas / POS ↗'}</button><button className="onboarding-secondary" disabled={saving} onClick={finishOnboarding}>{saving ? 'Guardando...' : 'Ir al resumen por ahora'}</button></div></>}</div><small className="onboarding-footnote">Empresa protegida · {tenant.plan || 'Starter'} · Datos aislados</small><button className="onboarding-logout" onClick={() => void cerrarSesion()}>Cerrar sesión</button></div></main>;
}

export default function OnboardingPage() { return <TenantProvider><OnboardingContent /></TenantProvider>; }

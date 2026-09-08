'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { cerrarSesion } from '@/lib/auth';

type Step = 1 | 2 | 3;

function OnboardingContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading, error, refresh } = useTenant();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [product, setProduct] = useState({ name: '', sku: '', price: '', stock: '0' });

  useEffect(() => {
    if (!loading && tenant?.onboardingCompleted) router.replace('/workspace');
  }, [loading, tenant?.onboardingCompleted, router]);

  if (loading) return <div className="onboarding-loading" role="status" aria-live="polite">Preparando tu espacio...</div>;
  if (!authUser) { router.replace('/'); return null; }
  if (error || !tenant || !member) return <div className="onboarding-loading"><div className="onboarding-error" role="alert"><h1>No pudimos cargar tu espacio</h1><p>{error || 'Tu cuenta todavía no tiene una empresa activa.'}</p><button className="button" onClick={() => router.replace('/')}>Volver al inicio</button></div></div>;

  async function createFirstProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!product.name.trim() || !product.sku.trim()) return;
    setSaving(true); setMessage('');
    try {
      const token = await authUser!.getIdToken();
      const response = await fetch('/api/catalog', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-tenant-id': tenant!.id }, body: JSON.stringify({ type: 'product', name: product.name.trim(), sku: product.sku.trim(), price: Number(product.price || 0), stock: Number(product.stock || 0), itemType: 'physical' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el producto.');
      setStep(3);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo crear el producto.'); }
    finally { setSaving(false); }
  }

  async function finishOnboarding() {
    setSaving(true); setMessage('');
    try {
      const token = await authUser!.getIdToken();
      const response = await fetch('/api/tenants/me', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-tenant-id': tenant!.id }, body: JSON.stringify({ onboardingCompleted: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el avance.');
      await refresh(); router.push('/workspace');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar el avance.'); setSaving(false); }
  }

  return <main className="onboarding-page"><div className="onboarding-shell"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>ConexiaX</b></div><div className="onboarding-progress" aria-label={`Paso ${step} de 3`}>{[1, 2, 3].map((item) => <span key={item} className={item <= step ? 'current' : ''} />)}</div><div className="onboarding-card"><div className="onboarding-icon">{step === 1 ? '✦' : step === 2 ? '◇' : '↗'}</div><div className="eyebrow">Paso {step} de 3</div>{step === 1 && <><h1>Tu empresa ya está lista.</h1><p>Hola <strong>{member.name || authUser.displayName || 'propietario'}</strong>. Vamos a preparar <strong>{tenant.name}</strong> con lo mínimo para empezar a operar.</p><div className="onboarding-empty"><div><span>1</span><small>Empresa creada</small></div><div><span>0</span><small>Productos</small></div><div><span>0</span><small>Ventas</small></div></div><div className="onboarding-actions"><button className="button button-large" onClick={() => setStep(2)}>Crear mi primer producto ↗</button></div></>}{step === 2 && <><h1>Agrega tu primer producto.</h1><p>Con un producto podrás registrar una venta real en el siguiente paso. Puedes editar todo después.</p><form className="onboarding-form" onSubmit={createFirstProduct}><label>Nombre del producto<input autoFocus required value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} placeholder="Ej. Café molido 250 g" /></label><label>SKU<input required value={product.sku} onChange={(event) => setProduct({ ...product, sku: event.target.value })} placeholder="Ej. CAFE-250" /></label><div className="form-two"><label>Precio<input type="number" min="0" step="0.01" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} placeholder="0.00" /></label><label>Stock inicial<input type="number" min="0" step="1" value={product.stock} onChange={(event) => setProduct({ ...product, stock: event.target.value })} /></label></div>{message && <div className="form-message" role="alert">{message}</div>}<div className="onboarding-actions"><button type="button" className="onboarding-logout" onClick={() => setStep(1)}>Atrás</button><button className="button button-large" disabled={saving}>{saving ? 'Creando...' : 'Guardar producto ↗'}</button></div></form></>}{step === 3 && <><h1>Registra tu primera venta.</h1><p>Tu producto ya está creado. Abre el punto de venta para cobrarlo; al terminar podrás volver al resumen cuando quieras.</p><div className="onboarding-next"><strong>El siguiente paso está listo</strong><span>Ventas / POS · selección de producto · cobro</span></div>{message && <div className="form-message" role="alert">{message}</div>}<div className="onboarding-actions"><button className="button button-large" onClick={() => router.push('/workspace/sales')}>Abrir Ventas / POS ↗</button><button className="onboarding-secondary" disabled={saving} onClick={finishOnboarding}>{saving ? 'Guardando...' : 'Ir al resumen por ahora'}</button></div></>}</div><small className="onboarding-footnote">Empresa protegida · {tenant.plan || 'Starter'} · Datos aislados</small><button className="onboarding-logout" onClick={() => void cerrarSesion()}>Cerrar sesión</button></div></main>;
}

export default function OnboardingPage() { return <TenantProvider><OnboardingContent /></TenantProvider>; }

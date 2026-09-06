'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { cerrarSesion } from '@/lib/auth';

function OnboardingContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading, error } = useTenant();

  useEffect(() => {
    if (!loading && tenant?.onboardingCompleted) router.replace('/workspace');
  }, [loading, tenant?.onboardingCompleted, router]);

  if (loading) return <div className="onboarding-loading">Preparando tu espacio...</div>;

  if (!authUser) {
    if (typeof window !== 'undefined') router.replace('/');
    return null;
  }

  if (error || !tenant || !member) {
    return <div className="onboarding-loading"><div className="onboarding-error"><h1>No pudimos cargar tu espacio</h1><p>{error || 'Tu cuenta todavía no tiene una empresa activa.'}</p><button className="button" onClick={() => router.replace('/')}>Volver al inicio</button></div></div>;
  }

  const currentAuthUser = authUser;
  const currentTenant = tenant;

  async function enterWorkspace() {
    try {
      const token = await currentAuthUser.getIdToken();
      await fetch('/api/tenants/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-tenant-id': currentTenant.id },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } finally {
      router.push('/workspace');
    }
  }

  return <main className="onboarding-page"><div className="onboarding-shell"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div><div className="onboarding-progress"><span className="current" /><span /><span /></div><div className="onboarding-card"><div className="onboarding-icon">✦</div><div className="eyebrow">Tu espacio está listo</div><h1>Bienvenido, {member.name || authUser.displayName || 'propietario'}.</h1><p>Tu empresa <strong>{tenant.name}</strong> ya tiene un espacio privado. Empezarás con un catálogo vacío para que lo configures a tu medida.</p><div className="onboarding-empty"><div><span>0</span><small>Productos</small></div><div><span>0</span><small>Clientes</small></div><div><span>0</span><small>Ventas</small></div></div><div className="onboarding-actions"><button className="button button-large" onClick={enterWorkspace}>Entrar a mi espacio ↗</button><button className="onboarding-logout" onClick={() => cerrarSesion()}>Cerrar sesión</button></div></div><small className="onboarding-footnote">Empresa protegida · {tenant.plan || 'Starter'} · Datos aislados</small></div></main>;
}

export default function OnboardingPage() {
  return <TenantProvider><OnboardingContent /></TenantProvider>;
}

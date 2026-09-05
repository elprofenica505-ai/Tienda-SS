'use client';

import { useRouter } from 'next/navigation';
import { cerrarSesion } from '@/lib/auth';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';

function WorkspaceContent() {
  const router = useRouter();
  const { authUser, tenant, member, loading, error } = useTenant();

  if (loading) return <div className="workspace-loading">Cargando tu espacio...</div>;
  if (!authUser || error || !tenant || !member) {
    if (typeof window !== 'undefined') router.replace('/');
    return null;
  }

  return <main className="workspace-page"><aside className="workspace-sidebar"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>Nexo<span>Flow</span></b></div><div className="workspace-company"><span>{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div><i>⌄</i></div><nav><a className="active">▦ <span>Resumen</span></a><a>◈ <span>Ventas</span></a><a>◇ <span>Inventario</span></a><a>○ <span>Clientes</span></a><a onClick={() => router.push('/workspace/reports')}>≡ <span>Reportes</span></a><a onClick={() => router.push('/workspace/members')}>♙ <span>Usuarios y roles</span></a><a onClick={() => router.push('/workspace/permissions')}>⚙ <span>Permisos</span></a></nav><div className="workspace-sidebar-bottom"><a onClick={() => router.push('/workspace/billing')}>◈ <span>Plan y facturación</span></a><a onClick={() => router.push('/workspace/notifications')}>♢ <span>Notificaciones</span></a><button onClick={() => cerrarSesion()}>↪ <span>Cerrar sesión</span></button></div></aside><section className="workspace-main"><header className="workspace-header"><div><small>Tu espacio de trabajo</small><h1>Buenos días, {member.name || authUser.displayName || 'propietario'} <span>✦</span></h1></div><div className="workspace-user"><span>♧</span><b>{(member.name || authUser.email || 'U').slice(0, 2).toUpperCase()}</b></div></header><div className="workspace-banner"><div><div className="eyebrow">Primeros pasos</div><h2>Haz que tu operación<br /><em>empiece a moverse.</em></h2><p>Tu espacio está vacío y listo para personalizar. Agrega tu primera categoría o producto para comenzar.</p><button className="button" onClick={() => router.push('/workspace/catalog')}>Configurar catálogo ↗</button></div><div className="banner-orbit"><span>✦</span><i>+</i><b>◇</b></div></div><div className="workspace-section-heading"><div><div className="eyebrow">Resumen</div><h2>Tu operación, en blanco</h2></div><span>Actualizado ahora</span></div><div className="empty-metrics"><div><small>Ventas del mes</small><strong>$0.00</strong><span>Empieza registrando una venta</span></div><div><small>Productos</small><strong>0</strong><span>Tu catálogo está vacío</span></div><div><small>Clientes</small><strong>0</strong><span>Aún no hay clientes</span></div></div><div className="workspace-empty"><div className="empty-spark">✦</div><h3>Todo listo para comenzar</h3><p>Cuando agregues productos, clientes y ventas, aquí verás las métricas que importan para tu negocio.</p><button className="text-link" onClick={() => router.push('/workspace/catalog')}>Agregar mi primer producto <span>↗</span></button></div></section></main>;
}

export default function WorkspacePage() {
  return <TenantProvider><WorkspaceContent /></TenantProvider>;
}

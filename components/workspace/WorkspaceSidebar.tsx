'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cerrarSesion } from '@/lib/auth';
import { useTenant } from '@/components/tenant/TenantProvider';

const primaryItems = [
  { href: '/workspace', icon: '▦', label: 'Resumen', exact: true },
  { href: '/workspace/cashier', icon: '$', label: 'Vender / Caja' },
  { href: '/workspace/catalog', icon: '▤', label: 'Productos' },
  { href: '/workspace/sales', icon: '◈', label: 'Ventas' },
  { href: '/workspace/contacts', icon: '○', label: 'Clientes' },
  { href: '/workspace/members', icon: '♙', label: 'Usuarios' },
  { href: '/workspace/billing', icon: '◈', label: 'Plan' },
];

const secondaryItems: typeof primaryItems = [];

export function WorkspaceSidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isActive = (href: string, exact?: boolean) => exact ? pathname === href : pathname.startsWith(href);

  return <aside className={`workspace-sidebar${mobileOpen ? ' mobile-open' : ''}`} aria-label="Navegación principal"><div className="workspace-sidebar-header"><div className="onboarding-brand"><svg className="brand-mark-icon" viewBox="0 0 64 64" role="img" aria-label="Ícono ConexiaX"><path d="M18 18 46 46M46 18 18 46" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="8" /><circle cx="18" cy="18" r="5" fill="currentColor" /><circle cx="46" cy="18" r="5" fill="currentColor" /><circle cx="18" cy="46" r="5" fill="currentColor" /><circle cx="46" cy="46" r="5" fill="currentColor" /></svg><b>ConexiaX</b></div><button type="button" className="workspace-mobile-toggle" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={() => setMobileOpen((open) => !open)}><span aria-hidden="true">{mobileOpen ? '×' : '☰'}</span><span>{mobileOpen ? 'Cerrar menú' : 'Menú'}</span></button></div>{tenant && <div className="workspace-company"><span aria-hidden="true">{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div><i aria-hidden="true">⌄</i></div>}<div id="workspace-navigation" className="workspace-navigation"><nav aria-label="Navegación principal">{primaryItems.map((item) => <Link onClick={() => setMobileOpen(false)} className={isActive(item.href, item.exact) ? 'active' : ''} aria-current={isActive(item.href, item.exact) ? 'page' : undefined} href={item.href} key={item.href}><span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}</nav><div className="workspace-sidebar-bottom"><nav aria-label="Navegación secundaria">{secondaryItems.map((item) => <Link onClick={() => setMobileOpen(false)} className={isActive(item.href) ? 'active' : ''} aria-current={isActive(item.href) ? 'page' : undefined} href={item.href} key={item.href}><span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}</nav><button type="button" onClick={() => void cerrarSesion()}><span className="workspace-nav-icon" aria-hidden="true">↪</span><span>Cerrar sesión</span></button></div></div></aside>;
}

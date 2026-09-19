'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cerrarSesion } from '@/lib/auth';
import { useTenant } from '@/components/tenant/TenantProvider';

type NavItem = { href: string; icon: string; label: string; exact?: boolean };

const operationItems: NavItem[] = [
  { href: '/workspace', icon: '▦', label: 'Resumen', exact: true },
  { href: '/workspace/cashier', icon: '$', label: 'Vender / Caja' },
  { href: '/workspace/presales', icon: '↗', label: 'Preventa en piso' },
  { href: '/workspace/catalog', icon: '▤', label: 'Productos' },
  { href: '/workspace/contacts', icon: '○', label: 'Clientes' },
  { href: '/workspace/sales', icon: '◈', label: 'Ventas' },
  { href: '/workspace/returns', icon: '↩', label: 'Devoluciones' },
];

const controlItems: NavItem[] = [
  { href: '/workspace/inventory', icon: '◇', label: 'Stock / Inventario' },
  { href: '/workspace/purchases', icon: '↥', label: 'Compras' },
  { href: '/workspace/finance', icon: '$', label: 'Finanzas' },
  { href: '/workspace/reports', icon: '≡', label: 'Reportes / Ganancias' },
];

const companyItems: NavItem[] = [
  { href: '/workspace/organization', icon: '⌂', label: 'Sucursales y cajas' },
  { href: '/workspace/members', icon: '♙', label: 'Usuarios y permisos' },
  { href: '/workspace/fiscal', icon: '▣', label: 'Facturación fiscal' },
  { href: '/workspace/billing', icon: '◈', label: 'Plan' },
];

function NavigationGroup({ label, items, pathname, onNavigate }: { label: string; items: NavItem[]; pathname: string; onNavigate: () => void }) {
  const isActive = (href: string, exact?: boolean) => exact ? pathname === href : pathname.startsWith(href);
  return <div className="workspace-nav-group"><span className="workspace-nav-group-label">{label}</span><nav aria-label={label}>{items.map((item) => <Link onClick={onNavigate} className={isActive(item.href, item.exact) ? 'active' : ''} aria-current={isActive(item.href, item.exact) ? 'page' : undefined} href={item.href} key={item.href}><span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}</nav></div>;
}

export function WorkspaceSidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = () => setMobileOpen(false);

  return <aside className={`workspace-sidebar${mobileOpen ? ' mobile-open' : ''}`} aria-label="Navegación principal"><div className="workspace-sidebar-header"><div className="onboarding-brand"><svg className="brand-mark-icon" viewBox="0 0 64 64" role="img" aria-label="Ícono ConexiaX"><path d="M18 18 46 46M46 18 18 46" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="8" /><circle cx="18" cy="18" r="5" fill="currentColor" /><circle cx="46" cy="18" r="5" fill="currentColor" /><circle cx="18" cy="46" r="5" fill="currentColor" /><circle cx="46" cy="46" r="5" fill="currentColor" /></svg><b>ConexiaX</b></div><button type="button" className="workspace-mobile-toggle" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={() => setMobileOpen((open) => !open)}><span aria-hidden="true">{mobileOpen ? '×' : '☰'}</span><span>{mobileOpen ? 'Cerrar menú' : 'Menú'}</span></button></div>{tenant && <div className="workspace-company"><span aria-hidden="true">{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div><i aria-hidden="true">⌄</i></div>}<div id="workspace-navigation" className="workspace-navigation"><NavigationGroup label="Operación" items={operationItems} pathname={pathname} onNavigate={closeMobileMenu} /><NavigationGroup label="Control" items={controlItems} pathname={pathname} onNavigate={closeMobileMenu} /><NavigationGroup label="Empresa" items={companyItems} pathname={pathname} onNavigate={closeMobileMenu} /><div className="workspace-sidebar-bottom"><button type="button" onClick={() => void cerrarSesion()}><span className="workspace-nav-icon" aria-hidden="true">↪</span><span>Cerrar sesión</span></button></div></div></aside>;
}

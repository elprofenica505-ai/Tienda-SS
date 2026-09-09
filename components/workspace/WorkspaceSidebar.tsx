'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cerrarSesion } from '@/lib/auth';
import { useTenant } from '@/components/tenant/TenantProvider';

const primaryItems = [
  { href: '/workspace', icon: '▦', label: 'Resumen', exact: true },
  { href: '/workspace/sales', icon: '◈', label: 'Ventas / POS' },
  { href: '/workspace/returns', icon: '↩', label: 'Devoluciones y notas' },
  { href: '/workspace/presales', icon: '↗', label: 'Preventa en piso' },
  { href: '/workspace/cashier', icon: '$', label: 'Caja / Tickets' },
  { href: '/workspace/catalog', icon: '▤', label: 'Catálogo' },
  { href: '/workspace/inventory', icon: '◇', label: 'Inventario' },
  { href: '/workspace/warehouse-inventory', icon: '▥', label: 'Stock por almacén' },
  { href: '/workspace/purchases', icon: '↥', label: 'Compras' },
  { href: '/workspace/deliveries', icon: '➜', label: 'Entregas' },
  { href: '/workspace/contacts', icon: '○', label: 'Clientes' },
  { href: '/workspace/finance', icon: '$', label: 'Finanzas' },
  { href: '/workspace/receivables', icon: '◌', label: 'Cuentas por cobrar' },
  { href: '/workspace/reports', icon: '≡', label: 'Reportes' },
  { href: '/workspace/members', icon: '♙', label: 'Usuarios y roles' },
  { href: '/workspace/organization', icon: '⌂', label: 'Sucursales y cajas' },
  { href: '/workspace/permissions', icon: '⚙', label: 'Permisos' },
];

const secondaryItems = [
  { href: '/workspace/billing', icon: '◈', label: 'Plan y facturación' },
  { href: '/workspace/notifications', icon: '♢', label: 'Notificaciones' },
  { href: '/workspace/security', icon: '⌁', label: 'Seguridad' },
  { href: '/workspace/help', icon: '?', label: 'Centro de ayuda' },
];

export function WorkspaceSidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const isActive = (href: string, exact?: boolean) => exact ? pathname === href : pathname.startsWith(href);

  return <aside className="workspace-sidebar" aria-label="Navegación principal"><div className="onboarding-brand"><span className="brand-mark-icon">N</span><b>ConexiaX</b></div>{tenant && <div className="workspace-company"><span aria-hidden="true">{tenant.name.slice(0, 1).toUpperCase()}</span><div><b>{tenant.name}</b><small>Plan {tenant.plan || 'Starter'}</small></div><i aria-hidden="true">⌄</i></div>}<nav aria-label="Módulos del ERP">{primaryItems.map((item) => <Link className={isActive(item.href, item.exact) ? 'active' : ''} aria-current={isActive(item.href, item.exact) ? 'page' : undefined} href={item.href} key={item.href}><span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}</nav><div className="workspace-sidebar-bottom"><nav aria-label="Configuración, ayuda y cuenta">{secondaryItems.map((item) => <Link className={isActive(item.href) ? 'active' : ''} aria-current={isActive(item.href) ? 'page' : undefined} href={item.href} key={item.href}><span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}</nav><button type="button" onClick={() => void cerrarSesion()}><span className="workspace-nav-icon" aria-hidden="true">↪</span><span>Cerrar sesión</span></button></div></aside>;
}

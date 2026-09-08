'use client';

import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar';
import { TenantProvider, useTenant } from '@/components/tenant/TenantProvider';
import { useRouter } from 'next/navigation';

const articles = [
  ['Primeros pasos', 'Crea productos desde Catálogo, registra clientes y abre Ventas / POS para cobrar. El resumen te muestra el avance de tu operación.'],
  ['Inventario', 'Usa Inventario para consultar existencias y movimientos. Los listados se cargan por páginas para mantener la aplicación ágil.'],
  ['Ventas y cuentas por cobrar', 'Cada venta descuenta existencias de forma segura. Para ventas a crédito, revisa después el módulo Cuentas por cobrar.'],
  ['Usuarios y permisos', 'Invita a tu equipo desde Usuarios y roles y asigna solo los permisos que cada persona necesita.'],
  ['Soporte', 'Si algo no carga, usa el botón Reintentar de la pantalla o vuelve al Resumen. Para incidentes de cuenta, contacta al administrador de tu empresa.'],
];

function HelpContent() {
  const router = useRouter();
  const { tenant, loading } = useTenant();
  if (loading) return <div className="workspace-loading" role="status">Cargando centro de ayuda...</div>;
  return <main className="workspace-page"><WorkspaceSidebar /><section className="workspace-main help-main"><button className="text-link" onClick={() => router.push('/workspace')}>← Resumen</button><header className="help-header"><div><div className="eyebrow">Centro de ayuda</div><h1>Aprende a operar {tenant?.name || 'tu empresa'}.</h1><p>Guía breve para resolver las tareas más importantes sin salir de tu espacio.</p></div><div className="help-badge" aria-hidden="true">?</div></header><div className="help-grid">{articles.map(([title, description], index) => <article className="help-card" key={title}><span className="help-card-number">0{index + 1}</span><h2>{title}</h2><p>{description}</p></article>)}</div><div className="help-footer"><strong>¿Necesitas volver a empezar?</strong><span>El onboarding siempre estará disponible desde el Resumen mientras tu empresa no esté completa.</span><button className="button" onClick={() => router.push('/workspace')}>Volver al resumen ↗</button></div></section></main>;
}

export default function HelpPage() { return <TenantProvider><HelpContent /></TenantProvider>; }

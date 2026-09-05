'use client';

import { useRouter } from 'next/navigation';

export default function CatalogPage() {
  const router = useRouter();
  return <main className="workspace-page"><section className="workspace-main"><button className="text-link" onClick={() => router.push('/workspace')}>← Volver al resumen</button><div className="workspace-section-heading"><div><div className="eyebrow">Catálogo</div><h2>Agrega tus primeros productos</h2></div></div><div className="workspace-empty"><div className="empty-spark">◇</div><h3>Tu catálogo está vacío</h3><p>Esta sección está lista para conectarse al catálogo aislado de tu empresa. No se cargaron productos de prueba ni datos de otra empresa.</p><button className="button" onClick={() => router.push('/workspace')}>Volver al espacio</button></div></section></main>;
}

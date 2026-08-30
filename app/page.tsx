'use client';
import { useState } from 'react';
import ProductosAdmin from '@/components/ProductosAdmin';
import ComprasAdmin from '@/components/ComprasAdmin';
import VentasAdmin from '@/components/VentasAdmin';
import CajaAdmin from '@/components/CajaAdmin';
import BodegaHome from '@/components/BodegaHome';

export default function TiendaSS() {
  const [vistaActiva, setVistaActiva] = useState<'home' | 'productos' | 'compras' | 'ventas' | 'caja'>('home');
  const [productos, setProductos] = useState<any[]>([]); // O tu estado global / de datos

  return (
    <main style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
      
      {/* Barra de navegación superior o de pestañas */}
      <nav style={{ display: 'flex', gap: 10, padding: 15, background: '#111827', borderBottom: '1px solid #1f2937' }}>
        <button onClick={() => setVistaActiva('home')} style={{ background: vistaActiva === 'home' ? '#3b82f6' : 'transparent', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Inicio / Bodega</button>
        <button onClick={() => setVistaActiva('productos')} style={{ background: vistaActiva === 'productos' ? '#3b82f6' : 'transparent', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Productos</button>
        <button onClick={() => setVistaActiva('compras')} style={{ background: vistaActiva === 'compras' ? '#3b82f6' : 'transparent', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Compras</button>
        <button onClick={() => setVistaActiva('ventas')} style={{ background: vistaActiva === 'ventas' ? '#3b82f6' : 'transparent', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Ventas</button>
        <button onClick={() => setVistaActiva('caja')} style={{ background: vistaActiva === 'caja' ? '#3b82f6' : 'transparent', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>Caja</button>
      </nav>

      {/* Renderizado condicional limpio (Enrutador de vistas) */}
      <div style={{ flex: 1 }}>
        {vistaActiva === 'home' && <BodegaHome filtrados={productos} />}
        {vistaActiva === 'productos' && <ProductosAdmin />}
        {vistaActiva === 'compras' && <ComprasAdmin />}
        {vistaActiva === 'ventas' && <VentasAdmin />}
        {vistaActiva === 'caja' && <CajaAdmin />}
      </div>

    </main>
  );
}

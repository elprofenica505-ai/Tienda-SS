'use client';

import React from 'react';
import type { Entrega, Vista, Permisos } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  entregas: Entrega[];
  setEntregas: (e: Entrega[]) => void;
  historial: Vista[];
  onCerrar: () => void;
  permisos: Permisos;
  irA: (v: Vista) => void;
}

export default function ChoferHome({ user, entregas, setEntregas, onCerrar, permisos, irA }: Props) {
  const mis = entregas.filter(e => e.choferId === user.id || true);

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: '#facc15', margin: 0 }}>🚚 Mis entregas</h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Salir
          </button>
        </div>

        {permisos.choferRegistrarCompras ? (
          <button
            onClick={() => irA('bodega_compra')}
            style={{ background: '#052e2b', border: '1px solid #0d9488', borderRadius: 12, padding: 14, color: '#5eead4', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            🛒 Registrar compra a proveedor
          </button>
        ) : (
          <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 12, color: '#6b7280', fontSize: 12 }}>
            Compras a proveedores deshabilitadas. El jefe debe activarlas en Permisos.
          </div>
        )}

        {mis.map(e => (
          <div key={e.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <p style={{ fontWeight: 700, margin: 0 }}>{e.cliente}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>{e.direccion}</p>
                <p style={{ fontSize: 12, margin: 0 }}>{e.productos}</p>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, height: 'fit-content',
                background: e.estado === 'Pendiente' ? 'rgba(245,158,11,0.15)' : e.estado === 'En Ruta' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                color: e.estado === 'Pendiente' ? '#fbbf24' : e.estado === 'En Ruta' ? '#60a5fa' : '#34d399'
              }}>{e.estado}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEntregas(entregas.map(x => x.id === e.id ? { ...x, estado: 'En Ruta' } : x))}
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>En Ruta</button>
              <button onClick={() => setEntregas(entregas.map(x => x.id === e.id ? { ...x, estado: 'Entregado' } : x))}
                style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Entregado</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

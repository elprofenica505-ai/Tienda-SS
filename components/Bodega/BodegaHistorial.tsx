'use client';

import React from 'react';
import type { Compra } from '@/components/shared/types';

interface Props {
  compras: Compra[];
  volver: () => void;
  onCerrar: () => void;
}

export default function BodegaHistorial({ compras, volver, onCerrar }: Props) {
  const comprasOrdenadas = compras.slice().sort((a, b) => {
    const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha || 0);
    const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha || 0);
    return fb.getTime() - fa.getTime();
  });

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={volver} style={{ background: '#1f2937', color: '#fff', border: 'none', width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>←</button>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: '#a5b4fc', margin: 0 }}>📋 Historial de compras</h1>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salir</button>
        </div>
        {comprasOrdenadas.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>Aún no hay compras registradas</p>
        ) : comprasOrdenadas.map(c => (
          <div key={c.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{c.proveedor}</span>
              <span style={{ fontWeight: 800, color: '#34d399' }}>${(c.total || 0).toLocaleString()}</span>
            </div>
            {(c.items || []).map((it, i) => (
              <p key={i} style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>
                {it.nombre} x{it.cantidad} · ${it.costoUnitario}/u
              </p>
            ))}
            <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 0' }}>Registrado por: {c.creadoPor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import React from 'react';

interface BodegaHomeProps {
  filtrados: any[];
}

export default function BodegaHome({ filtrados }: BodegaHomeProps) {
  return (
    <div style={{ padding: 20, color: '#fff' }}>
      <h2>Resumen de Bodega</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
        {filtrados.map(p => (
          <div key={p.id} style={{ background: '#111827', border: `1px solid ${p.stock <= p.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700, margin: 0, fontSize: 13 }}>{p.nombre}</p>
              <p style={{ fontSize: 12, color: '#34d399', margin: '2px 0 0' }}>Stock: {p.stock} (Mín: {p.stockMinimo})</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

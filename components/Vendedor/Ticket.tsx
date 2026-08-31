'use client';

import React from 'react';
import type { Venta } from '@/components/shared/types';

interface Props {
  venta: Venta;
  onNuevaVenta: () => void;
}

export default function Ticket({ venta, onNuevaVenta }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 16, fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#fff', color: '#111', borderRadius: 16, padding: 20 }}>
          <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, margin: '0 0 4px' }}>Tienda-SS</p>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#666', margin: '0 0 14px' }}>Comprobante de venta</p>
          <p style={{ fontSize: 12, margin: '0 0 4px' }}>Vendedor: <b>{venta.vendedorNombre}</b></p>
          <p style={{ fontSize: 12, margin: '0 0 12px' }}>Pago: <b>{venta.medioPago}</b></p>
          <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '10px 0', marginBottom: 10 }}>
            {(venta.items || []).map((it: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>{it.nombre} x{it.cantidad}</span>
                <span>${it.subtotal}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
            <span>TOTAL</span>
            <span>${venta.total}</span>
          </div>
          {venta.medioPago === 'Efectivo' && (
            <>
              <p style={{ fontSize: 12, margin: '8px 0 0' }}>Recibido: ${venta.recibido}</p>
              <p style={{ fontSize: 12, margin: 0 }}>Vuelto: ${venta.vuelto}</p>
            </>
          )}
          <p style={{ textAlign: 'center', fontSize: 10, color: '#999', marginTop: 16 }}>¡Gracias por su compra!</p>
        </div>
        <button onClick={onNuevaVenta}
          style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
          Nueva venta
        </button>
      </div>
    </div>
  );
}

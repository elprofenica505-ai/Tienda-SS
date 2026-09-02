'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Producto, CarritoItem, Venta, Turno, Vista } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  productos: Producto[];
  setProductos: (p: Producto[]) => void;
  ventas: Venta[];
  setVentas: (v: Venta[]) => void;
  turnos: Turno[];
  carrito: CarritoItem[];
  setCarrito: (c: CarritoItem[]) => void;
  ultimaVenta: Venta | null;
  setUltimaVenta: (v: Venta | null) => void;
  irA: (v: Vista) => void;
  onCerrar: () => void;
  onCerrarCaja: () => void;
}

export default function VendedorHome({
  user, productos, setProductos,
  carrito, setCarrito, onCerrar
}: Props) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );

  const agregarCarrito = (p: Producto) => {
    if (p.stock <= 0) { alert('Sin stock'); return; }
    const ex = carrito.find(c => c.id === p.id);
    if (ex) {
      if (ex.cantidad >= p.stock) { alert('Stock máximo'); return; }
      setCarrito(carrito.map(c => c.id === p.id ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else setCarrito([...carrito, { ...p, cantidad: 1 }]);
  };

  const cantCarrito = (id: string, d: number) => {
    const base = productos.find(p => p.id === id);
    setCarrito(carrito.map(c => {
      if (c.id !== id) return c;
      const n = c.cantidad + d;
      if (n <= 0) return null as any;
      if (base && n > base.stock) { alert('Stock máximo'); return c; }
      return { ...c, cantidad: n };
    }).filter(Boolean));
  };

  const totalCarrito = carrito.reduce((s, c) => s + c.precio * c.cantidad, 0);

  const crearPreventa = async () => {
    if (!user || carrito.length === 0) return;
    try {
      const dataOrden = {
        items: carrito.map(c => ({
          id: c.id, codigo: c.codigo, nombre: c.nombre,
          cantidad: c.cantidad, precio: c.precio, subtotal: c.precio * c.cantidad
        })),
        total: totalCarrito,
        fecha: serverTimestamp(),
        estado: 'pending', // La orden queda en espera para que la cobre el cajero
        vendedorId: user.id,
        vendedorNombre: user.nombre,
        turnoId: null,
      };

      // Guardamos en la colección 'orders' para que la caja la procese
      const docRef = await addDoc(collection(db, 'orders'), dataOrden);

      // Limpiamos el carrito del vendedor
      setCarrito([]);
      alert(`¡Preventa creada con éxito! Código de orden: ${docRef.id}`);

    } catch (e) {
      console.error(e);
      alert('Error al crear la preventa');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🧾 Punto de venta (Preventa)</h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Salir
            </button>
          </div>
        </div>

        <input
          placeholder="🔍 Buscar producto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, outline: 'none' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
          {filtrados.map(p => (
            <button key={p.id} onClick={() => agregarCarrito(p)} disabled={p.stock <= 0}
              style={{
                background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 10,
                textAlign: 'left', cursor: p.stock > 0 ? 'pointer' : 'not-allowed', opacity: p.stock > 0 ? 1 : 0.5
              }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: '#fff' }}>{p.nombre}</p>
              <p style={{ fontSize: 12, color: '#34d399', margin: '4px 0 0' }}>${p.precio} · Stock {p.stock}</p>
            </button>
          ))}
        </div>

        {/* Carrito */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
          <p style={{ fontWeight: 700, margin: '0 0 10px', fontSize: 13 }}>Carrito ({carrito.length})</p>
          {carrito.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Vacío</p>
          ) : (
            carrito.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{c.nombre}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>${c.precio} x {c.cantidad}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => cantCarrito(c.id, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#374151', color: '#fff', cursor: 'pointer' }}>−</button>
                  <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{c.cantidad}</span>
                  <button onClick={() => cantCarrito(c.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#374151', color: '#fff', cursor: 'pointer' }}>+</button>
                </div>
              </div>
            ))
          )}
          {carrito.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-name', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                <span>Total Preventa</span>
                <span style={{ color: '#34d399' }}>${totalCarrito.toLocaleString()}</span>
              </div>

              <button onClick={crearPreventa}
                style={{ width: '100%', marginTop: 16, background: '#059669', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                Generar Preventa para Caja (${totalCarrito.toLocaleString()})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

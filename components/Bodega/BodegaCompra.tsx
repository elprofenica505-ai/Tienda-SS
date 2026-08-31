'use client';

import React, { useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Producto, Compra, CompraItem } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  productos: Producto[];
  setProductos: (p: Producto[]) => void;
  compras: Compra[];
  setCompras: (c: Compra[]) => void;
  volver: () => void;
  onCerrar: () => void;
}

export default function BodegaCompra({ user, productos, setProductos, compras, setCompras, volver, onCerrar }: Props) {
  const [proveedorInput, setProveedorInput] = useState('');
  const [compraItems, setCompraItems] = useState<CompraItem[]>([]);
  const [prodSeleccionadoId, setProdSeleccionadoId] = useState('');
  const [cantCompraInput, setCantCompraInput] = useState('');
  const [costoCompraInput, setCostoCompraInput] = useState('');

  const totalCompra = compraItems.reduce((s, it) => s + it.subtotal, 0);

  const agregarItemCompra = () => {
    const p = productos.find(x => x.id === prodSeleccionadoId);
    if (!p || !cantCompraInput || !costoCompraInput) {
      alert('Selecciona producto, cantidad y costo');
      return;
    }
    const cant = parseInt(cantCompraInput) || 0;
    const costo = parseFloat(costoCompraInput) || 0;
    setCompraItems([...compraItems, {
      productoId: p.id,
      nombre: p.nombre,
      cantidad: cant,
      costoUnitario: costo,
      subtotal: cant * costo,
    }]);
    setProdSeleccionadoId('');
    setCantCompraInput('');
    setCostoCompraInput('');
  };

  const quitarItemCompra = (idx: number) => {
    setCompraItems(compraItems.filter((_, i) => i !== idx));
  };

  const registrarCompra = async () => {
    if (!proveedorInput || compraItems.length === 0) {
      alert('Ingresa proveedor y al menos un producto');
      return;
    }
    try {
      const data = {
        proveedor: proveedorInput,
        fecha: serverTimestamp(),
        items: compraItems,
        total: totalCompra,
        creadoPor: user.nombre,
      };
      const ref = await addDoc(collection(db, 'compras'), data);
      setCompras([...compras, { id: ref.id, ...data, fecha: new Date() } as Compra]);

      for (const it of compraItems) {
        const p = productos.find(x => x.id === it.productoId);
        if (p) {
          const nuevoStock = p.stock + it.cantidad;
          await updateDoc(doc(db, 'productos', it.productoId), {
            stock: nuevoStock,
            costo: it.costoUnitario,
          });
          setProductos(productos.map(x => x.id === it.productoId ? { ...x, stock: nuevoStock, costo: it.costoUnitario } : x));
        }
      }

      setProveedorInput('');
      setCompraItems([]);
      alert('Compra registrada y stock actualizado');
      volver();
    } catch (e) {
      console.error(e);
      alert('Error al registrar compra');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={volver} style={{ background: '#1f2937', color: '#fff', border: 'none', width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>←</button>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: '#5eead4', margin: 0 }}>🚚 Nueva compra</h1>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salir</button>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Proveedor</p>
          <input placeholder="Nombre del proveedor" value={proveedorInput} onChange={e => setProveedorInput(e.target.value)}
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>Agregar producto a la compra</p>
          <select value={prodSeleccionadoId} onChange={e => setProdSeleccionadoId(e.target.value)}
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}>
            <option value="">Selecciona un producto...</option>
            {productos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre} (stock actual: {p.stock})</option>
            ))}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="number" placeholder="Cantidad comprada" value={cantCompraInput} onChange={e => setCantCompraInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
            <input type="number" placeholder="Costo unitario" value={costoCompraInput} onChange={e => setCostoCompraInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
          </div>
          <button onClick={agregarItemCompra} style={{ background: '#0d9488', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
            Agregar a la compra
          </button>
        </div>

        {compraItems.length > 0 && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>Productos en esta compra</p>
            {compraItems.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                <span>{it.nombre} x{it.cantidad} (${it.costoUnitario} c/u)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#34d399', fontWeight: 700 }}>${it.subtotal.toFixed(0)}</span>
                  <button onClick={() => quitarItemCompra(idx)} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>Total compra</span><span>${totalCompra.toFixed(0)}</span>
            </div>
            <button onClick={registrarCompra} style={{ width: '100%', marginTop: 10, background: '#10b981', color: '#030712', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              ✅ Registrar compra y actualizar stock/costo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

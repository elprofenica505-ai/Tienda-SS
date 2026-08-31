'use client';

import React, { useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Producto, Vista } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  productos: Producto[];
  setProductos: (p: Producto[]) => void;
  irA: (v: Vista) => void;
  volver: () => void;
  historial: Vista[];
  onCerrar: () => void;
}

export default function BodegaHome({ user, productos, setProductos, irA, volver, historial, onCerrar }: Props) {
  const [nombreProd, setNombreProd] = useState('');
  const [stockIni, setStockIni] = useState('');
  const [precioProd, setPrecioProd] = useState('');
  const [stockMin, setStockMin] = useState('5');
  const [busquedaBod, setBusquedaBod] = useState('');
  const [ajusteId, setAjusteId] = useState<string | null>(null);
  const [ajusteCant, setAjusteCant] = useState('');
  const [ajusteTipo, setAjusteTipo] = useState<'entrada' | 'salida' | 'merma'>('entrada');

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busquedaBod.toLowerCase())
  );

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProd || !stockIni) return;
    try {
      const data = {
        nombre: nombreProd,
        codigo: Math.floor(10000000 + Math.random() * 90000000).toString(),
        stock: parseInt(stockIni) || 0,
        stockMinimo: parseInt(stockMin) || 5,
        precio: parseFloat(precioProd) || 0,
        costo: 0,
        imagen: '',
        categoria: 'Otros',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'productos'), data);
      setProductos([...productos, { id: ref.id, ...data } as Producto]);
      setNombreProd('');
      setStockIni('');
      setPrecioProd('');
      setStockMin('5');
      alert('Producto agregado');
    } catch (e) {
      console.error(e);
      alert('Error al guardar');
    }
  };

  const aplicarAjuste = async () => {
    if (!ajusteId || !ajusteCant) return;
    const p = productos.find(x => x.id === ajusteId);
    if (!p) return;
    const cant = parseInt(ajusteCant) || 0;
    let nuevoStock = p.stock;
    if (ajusteTipo === 'entrada') nuevoStock += cant;
    else nuevoStock = Math.max(0, nuevoStock - cant);

    try {
      await updateDoc(doc(db, 'productos', ajusteId), { stock: nuevoStock });
      setProductos(productos.map(x => x.id === ajusteId ? { ...x, stock: nuevoStock } : x));
      setAjusteId(null);
      setAjusteCant('');
    } catch (e) {
      console.error(e);
      alert('Error al ajustar');
    }
  };

  const btnVolver = historial.length > 0 ? (
    <button onClick={volver} style={{ background: '#1f2937', color: '#fff', border: 'none', width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>←</button>
  ) : null;

  const btnCerrar = (
    <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
      Salir
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {btnVolver}
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📦 Bodega</h1>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
            </div>
          </div>
          {btnCerrar}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => irA('bodega_compra')} style={{ background: '#052e2b', border: '1px solid #0d9488', borderRadius: 12, padding: 14, color: '#5eead4', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            🚚 Nueva compra
          </button>
          <button onClick={() => irA('bodega_historial_compras')} style={{ background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: 12, padding: 14, color: '#a5b4fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            📋 Historial compras
          </button>
        </div>

        <form onSubmit={guardarProducto} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Nuevo producto</p>
          <input placeholder="Nombre *" value={nombreProd} onChange={e => setNombreProd(e.target.value)} required
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <input type="number" placeholder="Stock *" value={stockIni} onChange={e => setStockIni(e.target.value)} required
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
            <input type="number" placeholder="Mín" value={stockMin} onChange={e => setStockMin(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
            <input type="number" placeholder="Precio" value={precioProd} onChange={e => setPrecioProd(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
          </div>
          <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Agregar</button>
        </form>

        <input placeholder="🔍 Buscar..." value={busquedaBod} onChange={e => setBusquedaBod(e.target.value)}
          style={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />

        {filtrados.map(p => (
          <div key={p.id} style={{ background: '#111827', border: `1px solid ${p.stock <= p.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: 700, margin: 0 }}>{p.nombre}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Venta ${p.precio} · Costo ${p.costo.toFixed(2)} · Mín {p.stockMinimo}</p>
              </div>
              <span style={{ fontWeight: 800, color: p.stock <= p.stockMinimo ? '#f87171' : '#34d399' }}>{p.stock}</span>
            </div>
            <button onClick={() => { setAjusteId(p.id); setAjusteCant(''); }}
              style={{ marginTop: 8, width: '100%', background: '#064e3b', color: '#6ee7b7', border: 'none', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Ajustar stock
            </button>
            {ajusteId === p.id && (
              <div style={{ marginTop: 8, padding: 10, background: '#030712', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['entrada', 'salida', 'merma'] as const).map(t => (
                    <button key={t} onClick={() => setAjusteTipo(t)}
                      style={{ flex: 1, padding: 6, borderRadius: 6, border: 'none', fontSize: 11, cursor: 'pointer', background: ajusteTipo === t ? '#4f46e5' : '#1f2937', color: '#fff' }}>
                      {t === 'entrada' ? 'Entrada' : t === 'salida' ? 'Salida' : 'Merma'}
                    </button>
                  ))}
                </div>
                <input type="number" placeholder="Cantidad" value={ajusteCant} onChange={e => setAjusteCant(e.target.value)}
                  style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 8, color: '#fff', fontSize: 13, outline: 'none' }} />
                <button onClick={aplicarAjuste} style={{ background: '#059669', color: '#fff', border: 'none', padding: 8, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

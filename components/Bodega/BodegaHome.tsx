'use client';

import React, { useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Producto, Permisos } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';
import { PERMISOS_DEFAULT } from '@/components/shared/types';

interface Props {
  user: Usuario;
  productos: Producto[];
  setProductos: (p: Producto[]) => void;
  permisos?: Permisos;
  irA: (vista: string) => void;
  onCerrar: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: '#030712',
  border: '1px solid #374151',
  borderRadius: 10,
  padding: '11px 12px',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  minWidth: 0,
};

const cardStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #1f2937',
  borderRadius: 16,
  padding: 14,
  width: '100%',
  boxSizing: 'border-box',
};

export default function BodegaHome({
  user,
  productos,
  setProductos,
  permisos = PERMISOS_DEFAULT,
  irA,
  onCerrar,
}: Props) {
  const [nombre, setNombre] = useState('');
  const [stock, setStock] = useState('');
  const [stockMinimo, setStockMinimo] = useState('5');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [ajustandoId, setAjustandoId] = useState<string | null>(null);
  const [nuevoStock, setNuevoStock] = useState('');
  const [guardando, setGuardando] = useState(false);

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const crearProducto = async () => {
    if (!permisos.bodegaCrearProductos) {
      alert('El jefe desactivó crear productos');
      return;
    }
    if (!nombre.trim() || !stock) {
      alert('Nombre y stock son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      const data = {
        nombre: nombre.trim(),
        codigo: Math.floor(10000000 + Math.random() * 90000000).toString(),
        stock: parseInt(stock) || 0,
        stockMinimo: parseInt(stockMinimo) || 5,
        precio: parseFloat(precio) || 0,
        costo: parseFloat(costo) || 0,
        imagen: '',
        categoria: 'Otros',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'productos'), data);
      setProductos([...productos, { id: ref.id, ...data } as Producto]);
      setNombre('');
      setStock('');
      setStockMinimo('5');
      setPrecio('');
      setCosto('');
      alert('Producto agregado');
    } catch (e) {
      console.error(e);
      alert('No se pudo crear el producto');
    } finally {
      setGuardando(false);
    }
  };

  const guardarAjuste = async (id: string) => {
    if (!permisos.bodegaAjustarStock) {
      alert('El jefe desactivó ajustar stock');
      return;
    }
    const valor = parseInt(nuevoStock);
    if (isNaN(valor) || valor < 0) {
      alert('Stock inválido');
      return;
    }
    try {
      await updateDoc(doc(db, 'productos', id), { stock: valor });
      setProductos(productos.map(p => (p.id === id ? { ...p, stock: valor } : p)));
      setAjustandoId(null);
      setNuevoStock('');
    } catch (e) {
      console.error(e);
      alert('No se pudo actualizar el stock');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, width: '100%', boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 16 }}>📦 Bodega</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{user.nombre}</p>
          </div>
          <button type="button" onClick={onCerrar}
            style={{ flexShrink: 0, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Salir
          </button>
        </div>

        {/* Acciones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {permisos.bodegaRegistrarCompras && (
            <button type="button" onClick={() => irA('bodega_compra')}
              style={{ background: '#0f766e', color: '#fff', border: 'none', padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🚚 Nueva compra
            </button>
          )}
          <button type="button" onClick={() => irA('bodega_historial')}
            style={{
              background: '#4c1d95', color: '#fff', border: 'none', padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              gridColumn: permisos.bodegaRegistrarCompras ? undefined : '1 / -1',
            }}>
            📋 Historial compras
          </button>
        </div>

        {/* Nuevo producto */}
        {permisos.bodegaCrearProductos ? (
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#818cf8' }}>+ Nuevo producto</p>

            <input placeholder="Nombre *" value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} />

            {/* 2 columnas: no se salen en el celular */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Stock *" value={stock} onChange={e => setStock(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Mínimo" value={stockMinimo} onChange={e => setStockMinimo(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Precio venta" value={precio} onChange={e => setPrecio(e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Costo" value={costo} onChange={e => setCosto(e.target.value)} style={inputStyle} />
            </div>

            <button type="button" onClick={crearProducto} disabled={guardando}
              style={{
                background: '#4f46e5', color: '#fff', border: 'none', padding: 12, borderRadius: 12,
                fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer', width: '100%', opacity: guardando ? 0.7 : 1,
              }}>
              {guardando ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        ) : (
          <div style={{ ...cardStyle, color: '#9ca3af', fontSize: 13 }}>
            Crear productos deshabilitado. El jefe debe activarlo en Permisos.
          </div>
        )}

        {/* Buscar */}
        <input
          placeholder="🔍 Buscar…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={inputStyle}
        />

        {/* Lista */}
        {filtrados.map(p => (
          <div key={p.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, wordBreak: 'break-word' }}>{p.nombre}</p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>
                  Venta ${p.precio} · Costo ${p.costo} · Mín {p.stockMinimo}
                </p>
              </div>
              <span style={{
                flexShrink: 0, fontWeight: 800, fontSize: 16,
                color: p.stock <= p.stockMinimo ? '#f87171' : '#34d399',
              }}>
                {p.stock}
              </span>
            </div>

            {permisos.bodegaAjustarStock && (
              ajustandoId === p.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    placeholder="Nuevo stock"
                    value={nuevoStock}
                    onChange={e => setNuevoStock(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => guardarAjuste(p.id)}
                    style={{ flexShrink: 0, background: '#10b981', color: '#030712', border: 'none', padding: '10px 12px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                    OK
                  </button>
                  <button type="button" onClick={() => { setAjustandoId(null); setNuevoStock(''); }}
                    style={{ flexShrink: 0, background: '#374151', color: '#fff', border: 'none', padding: '10px 12px', borderRadius: 10, cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => { setAjustandoId(p.id); setNuevoStock(String(p.stock)); }}
                  style={{ background: '#065f46', color: '#6ee7b7', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
                  Ajustar stock
                </button>
              )
            )}
          </div>
        ))}

        {filtrados.length === 0 && (
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13 }}>No hay productos</p>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, query, where, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Orden, UsuarioSistema } from '@/components/shared/types';

interface Props {
  user: UsuarioSistema;
  onCerrar: () => void;
}

export default function CajeroHome({ user, onCerrar }: Props) {
  const [ordenesPendientes, setOrdenesPendientes] = useState<Orden[]>([]);
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<Orden | null>(null);
  const [ultimaOrdenCobrada, setUltimaOrdenCobrada] = useState<Orden | null>(null);

  // Cargar órdenes pendientes desde Firestore
  const cargarPendientes = async () => {
    setCargando(true);
    try {
      const q = query(collection(db, 'orders'), where('estado', '==', 'pending'));
      const querySnapshot = await getDocs(q);
      const lista: Orden[] = [];
      querySnapshot.forEach((d) => {
        lista.push({ id: d.id, ...d.data() } as Orden);
      });
      setOrdenesPendientes(lista);
    } catch (e) {
      console.error(e);
      alert('Error al cargar preventas');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPendientes();
  }, []);

  // Manejo optimizado para escáner láser y búsqueda manual insensible a espacios y saltos de línea
  const handleBusquedaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    // Limpiamos saltos de línea accidentales que manda el escáner láser
    const valorLimpio = valor.replace(/[\n\r]+/g, '').trim();
    setCodigoBusqueda(valorLimpio);

    if (!valorLimpio) return;

    // Búsqueda flexible por coincidencia exacta de ID o parcial si escanean código de barras completo
    const encontrada = ordenesPendientes.find(
      o => o.id?.toLowerCase() === valorLimpio.toLowerCase() ||
           o.id?.toLowerCase().includes(valorLimpio.toLowerCase())
    );

    if (encontrada) {
      setOrdenSeleccionada(encontrada);
      setCodigoBusqueda(''); 
    }
  };

  // Procesar cobro, descuento de inventario en Firebase e impresión limpia
  const cobrarOrden = async (orden: Orden) => {
    if (!orden.id) return;
    try {
      // 1. Cambiar estado de orden a completado
      const ordenRef = doc(db, 'orders', orden.id);
      await updateDoc(ordenRef, {
        estado: 'completed',
        cashierId: user.id,
        completedAt: serverTimestamp(),
      });

      // 2. Descontar stock oficialmente en Firebase
      for (const item of orden.items || []) {
        if (!item.id) continue;
        const prodRef = doc(db, 'productos', item.id);
        const prodSnap = await getDoc(prodRef);
        
        if (prodSnap.exists()) {
          const stockActual = prodSnap.data().stock || 0;
          const cantidadComprada = item.cantidad || 1;
          const nuevoStock = Math.max(0, stockActual - cantidadComprada);

          await updateDoc(prodRef, {
            stock: nuevoStock
          });
        }
      }

      // 3. Establecer la orden para el recibo térmico y lanzar impresión
      setUltimaOrdenCobrada(orden);
      setTimeout(() => {
        window.print();
      }, 300);

      // 4. Actualizar lista local de pendientes
      setOrdenesPendientes(prev => prev.filter(o => o.id !== orden.id));
      if (ordenSeleccionada?.id === orden.id) {
        setOrdenSeleccionada(null);
      }
    } catch (e) {
      console.error(e);
      alert('Error al procesar el pago y descontar inventario');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      
      {/* ESTILOS CSS PARA AISLAR LA IMPRESIÓN TÉRMICA Y OCULTAR LA INTERFAZ OSCURA */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #ticket-impresion, #ticket-impresion * {
            visibility: visible !important;
          }
          #ticket-impresion {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 10px;
            font-family: monospace;
          }
        }
      `}</style>

      {/* TICKET OCULTO PARA IMPRESIÓN TÉRMICA */}
      {ultimaOrdenCobrada && (
        <div id="ticket-impresion" style={{ display: 'none' }}>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>TIENDA SS</h2>
            <p style={{ fontSize: 11, margin: '2px 0' }}>Comprobante de Caja</p>
            <p style={{ fontSize: 10, margin: '2px 0' }}>Orden: {ultimaOrdenCobrada.id}</p>
            <p style={{ fontSize: 10, margin: '2px 0' }}>Cajero: {user.nombre || user.email}</p>
            <p style={{ fontSize: 10, margin: '2px 0' }}>Fecha: {new Date().toLocaleString()}</p>
          </div>
          <hr style={{ border: 'dashed 1px #000', margin: '8px 0' }} />
          <div style={{ fontSize: 11 }}>
            {ultimaOrdenCobrada.items?.map((item: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{item.cantidad}x {item.nombre}</span>
                <span>${(item.precio * item.cantidad)?.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <hr style={{ border: 'dashed 1px #000', margin: '8px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 'bold' }}>
            <span>TOTAL:</span>
            <span>${ultimaOrdenCobrada.total?.toLocaleString()}</span>
          </div>
          <p style={{ textAlign: 'center', fontSize: 10, marginTop: 15 }}>¡Gracias por su compra!</p>
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        {/* Cabecera del Cajero */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>💻 Panel de Caja</h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Cajero: {user.nombre || user.email}</p>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Salir
          </button>
        </div>

        {/* Barra de escáner láser optimizada */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="🔍 Escanear código o ID de orden con láser..."
            value={codigoBusqueda}
            onChange={handleBusquedaChange}
            autoFocus
            style={{ flex: 1, background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, outline: 'none' }}
          />
          <button onClick={cargarPendientes} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '0 16px', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            {cargando ? '...' : 'Actualizar'}
          </button>
        </div>

        {/* Detalle de Preventa Seleccionada */}
        {ordenSeleccionada && (
          <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontWeight: 800, margin: 0, color: '#c7d2fe', fontSize: 13 }}>⚡ Preventa Seleccionada</p>
              <button 
                onClick={() => setOrdenSeleccionada(null)}
                style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>
                ✕ Cerrar detalle
              </button>
            </div>
            <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 4px', color: '#a5b4fc' }}>Orden ID: {ordenSeleccionada.id}</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 8px' }}>Vendedor: {ordenSeleccionada.vendedorNombre}</p>
            
            <div style={{ background: '#111827', borderRadius: 8, padding: 8, marginBottom: 10, maxHeight: 120, overflowY: 'auto' }}>
              {ordenSeleccionada.items?.map((item: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#e5e7eb' }}>
                  <span>{item.cantidad}x {item.nombre}</span>
                  <span>${(item.precio * item.cantidad)?.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#34d399' }}>Total: ${ordenSeleccionada.total?.toLocaleString()}</p>
              <button 
                onClick={() => cobrarOrden(ordenSeleccionada)}
                style={{ background: '#059669', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Cobrar y Abrir Caja
              </button>
            </div>
          </div>
        )}

        {/* Lista de Preventas pendientes */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
          <p style={{ fontWeight: 700, margin: '0 0 10px', fontSize: 13 }}>Preventas en espera ({ordenesPendientes.length})</p>
          
          {ordenesPendientes.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No hay órdenes pendientes por cobrar.</p>
          ) : (
            ordenesPendientes.map(orden => (
              <div 
                key={orden.id} 
                onClick={() => setOrdenSeleccionada(orden)}
                style={{ 
                  background: ordenSeleccionada?.id === orden.id ? '#374151' : '#1f2937', 
                  borderRadius: 10, 
                  padding: 10, 
                  marginBottom: 10, 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  cursor: 'pointer',
                  border: ordenSeleccionada?.id === orden.id ? '1px solid #4f46e5' : '1px solid transparent'
                }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: '#a5b4fc' }}>Orden: {orden.id}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>Vendedor: {orden.vendedorNombre}</p>
                  <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: '#34d399' }}>Total: ${orden.total?.toLocaleString()}</p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    cobrarOrden(orden);
                  }}
                  style={{ background: '#059669', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  Cobrar y Abrir Caja
                </button>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}

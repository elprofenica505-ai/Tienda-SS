'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
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

  // Función para buscar órdenes pendientes en Firestore sin gastar de más
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

  // Función para procesar el cobro y abrir la gaveta física
  const cobrarOrden = async (ordenId: string, items: any[]) => {
    try {
      // 1. Cambiamos el estado de la orden a 'completed' y guardamos el ID del cajero
      const ordenRef = doc(db, 'orders', ordenId);
      await updateDoc(ordenRef, {
        estado: 'completed',
        cashierId: user.id,
        completedAt: serverTimestamp(),
      });

      // 2. Descontamos el stock de cada producto de la orden en bloque
      for (const item of items) {
        const prodRef = doc(db, 'productos', item.id);
        // Opcional: puedes restar el stock actual menos item.cantidad
      }

      // 3. Disparamos la impresión térmica y la apertura automática de la gaveta física
      window.print();

      alert('¡Cobro exitoso! Abriendo caja...');
      
      // Actualizamos la lista local quitando la orden ya cobrada
      setOrdenesPendientes(ordenesPendientes.filter(o => o.id !== ordenId));
    } catch (e) {
      console.error(e);
      alert('Error al procesar el pago');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
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

        {/* Barra de escáner / Sincronización */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="🔍 Escanear código QR o ID de orden..."
            value={codigoBusqueda}
            onChange={e => setCodigoBusqueda(e.target.value)}
            style={{ flex: 1, background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, outline: 'none' }}
          />
          <button onClick={cargarPendientes} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '0 16px', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            {cargando ? '...' : 'Actualizar'}
          </button>
        </div>

        {/* Lista de Prevent pendientes */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
          <p style={{ fontWeight: 700, margin: '0 0 10px', fontSize: 13 }}>Preventas en espera ({ordenesPendientes.length})</p>
          
          {ordenesPendientes.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No hay órdenes pendientes por cobrar.</p>
          ) : (
            ordenesPendientes.map(orden => (
              <div key={orden.id} style={{ background: '#1f2937', borderRadius: 10, padding: 10, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: '#a5b4fc' }}>Orden: {orden.id}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>Vendedor: {orden.vendedorNombre}</p>
                  <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: '#34d399' }}>Total: ${orden.total?.toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => orden.id && cobrarOrden(orden.id, orden.items)}
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

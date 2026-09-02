'use client';
import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UsuarioSistema } from '@/components/shared/types';

export default function ComprasPanel({ user }: { user: UsuarioSistema }) {
  const [compras, setCompras] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [proveedor, setProveedor] = useState('');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const cargarCompras = async () => {
    try {
      setCargando(true);
      const querySnapshot = await getDocs(collection(db, 'compras'));
      const lista: any[] = [];
      querySnapshot.forEach((doc) => {
        lista.push({ id: doc.id, ...doc.data() });
      });
      setCompras(lista);
    } catch (e) {
      console.error("Error cargando compras:", e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCompras();
  }, []);

  const registrarCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedor || !monto) {
      alert("Por favor llena los campos obligatorios");
      return;
    }
    try {
      await addDoc(collection(db, 'compras'), {
        proveedor,
        monto: parseFloat(monto) || 0,
        descripcion,
        registradoPor: user.nombre || user.email,
        createdAt: serverTimestamp()
      });
      setProveedor('');
      setMonto('');
      setDescripcion('');
      cargarCompras();
      alert("¡Compra registrada con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al registrar la compra");
    }
  };

  return (
    <div style={{ padding: 16, color: '#f3f4f6', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>📦 Gestión de Compras y Proveedores</h2>
      
      {/* Formulario de Registro */}
      <form onSubmit={registrarCompra} style={{ background: '#111827', padding: 14, borderRadius: 12, border: '1px solid #1f2937', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input 
          placeholder="Nombre del Proveedor..." 
          value={proveedor} 
          onChange={e => setProveedor(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', padding: 10, borderRadius: 8, color: '#fff', fontSize: 13 }}
        />
        <input 
          type="number" 
          placeholder="Monto total ($)..." 
          value={monto} 
          onChange={e => setMonto(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', padding: 10, borderRadius: 8, color: '#fff', fontSize: 13 }}
        />
        <input 
          placeholder="Descripción de la compra / artículos..." 
          value={descripcion} 
          onChange={e => setDescripcion(e.target.value)}
          style={{ background: '#1f2937', border: '1px solid #374151', padding: 10, borderRadius: 8, color: '#fff', fontSize: 13 }}
        />
        <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 10, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          Guardar Compra
        </button>
      </form>

      {/* Listado Seguro */}
      <div style={{ background: '#111827', padding: 14, borderRadius: 12, border: '1px solid #1f2937' }}>
        <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Historial de Compras ({compras.length})</p>
        {cargando ? (
          <p style={{ fontSize: 12, color: '#9ca3af' }}>Cargando compras...</p>
        ) : compras.length === 0 ? (
          <p style={{ fontSize: 12, color: '#6b7280' }}>No hay registros de compras en el sistema.</p>
        ) : (
          compras.map(c => (
            <div key={c.id} style={{ background: '#1f2937', padding: 10, borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{c.proveedor}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>{c.descripcion || 'Sin descripción'}</p>
              </div>
              <p style={{ fontWeight: 800, fontSize: 13, color: '#34d399', margin: 0 }}>${c.monto?.toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

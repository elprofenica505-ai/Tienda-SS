'use client';

import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Turno, Venta } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  turno: Turno;
  ventas: Venta[];
  turnos: Turno[];
  setTurnos: (t: Turno[]) => void;
  onVolver: () => void;
  onCerrar: () => void;
}

export default function CerrarCaja({ user, turno, ventas, turnos, setTurnos, onVolver, onCerrar }: Props) {
  const [montoContadoInput, setMontoContadoInput] = useState('');

  const ventasEfectivoTurno = ventas
    .filter(v => v.turnoId === turno.id && v.medioPago === 'Efectivo')
    .reduce((s, v) => s + (v.total || 0), 0);

  const totalEsperado = (turno.montoInicial || 0) + ventasEfectivoTurno;

  const cerrarCaja = async () => {
    if (montoContadoInput === '') {
      alert('Ingresa el monto contado en caja');
      return;
    }
    const contado = parseFloat(montoContadoInput) || 0;
    const diferencia = contado - totalEsperado;
    try {
      await updateDoc(doc(db, 'turnos', turno.id), {
        estado: 'cerrado',
        montoContado: contado,
        totalVentasEfectivo: ventasEfectivoTurno,
        totalEsperado,
        diferencia,
        fechaCierre: serverTimestamp(),
      });
      setTurnos(turnos.map(t => t.id === turno.id ? {
        ...t,
        estado: 'cerrado',
        montoContado: contado,
        totalVentasEfectivo: ventasEfectivoTurno,
        totalEsperado,
        diferencia,
        fechaCierre: new Date(),
      } : t));
      alert(`Caja cerrada. Diferencia: $${diferencia.toFixed(2)}`);
      onVolver();
    } catch (e) {
      console.error(e);
      alert('Error al cerrar caja');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Cerrar caja</h1>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
          </div>
          <button onClick={onVolver} style={{ background: '#1f2937', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Volver</button>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 4px' }}>Monto inicial</p>
          <p style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>${turno.montoInicial}</p>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '12px 0 4px' }}>Ventas en efectivo del turno</p>
          <p style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#34d399' }}>${ventasEfectivoTurno.toLocaleString()}</p>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '12px 0 4px' }}>Total esperado en caja</p>
          <p style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#a5b4fc' }}>${totalEsperado.toLocaleString()}</p>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Monto contado físicamente</p>
          <input
            type="number"
            placeholder="0.00"
            value={montoContadoInput}
            onChange={e => setMontoContadoInput(e.target.value)}
            style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 12, padding: 14, color: '#fff', fontSize: 18, fontWeight: 700, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
          />
          <button onClick={cerrarCaja} style={{ width: '100%', marginTop: 12, background: '#dc2626', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Confirmar cierre de caja
          </button>
        </div>
      </div>
    </div>
  );
}

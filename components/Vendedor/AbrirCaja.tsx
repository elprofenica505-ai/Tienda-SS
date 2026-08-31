'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Turno } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  turnos: Turno[];
  setTurnos: (t: Turno[]) => void;
  onCerrar: () => void;
}

export default function AbrirCaja({ user, turnos, setTurnos, onCerrar }: Props) {
  const [montoAperturaInput, setMontoAperturaInput] = useState('');

  const abrirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (montoAperturaInput === '') {
      alert('Ingresa el monto con el que abres caja');
      return;
    }
    try {
      const data = {
        vendedorId: user.id,
        vendedorNombre: user.nombre,
        montoInicial: parseFloat(montoAperturaInput) || 0,
        fechaApertura: serverTimestamp(),
        estado: 'abierto' as const,
      };
      const ref = await addDoc(collection(db, 'turnos'), data);
      setTurnos([...turnos, { id: ref.id, ...data, fechaApertura: new Date() } as Turno]);
      setMontoAperturaInput('');
    } catch (e) {
      console.error(e);
      alert('Error al abrir caja');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 16, fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#111827', border: '1px solid #1f2937', borderRadius: 20, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>💰 Abrir caja</h1>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>{user.nombre}</p>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Salir
          </button>
        </div>
        <form onSubmit={abrirCaja} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Monto inicial en efectivo</p>
          <input
            type="number"
            placeholder="0.00"
            value={montoAperturaInput}
            onChange={e => setMontoAperturaInput(e.target.value)}
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 12, padding: 14, color: '#fff', fontSize: 18, fontWeight: 700, outline: 'none', textAlign: 'center' }}
          />
          <button type="submit" style={{ background: '#059669', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Abrir caja y empezar a vender
          </button>
        </form>
      </div>
    </div>
  );
}

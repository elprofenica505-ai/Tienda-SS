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
  const [pestana, setPestana] = useState<'cobros' | 'abonos'>('cobros');
  const [ordenesPendientes, setOrdenesPendientes] = useState<Orden[]>([]);
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<Orden | null>(null);

  // Estados del Modal de Pago
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [montoEfectivoRecibido, setMontoEfectivoRecibido] = useState<string>('');
  const [ultimaOrdenCobrada, setUltimaOrdenCobrada] = useState<Orden | null>(null);

  // Módulo de Clientes / Créditos y Abonos
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [creditosClientes, setCreditosClientes] = useState<any[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any | null>(null);
  const [montoAbono, setMontoAbono] = useState<string>('');

  // Cargar órdenes pendientes desde Firebase
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

    // Cargar créditos activos de clientes para la libreta de abonos
  const cargarCreditos = async () => {
    try {
      // Cargamos todos los créditos de la colección para evitar bloqueos por filtros de estado
      const q = query(collection(db, 'creditos'));
      const querySnapshot = await getDocs(q);
      const lista: any[] = [];
      querySnapshot.forEach((d) => {
        const data = d.data();
        // Verificamos que tenga saldo pendiente mayor a 0 o que esté activo
        if ((data.saldoPendiente ?? data.montoTotal ?? 0) > 0) {
          lista.path = d.id;
          lista.push({ id: d.id, ...data });
        }
      });
      setCreditosClientes(lista);
    } catch (e) {
      console.error('Error al cargar créditos:', e);
    }
  };

  useEffect(() => {
    cargarPendientes();
    cargarCreditos();
  }, []);

  // Manejo de escáner láser o búsqueda por ID de orden
  const handleBusquedaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/[\n\r]+/g, '').trim();
    setCodigoBusqueda(valor);

    if (!valor) return;

    const encontrada = ordenesPendientes.find(
      o => o.id?.toLowerCase() === valor.toLowerCase() ||
           o.id?.toLowerCase().includes(valor.toLowerCase())
    );

    if (encontrada) {
      setOrdenSeleccionada(encontrada);
      setCodigoBusqueda('');
    }
  };

  // Calcular vuelto
  const totalOrden = ordenSeleccionada?.total || 0;
  const efectivoNum = parseFloat(montoEfectivoRecibido) || 0;
  const vuelto = Math.max(0, efectivoNum - totalOrden);

  // Procesar cobro de preventa e imprimir ticket
  const confirmarCobro = async () => {
    if (!ordenSeleccionada || !ordenSeleccionada.id) return;

    if (metodoPago === 'efectivo' && efectivoNum < totalOrden) {
      alert('El monto en efectivo es menor al total de la preventa.');
      return;
    }

    try {
      const ordenRef = doc(db, 'orders', ordenSeleccionada.id);
      await updateDoc(ordenRef, {
        estado: 'completed',
        cashierId: user.id,
        metodoPago,
        completedAt: serverTimestamp(),
      });

      // Descontar inventario
      for (const item of ordenSeleccionada.items || []) {
        if (!item.id) continue;
        const prodRef = doc(db, 'productos', item.id);
        const prodSnap = await getDoc(prodRef);
        
        if (prodSnap.exists()) {
          const stockActual = prodSnap.data().stock || 0;
          const nuevoStock = Math.max(0, stockActual - (item.cantidad || 1));
          await updateDoc(prodRef, { stock: nuevoStock });
        }
      }

      setUltimaOrdenCobrada(ordenSeleccionada);
      setOrdenesPendientes(prev => prev.filter(o => o.id !== ordenSeleccionada.id));
      setOrdenSeleccionada(null);
      setMontoEfectivoRecibido('');

      setTimeout(() => {
        window.print();
      }, 400);

      alert('¡Cobro procesado con éxito, inventario actualizado y gaveta abierta!');
    } catch (e) {
      console.error(e);
      alert('Error al procesar el cobro');
    }
  };

  // Registrar abono a un crédito de cliente
  const registrarAbono = async () => {
    if (!clienteSeleccionado || !montoAbono) return;
    const abonoNum = parseFloat(montoAbono);
    if (isNaN(abonoNum) || abonoNum <= 0) {
      alert('Ingrese un monto válido para el abono');
      return;
    }

    try {
      const saldoActual = clienteSeleccionado.saldoPendiente ?? clienteSeleccionado.montoTotal ?? 0;
      const nuevoSaldo = Math.max(0, saldoActual - abonoNum);
      const abonoReg = {
        fecha: new Date().toISOString(),
        monto: abonoNum,
        cajero: user.nombre || user.email
      };

      const creditRef = doc(db, 'creditos', clienteSeleccionado.id);
      await updateDoc(creditRef, {
        saldoPendiente: nuevoSaldo,
        abonos: [...(clienteSeleccionado.abonos || []), abonoReg]
      });

      alert(`¡Abono de $${abonoNum} registrado correctamente! Nuevo saldo: $${nuevoSaldo}`);
      setMontoAbono('');
      setClienteSeleccionado(null);
      cargarCreditos();
    } catch (e) {
      console.error(e);
      alert('Error al registrar el abono');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #ticket-impresion, #ticket-impresion * { visibility: visible !important; }
          #ticket-impresion {
            display: block !important;
            position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
            background: #ffffff !important; color: #000000 !important; padding: 15px !important; font-family: monospace !important;
          }
        }
      `}</style>

      {/* TICKET TÉRMICO DE IMPRESIÓN */}
      <div id="ticket-impresion" style={{ display: 'none' }}>
        {ultimaOrdenCobrada && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>TIENDA SS - ELECTROHOGAR</h2>
              <p style={{ fontSize: 11, margin: '2px 0' }}>Comprobante Oficial de Caja</p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>Orden ID: {ultimaOrdenCobrada.id}</p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>Vendedor: {ultimaOrdenCobrada.vendedorNombre}</p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>Cajero: {user.nombre || user.email}</p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>Método: {metodoPago.toUpperCase()}</p>
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
              <span>TOTAL PAGADO:</span>
              <span>${ultimaOrdenCobrada.total?.toLocaleString()}</span>
            </div>
            {metodoPago === 'efectivo' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                  <span>EFECTIVO RECIBIDO:</span>
                  <span>${efectivoNum.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>CAMBIO / VUELTO:</span>
                  <span>${vuelto.toLocaleString()}</span>
                </div>
              </>
            )}
            <p style={{ textAlign: 'center', fontSize: 10, marginTop: 15 }}>¡Gracias por su preferencia en Tienda-SS!</p>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 650, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        {/* Cabecera */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>💻 Módulo Profesional de Caja & POS</h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Cajero: {user.nombre || user.email}</p>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Salir
          </button>
        </div>

        {/* Pestañas de Navegación */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            onClick={() => setPestana('cobros')}
            style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, background: pestana === 'cobros' ? '#4f46e5' : '#111827', color: '#fff', border: '1px solid #374151', cursor: 'pointer' }}>
            ⚡ Cobro de Preventas ({ordenesPendientes.length})
          </button>
          <button 
            onClick={() => setPestana('abonos')}
            style={{ flex: 1, padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, background: pestana === 'abonos' ? '#4f46e5' : '#111827', color: '#fff', border: '1px solid #374151', cursor: 'pointer' }}>
            📒 Libreta de Abonos y Créditos ({creditosClientes.length})
          </button>
        </div>

        {/* PESTAÑA COBROS */}
        {pestana === 'cobros' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="🔍 Escanear código de barras o ID de preventa..."
                value={codigoBusqueda}
                onChange={handleBusquedaChange}
                autoFocus
                style={{ flex: 1, background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, outline: 'none' }}
              />
              <button onClick={cargarPendientes} style={{ background: '#374151', color: '#fff', border: 'none', padding: '0 16px', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
                {cargando ? '...' : 'Actualizar'}
              </button>
            </div>

            {ordenSeleccionada && (
              <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontWeight: 800, margin: 0, color: '#c7d2fe', fontSize: 14 }}>💳 Procesando Pago de Preventa</p>
                  <button onClick={() => setOrdenSeleccionada(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}>✕ Cancelar</button>
                </div>
                
                <p style={{ fontSize: 12, color: '#a5b4fc', margin: '0 0 4px' }}>Orden ID: <b>{ordenSeleccionada.id}</b> | Vendedor: {ordenSeleccionada.vendedorNombre}</p>
                
                <div style={{ background: '#111827', borderRadius: 10, padding: 10, maxHeight: 110, overflowY: 'auto', margin: '10px 0' }}>
                  {ordenSeleccionada.items?.map((item: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#e5e7eb' }}>
                      <span>{item.cantidad}x {item.nombre}</span>
                      <span>${(item.precio * item.cantidad)?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Total a Pagar:</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#34d399' }}>${totalOrden.toLocaleString()}</span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => setMetodoPago('efectivo')} style={{ flex: 1, padding: 10, borderRadius: 8, fontWeight: 700, background: metodoPago === 'efectivo' ? '#059669' : '#111827', color: '#fff', border: '1px solid #374151', cursor: 'pointer' }}>
                    💵 Efectivo
                  </button>
                  <button onClick={() => setMetodoPago('tarjeta')} style={{ flex: 1, padding: 10, borderRadius: 8, fontWeight: 700, background: metodoPago === 'tarjeta' ? '#059669' : '#111827', color: '#fff', border: '1px solid #374151', cursor: 'pointer' }}>
                    💳 Tarjeta (Datáfono)
                  </button>
                </div>

                {metodoPago === 'efectivo' && (
                  <div style={{ background: '#111827', padding: 10, borderRadius: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 12, color: '#9ca3af' }}>Efectivo Recibido del Cliente ($):</label>
                    <input 
                      type="number" 
                      placeholder="Ej: 1000"
                      value={montoEfectivoRecibido}
                      onChange={e => setMontoEfectivoRecibido(e.target.value)}
                      style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 16, fontWeight: 'bold', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                      <span>Vuelto / Cambio:</span>
                      <span>${vuelto.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <button 
                  onClick={confirmarCobro}
                  style={{ width: '100%', background: '#059669', color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                  Cobrar, Abrir Gaveta e Imprimir Recibo
                </button>
              </div>
            )}

            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
              <p style={{ fontWeight: 700, margin: '0 0 10px', fontSize: 13 }}>Preventas en espera de cobro ({ordenesPendientes.length})</p>
              
              {ordenesPendientes.length === 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No hay órdenes pendientes en este momento.</p>
              ) : (
                ordenesPendientes.map(orden => (
                  <div 
                    key={orden.id} 
                    onClick={() => setOrdenSeleccionada(orden)}
                    style={{ 
                      background: ordenSeleccionada?.id === orden.id ? '#374151' : '#1f2937', 
                      borderRadius: 10, padding: 10, marginBottom: 10, 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                      border: ordenSeleccionada?.id === orden.id ? '1px solid #4f46e5' : '1px solid transparent'
                    }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: '#a5b4fc' }}>Orden: {orden.id}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>Vendedor: {orden.vendedorNombre}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, margin: 0, color: '#34d399' }}>Total: ${orden.total?.toLocaleString()}</p>
                    </div>
                    <button style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      Seleccionar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA ABONOS Y CRÉDITOS */}
        {pestana === 'abonos' && (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: 0 }}>📒 Libreta de Abonos y Créditos Aprobados</p>
              <button onClick={cargarCreditos} style={{ background: '#374151', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Sincronizar</button>
            </div>
            
            <input
              placeholder="🔍 Buscar cliente por nombre o cédula..."
              value={busquedaCliente}
              onChange={e => setBusquedaCliente(e.target.value)}
              style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}
            />

            {clienteSeleccionado ? (
              <div style={{ background: '#1e1b4b', border: '1px solid #4338ca', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ fontWeight: 800, color: '#c7d2fe', margin: 0, fontSize: 13 }}>Cliente: {clienteSeleccionado.nombreCliente}</p>
                  <button onClick={() => setClienteSeleccionado(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}>✕ Volver</button>
                </div>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>Cédula: {clienteSeleccionado.cedula || 'N/D'} | Artículo: {clienteSeleccionado.articulo || 'N/D'}</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', margin: '6px 0' }}>Saldo Pendiente: ${((clienteSeleccionado.saldoPendiente ?? clienteSeleccionado.montoTotal) || 0).toLocaleString()}</p>
                
                <div style={{ background: '#111827', borderRadius: 8, padding: 8, margin: '8px 0', maxHeight: 90, overflowY: 'auto' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', margin: '0 0 4px' }}>Historial de abonos:</p>
                  {(!clienteSeleccionado.abonos || clienteSeleccionado.abonos.length === 0) ? (
                    <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>No hay abonos previos registrados.</p>
                  ) : (
                    clienteSeleccionado.abonos.map((ab: any, i: number) => (
                      <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: '#e5e7eb', marginBottom: 2 }}>
                        <span>{new Date(ab.fecha).toLocaleDateString()}</span>
                        <span style={{ color: '#34d399', fontWeight: 'bold' }}>+${ab.monto}</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="number"
                    placeholder="Monto de abono ($)"
                    value={montoAbono}
                    onChange={e => setMontoAbono(e.target.value)}
                    style={{ flex: 1, background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 8, color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={registrarAbono} style={{ background: '#059669', color: '#fff', border: 'none', padding: '0 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Registrar Abono
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {creditosClientes.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>No hay créditos aprobados pendientes de cobro en el sistema.</p>
                ) : (
                  creditosClientes
                    .filter(c => c.nombreCliente?.toLowerCase().includes(busquedaCliente.toLowerCase()))
                    .map(c => (
                      <div key={c.id} onClick={() => setClienteSeleccionado(c)} style={{ background: '#1f2937', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#fff' }}>{c.nombreCliente} {c.articulo ? `(${c.articulo})` : ''}</p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>Plazo: {c.plazoMeses} meses · Cuota: ${c.cuotaMensual}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 12, fontWeight: 800, margin: 0, color: '#ef4444' }}>Debe: ${((c.saldoPendiente ?? c.montoTotal) || 0).toLocaleString()}</p>
                          <span style={{ fontSize: 10, color: '#34d399' }}>Ver abonos →</span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

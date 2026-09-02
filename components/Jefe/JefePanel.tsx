'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import ProductosAdmin from '@/components/ProductosAdmin';
import type { Producto, Venta, Turno, Compra, UsuarioSistema, JefeSeccion, Permisos } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  productos: Producto[];
  setProductos: (p: Producto[]) => void;
  ventas: Venta[];
  turnos: Turno[];
  compras: Compra[];
  usuariosSistema: UsuarioSistema[];
  setUsuariosSistema: (u: UsuarioSistema[]) => void;
  permisos: Permisos;
  onCerrar: () => void;
}

const MENU_ITEMS: { key: JefeSeccion | string; label: string; icon: string; proximamente?: boolean }[] = [
  { key: 'inicio', label: 'Inicio', icon: '🏠' },
  { key: 'ventas', label: 'Ventas', icon: '🧾' },
  { key: 'reporte_vendedores', label: 'Ventas por Vendedor', icon: '👨‍💼' },
  { key: 'inventario', label: 'Inventario', icon: '📦' },
  { key: 'compras', label: 'Compras', icon: '🚚' },
  { key: 'clientes', label: 'Clientes', icon: '👤' },
  { key: 'proveedores', label: 'Proveedores', icon: '🏭' },
  { key: 'creditos', label: 'Créditos / Fiados', icon: '💳' }, 
  { key: 'cajas', label: 'Cierres de caja', icon: '💰' },
  { key: 'gastos', label: 'Gastos', icon: '📉' },
  { key: 'reportes', label: 'Reportes y Analíticas', icon: '📊' },
  { key: 'usuarios', label: 'Usuarios', icon: '🧑‍💼' },
  { key: 'permisos', label: 'Permisos', icon: '🔐' },
  { key: 'configuracion', label: 'Configuración', icon: '⚙️' },
];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function JefePanel({
  user, productos, ventas, turnos, compras,
  usuariosSistema, setUsuariosSistema, permisos, onCerrar
}: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [jefeSeccion, setJefeSeccion] = useState<JefeSeccion | string>('inicio');

  // Estados colecciones adicionales
  const [clientesLista, setClientesLista] = useState<any[]>([]);
  const [proveedoresLista, setProveedoresLista] = useState<any[]>([]);
  const [gastosLista, setGastosLista] = useState<any[]>([]);
  const [comprasLista, setComprasLista] = useState<any[]>(compras);
  const [creditosGlobales, setCreditosGlobales] = useState<any[]>([]);

  // Formularios modales / inputs
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [cedulaCliente, setCedulaCliente] = useState('');

  const [nombreProveedor, setNombreProveedor] = useState('');
  const [contactoProveedor, setContactoProveedor] = useState('');
  const [telefonoProveedor, setTelefonoProveedor] = useState('');

  const [descGasto, setDescGasto] = useState('');
  const [montoGasto, setMontoGasto] = useState('');

  const [nombreEmpresaConfig, setNombreEmpresaConfig] = useState('Tienda-SS');
  const [monedaConfig, setMonedaConfig] = useState('C$');

  const cargarDatosGlobales = async () => {
    try {
      const cliSnap = await getDocs(collection(db, 'clientes'));
      setClientesLista(cliSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const provSnap = await getDocs(collection(db, 'proveedores'));
      setProveedoresLista(provSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const gasSnap = await getDocs(collection(db, 'gastos'));
      setGastosLista(gasSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const credSnap = await getDocs(collection(db, 'creditos'));
      setCreditosGlobales(credSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { cargarDatosGlobales(); }, []);

  // Funciones de guardado de los nuevos módulos
  const guardarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreCliente.trim()) return;
    await addDoc(collection(db, 'clientes'), { nombre: nombreCliente, telefono: telefonoCliente, cedula: cedulaCliente, fecha: serverTimestamp() });
    setNombreCliente(''); setTelefonoCliente(''); setCedulaCliente('');
    cargarDatosGlobales();
    alert('Cliente guardado');
  };

  const guardarProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProveedor.trim()) return;
    await addDoc(collection(db, 'proveedores'), { nombre: nombreProveedor, contacto: contactoProveedor, telefono: telefonoProveedor, fecha: serverTimestamp() });
    setNombreProveedor(''); setContactoProveedor(''); setTelefonoProveedor('');
    cargarDatosGlobales();
    alert('Proveedor guardado');
  };

  const guardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descGasto.trim() || !montoGasto) return;
    await addDoc(collection(db, 'gastos'), { descripcion: descGasto, monto: parseFloat(montoGasto), registradoPor: user.nombre || user.email, fecha: serverTimestamp() });
    setDescGasto(''); setMontoGasto('');
    cargarDatosGlobales();
    alert('Gasto registrado');
  };

  const hoy = new Date();
  const esHoy = (f: any) => {
    if (!f) return false;
    const d = f.toDate ? f.toDate() : new Date(f);
    return d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  };

  const ventasHoy = ventas.filter(v => esHoy(v.fecha));
  const totalHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
  const ticketsHoy = ventasHoy.length;
  const stockBajo = productos.filter(p => p.stock <= p.stockMinimo);
  const utilidadHoy = ventasHoy.reduce((s, v) => {
    const u = (v.items || []).reduce((s2: number, it: any) => {
      const p = productos.find(pp => pp.id === it.id);
      return s2 + (it.precio - (p ? p.costo : 0)) * it.cantidad;
    }, 0);
    return s + u;
  }, 0);

  const ventasPorMes = (() => {
    const arr: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const total = ventas.filter(v => {
        const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha || 0);
        return f.getFullYear() === d.getFullYear() && f.getMonth() === d.getMonth();
      }).reduce((s, v) => s + (v.total || 0), 0);
      arr.push({ label: MESES[d.getMonth()], total });
    }
    return arr;
  })();
  const maxMes = Math.max(1, ...ventasPorMes.map(d => d.total));

  // Dona métodos de pago
  const pagosMap: Record<string, number> = {};
  ventas.forEach(v => {
    const metodo = v.medioPago || v.tipo || 'Efectivo';
    pagosMap[metodo] = (pagosMap[metodo] || 0) + (v.total || 1);
  });
  const totalPagosMonto = Object.values(pagosMap).reduce((a, b) => a + b, 0) || 1;
  const coloresPagos = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6'];
  let acumuladoPorcentaje = 0;
  const datosDona = Object.entries(pagosMap).map(([nombre, monto], idx) => {
    const porcentaje = (monto / totalPagosMonto) * 100;
    const dashArray = `${porcentaje} ${100 - porcentaje}`;
    const dashOffset = -acumuladoPorcentaje;
    acumuladoPorcentaje += porcentaje;
    return { nombre, monto, porcentaje, color: coloresPagos[idx % coloresPagos.length], dashArray, dashOffset };
  });

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f3f4f6', fontFamily: 'sans-serif', display: 'flex' }}>
      
      {/* Menú Lateral */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, background: '#111827',
        borderRight: '1px solid #1f2937', zIndex: 40, transform: menuAbierto ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 800, fontSize: 16, margin: 0, color: '#a855f7' }}>Tienda-SS</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre} · Director</p>
          </div>
          <button onClick={() => setMenuAbierto(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {MENU_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => { setJefeSeccion(item.key); setMenuAbierto(false); }}
              style={{
                width: '100%', textAlign: 'left',
                background: jefeSeccion === item.key ? '#1e1b4b' : 'transparent',
                border: 'none', padding: '11px 18px', color: '#e5e7eb',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid #1f2937' }}>
          <button onClick={onCerrar} style={{ width: '100%', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {menuAbierto && <div onClick={() => setMenuAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30 }} />}

      <div style={{ flex: 1, minHeight: '100vh' }}>
        <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
          <button onClick={() => setMenuAbierto(true)} style={{ background: '#1f2937', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, fontSize: 18, cursor: 'pointer' }}>☰</button>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              {MENU_ITEMS.find(m => m.key === jefeSeccion)?.label || 'Panel'}
            </h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Panel Ejecutivo Completo</p>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
          
          {/* INICIO */}
          {jefeSeccion === 'inicio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', borderRadius: 16, padding: 16, color: '#fff' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Ventas del Día</span>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>C$ {totalHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>{ticketsHoy} transacciones</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #ec4899 0%, #d946ef 100%)', borderRadius: 16, padding: 16, color: '#fff' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Utilidad Estimada</span>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>C$ {utilidadHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>Ganancia neta</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)', borderRadius: 16, padding: 16, color: '#fff' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Inventario Activo</span>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>{productos.length} items</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>{stockBajo.length} stock bajo</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: 16, padding: 16, color: '#fff' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Créditos / Fiados</span>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>{creditosGlobales.length}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>Financiamientos</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18 }}>
                  <p style={{ fontWeight: 800, margin: 0, fontSize: 14 }}>Tendencia de Crecimiento</p>
                  <div style={{ height: 130, width: '100%', marginTop: 10 }}>
                    <svg viewBox="0 0 500 150" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <path d="M 0,130 Q 100,40 200,90 T 400,30 T 500,60 L 500,150 L 0,150 Z" fill="#8b5cf6" fillOpacity="0.2" />
                      <path d="M 0,130 Q 100,40 200,90 T 400,30 T 500,60" fill="none" stroke="#a855f7" strokeWidth="3" />
                    </svg>
                  </div>
                </div>

                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18 }}>
                  <p style={{ fontWeight: 800, margin: 0, fontSize: 14 }}>Ingresos por Mes</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130, marginTop: 10 }}>
                    {ventasPorMes.map((m, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ width: '100%', background: '#3b82f6', borderRadius: '6px 6px 0 0', height: `${Math.max(8, (m.total / maxMes) * 110)}px` }} />
                        <span style={{ fontSize: 10, color: '#d1d5db' }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VENTAS */}
          {jefeSeccion === 'ventas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Historial de ventas ({ventas.length})</p>
              {ventas.slice().reverse().map(v => (
                <div key={v.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{v.vendedorNombre}</span>
                    <span style={{ fontWeight: 800, color: '#34d399' }}>C$ {(v.total || 0).toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{v.medioPago} · {(v.items || []).length} items</p>
                </div>
              ))}
            </div>
          )}

          {/* REPORTE VENDEDORES */}
          {jefeSeccion === 'reporte_vendedores' && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: '#38bdf8' }}>📊 Reporte de Ventas por Vendedor</p>
              {ventasHoy.length === 0 ? (
                <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '20px 0' }}>No hay ventas registradas hoy.</p>
              ) : (
                ventasHoy.map(v => (
                  <div key={v.id} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700 }}>{v.vendedorNombre}</span>
                      <span style={{ color: '#34d399', fontWeight: 800 }}>C$ {v.total}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* INVENTARIO */}
          {jefeSeccion === 'inventario' && <ProductosAdmin />}

          {/* COMPRAS */}
          {jefeSeccion === 'compras' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>🚚 Registro de Compras a Proveedores</p>
              {compras.length === 0 ? (
                <p style={{ fontSize: 13, color: '#6b7280' }}>No hay compras registradas.</p>
              ) : (
                compras.map(c => (
                  <div key={c.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12 }}>
                    <p style={{ fontWeight: 700, margin: 0 }}>{c.proveedor || 'Proveedor'}</p>
                    <p style={{ fontSize: 12, color: '#34d399', margin: '4px 0 0' }}>Total: C$ {c.total}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* CLIENTES (NUEVO MÓDULO) */}
          {jefeSeccion === 'clientes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={guardarCliente} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13, color: '#38bdf8' }}>➕ Registrar Nuevo Cliente</p>
                <input placeholder="Nombre completo" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input placeholder="Teléfono" value={telefonoCliente} onChange={e => setTelefonoCliente(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input placeholder="Cédula" value={cedulaCliente} onChange={e => setCedulaCliente(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Guardar Cliente</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Lista de Clientes ({clientesLista.length})</p>
                {clientesLista.map(cli => (
                  <div key={cli.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, color: '#fff' }}>{cli.nombre}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Tel: {cli.telefono || 'Sin teléfono'} · Cédula: {cli.cedula || 'N/A'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PROVEEDORES (NUEVO MÓDULO) */}
          {jefeSeccion === 'proveedores' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={guardarProveedor} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13, color: '#38bdf8' }}>➕ Registrar Nuevo Proveedor</p>
                <input placeholder="Empresa / Proveedor" value={nombreProveedor} onChange={e => setNombreProveedor(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input placeholder="Nombre de contacto" value={contactoProveedor} onChange={e => setContactoProveedor(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input placeholder="Teléfono" value={telefonoProveedor} onChange={e => setTelefonoProveedor(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Guardar Proveedor</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Lista de Proveedores ({proveedoresLista.length})</p>
                {proveedoresLista.map(prov => (
                  <div key={prov.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12 }}>
                    <p style={{ fontWeight: 700, margin: 0, color: '#fff' }}>{prov.nombre}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Contacto: {prov.contacto || 'N/A'} · Tel: {prov.telefono || 'N/A'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CRÉDITOS */}
          {jefeSeccion === 'creditos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>💳 Créditos y Fiados Activos</p>
              {creditosGlobales.map(c => (
                <div key={c.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: '#fff', margin: 0 }}>{c.nombreCliente} ({c.articulo})</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>Plazo: {c.plazoMeses} meses · Cuota: C$ {c.cuotaMensual}</p>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', margin: 0 }}>Debe: C$ {c.saldoPendiente?.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {/* CAJAS */}
          {jefeSeccion === 'cajas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>Turnos y Cierres de Caja</p>
              {turnos.map(t => (
                <div key={t.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700 }}>{t.vendedorNombre}</span>
                    <span style={{ fontSize: 11, color: t.estado === 'abierto' ? '#5eead4' : '#9ca3af' }}>{t.estado}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>Inicial: C$ {t.montoInicial}</p>
                </div>
              ))}
            </div>
          )}

          {/* GASTOS (NUEVO MÓDULO) */}
          {jefeSeccion === 'gastos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={guardarGasto} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13, color: '#f87171' }}>📉 Registrar Nuevo Gasto</p>
                <input placeholder="Descripción del gasto (Ej. Luz, Agua, Alquiler)" value={descGasto} onChange={e => setDescGasto(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input type="number" placeholder="Monto (C$)" value={montoGasto} onChange={e => setMontoGasto(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <button type="submit" style={{ background: '#ef4444', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Registrar Gasto</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 800, fontSize: 13, margin: 0 }}>Historial de Gastos ({gastosLista.length})</p>
                {gastosLista.map(g => (
                  <div key={g.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 700, margin: 0, color: '#fff' }}>{g.descripcion}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Registrado por: {g.registradoPor || 'Director'}</p>
                    </div>
                    <p style={{ fontWeight: 800, color: '#f87171', margin: 0 }}>- C$ {g.monto?.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REPORTES */}
          {jefeSeccion === 'reportes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px', color: '#fff' }}>📊 Reportes y Distribución por Método de Pago</h2>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 20px' }}>Análisis detallado de cómo ingresa el dinero a caja.</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                    <svg width="180" height="180" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#1f2937" strokeWidth="6"></circle>
                      {datosDona.map((d, i) => (
                        <circle key={i} cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke={d.color} strokeWidth="6" strokeDasharray={d.dashArray} strokeDashoffset={d.dashOffset} />
                      ))}
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Total Ventas</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{ventas.length}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {datosDona.map((d, i) => (
                      <div key={i} style={{ background: '#030712', border: '1px solid #1f2937', padding: '10px 12px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{d.nombre}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>C$ {d.monto.toLocaleString()}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>({d.porcentaje.toFixed(1)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* USUARIOS */}
          {jefeSeccion === 'usuarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontWeight: 800, fontSize: 14, margin: 0 }}>🧑‍💼 Gestión del Personal ({usuariosSistema.length})</p>
              {usuariosSistema.map(u => (
                <div key={u.id || u.email} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0, color: '#fff' }}>{u.nombre || u.email}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Rol: {u.rol}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PERMISOS */}
          {jefeSeccion === 'permisos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>🔐 Configuración de Permisos de Roles</p>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>El sistema tiene control de acceso por roles (Vendedor, Bodega, Cajero, Chofer, Director).</p>
            </div>
          )}

          {/* CONFIGURACIÓN (NUEVO MÓDULO) */}
          {jefeSeccion === 'configuracion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontWeight: 800, fontSize: 14, margin: 0, color: '#38bdf8' }}>⚙️ Ajustes Generales del Sistema</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#9ca3af' }}>Nombre de la Tienda / Empresa</label>
                  <input value={nombreEmpresaConfig} onChange={e => setNombreEmpresaConfig(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: '#9ca3af' }}>Moneda Principal</label>
                  <input value={monedaConfig} onChange={e => setMonedaConfig(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                </div>
                <button onClick={() => alert('¡Configuración guardada con éxito!')} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>Guardar Cambios</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

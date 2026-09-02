'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, collection, getDocs, query, addDoc, serverTimestamp } from 'firebase/firestore';
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
  { key: 'inventario', label: 'Inventario', icon: '📦' },
  { key: 'compras', label: 'Compras', icon: '🚚' },
  { key: 'clientes', label: 'Clientes', icon: '👤', proximamente: true },
  { key: 'proveedores', label: 'Proveedores', icon: '🏭', proximamente: true },
  { key: 'creditos', label: 'Créditos / Fiados', icon: '💳' }, 
  { key: 'cajas', label: 'Cierres de caja', icon: '💰' },
  { key: 'gastos', label: 'Gastos', icon: '📉', proximamente: true },
  { key: 'reportes', label: 'Reportes', icon: '📊', proximamente: true },
  { key: 'usuarios', label: 'Usuarios', icon: '🧑‍💼' },
  { key: 'permisos', label: 'Permisos', icon: '🔐' },
  { key: 'configuracion', label: 'Configuración', icon: '⚙️', proximamente: true },
];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function JefePanel({
  user, productos, ventas, turnos, compras,
  usuariosSistema, setUsuariosSistema, permisos, onCerrar
}: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [jefeSeccion, setJefeSeccion] = useState<JefeSeccion | string>('inicio');
  const [proximamenteNombre, setProximamenteNombre] = useState('');

  const [nuevoEmailUsuario, setNuevoEmailUsuario] = useState('');
  const [nuevoPassUsuario, setNuevoPassUsuario] = useState('');
  const [nuevoNombreUsuario, setNuevoNombreUsuario] = useState('');
  const [nuevoRolUsuario, setNuevoRolUsuario] = useState('vendedor');
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

  // Estados para supervisión y creación de créditos por el Jefe con Autocalculadora
  const [creditosGlobales, setCreditosGlobales] = useState<any[]>([]);
  const [busquedaCredito, setBusquedaCredito] = useState('');
  
  // Formulario de Nuevo Crédito / Fiado
  const [mostrarFormCredito, setMostrarFormCredito] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [cedulaCliente, setCedulaCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [direccionCliente, setDireccionCliente] = useState('');
  const [fiadorCliente, setFiadorCliente] = useState('');
  const [articuloFiado, setArticuloFiado] = useState('');
  const [precioBaseArticulo, setPrecioBaseArticulo] = useState('');
  const [primaMonto, setPrimaMonto] = useState('');
  const [plazoSeleccionado, setPlazoSeleccionado] = useState(12);

  // Porcentajes de recargo editables por el Jefe según el plazo (configurable)
  const [porcentajesPlazos, setPorcentajesPlazos] = useState<Record<number, number>>({
    3: 5,
    6: 10,
    9: 15,
    12: 20,
    18: 30,
    24: 40,
    30: 50,
    36: 60
  });

  const cargarCreditosGlobales = async () => {
    try {
      const q = query(collection(db, 'creditos'));
      const querySnapshot = await getDocs(q);
      const lista: any[] = [];
      querySnapshot.forEach((d) => {
        lista.push({ id: d.id, ...d.data() });
      });
      setCreditosGlobales(lista);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    cargarCreditosGlobales();
  }, []);

  // Autocalculadora Financiera
  const precioBaseNum = parseFloat(precioBaseArticulo) || 0;
  const primaNum = parseFloat(primaMonto) || 0;
  const porcentajeRecargo = porcentajesPlazos[plazoSeleccionado] || 0;
  
  const subtotalFinanciar = Math.max(0, precioBaseNum - primaNum);
  const montoConRecargo = subtotalFinanciar * (1 + porcentajeRecargo / 100);
  const cuotaMensualCalculada = plazoSeleccionado > 0 ? (montoConRecargo / plazoSeleccionado).toFixed(2) : '0';

  const guardarNuevoCredito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreCliente.trim() || precioBaseNum <= 0) {
      alert('Ingrese el nombre del cliente y un precio válido del producto.');
      return;
    }

    try {
      const dataCredito = {
        nombreCliente: nombreCliente.trim(),
        cedula: cedulaCliente.trim(),
        telefono: telefonoCliente.trim(),
        direccion: direccionCliente.trim(),
        fiador: fiadorCliente.trim(),
        articulo: articuloFiado.trim(),
        precioBase: precioBaseNum,
        prima: primaNum,
        plazoMeses: plazoSeleccionado,
        porcentajeRecargoApplied: porcentajeRecargo,
        saldoPendiente: parseFloat(montoConRecargo.toFixed(2)),
        cuotaMensual: parseFloat(cuotaMensualCalculada),
        fechaCreacion: serverTimestamp(),
        creadoPor: user.nombre || user.email,
        abonos: []
      };

      await addDoc(collection(db, 'creditos'), dataCredito);
      alert('¡Crédito / Fiado autorizado y registrado exitosamente en el sistema y disponible para el cajero!');
      
      // Limpiar formulario
      setNombreCliente('');
      setCedulaCliente('');
      setTelefonoCliente('');
      setDireccionCliente('');
      setFiadorCliente('');
      setArticuloFiado('');
      setPrecioBaseArticulo('');
      setPrimaMonto('');
      setMostrarFormCredito(false);
      cargarCreditosGlobales();
    } catch (err) {
      console.error(err);
      alert('Error al registrar el crédito');
    }
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
      const costo = p ? p.costo : 0;
      return s2 + (it.precio - costo) * it.cantidad;
    }, 0);
    return s + u;
  }, 0);

  const porPago: Record<string, number> = {};
  ventasHoy.forEach(v => {
    const m = v.medioPago || 'Otros';
    porPago[m] = (porPago[m] || 0) + (v.total || 0);
  });

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

  const turnosAbiertosAhora = turnos.filter(t => t.estado === 'abierto');
  const cierresConDiferencia = turnos.filter(t => t.estado === 'cerrado' && (t.diferencia || 0) !== 0);

  const llamarApiUsuarios = async (method: 'POST' | 'PATCH' | 'DELETE', body: any) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('No hay sesión activa');
    const res = await fetch('/api/usuarios', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error en la operación');
    return data;
  };

  const registrarNuevoUsuarioSistema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEmailUsuario || !nuevoPassUsuario || !nuevoNombreUsuario.trim()) {
      alert('Ingresa nombre, correo y contraseña');
      return;
    }
    setGuardandoUsuario(true);
    try {
      await llamarApiUsuarios('POST', {
        nombre: nuevoNombreUsuario.trim(),
        email: nuevoEmailUsuario.trim().toLowerCase(),
        password: nuevoPassUsuario,
        rol: nuevoRolUsuario,
      });
      setNuevoEmailUsuario('');
      setNuevoPassUsuario('');
      setNuevoNombreUsuario('');
      setNuevoRolUsuario('vendedor');
      alert('¡Usuario registrado correctamente!');
    } catch (error: any) {
      alert('Error al registrar el usuario: ' + (error.message || ''));
    } finally {
      setGuardandoUsuario(false);
    }
  };

  const cambiarEstadoUsuario = async (id: string, estadoActual: boolean) => {
    try {
      await llamarApiUsuarios('PATCH', { uid: id, activo: !estadoActual });
      setUsuariosSistema(usuariosSistema.map(u => u.id === id ? { ...u, activo: !estadoActual } : u));
    } catch (error: any) {
      alert('No se pudo actualizar el estado: ' + (error.message || ''));
    }
  };

  const eliminarUsuario = async (id: string, email: string) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente a ${email}?`)) return;
    try {
      await llamarApiUsuarios('DELETE', { uid: id });
      setUsuariosSistema(usuariosSistema.filter(u => u.id !== id));
      alert('Usuario eliminado correctamente');
    } catch (error: any) {
      alert('No se pudo eliminar el usuario: ' + (error.message || ''));
    }
  };

  const guardarPermiso = async (campo: keyof Permisos, valor: boolean) => {
    try {
      await setDoc(doc(db, 'config', 'permisos'), {
        ...permisos,
        [campo]: valor,
      }, { merge: true });
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || ''));
    }
  };

  const seleccionarMenu = (key: string, proximamente?: boolean, label?: string) => {
    if (proximamente) {
      setProximamenteNombre(label || key);
      setJefeSeccion('proximamente');
    } else {
      setJefeSeccion(key);
    }
    setMenuAbierto(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', fontFamily: 'sans-serif', display: 'flex' }}>
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, background: '#111827',
        borderRight: '1px solid #1f2937', zIndex: 40, transform: menuAbierto ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Tienda-SS</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre} · Jefe</p>
          </div>
          <button onClick={() => setMenuAbierto(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {MENU_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => seleccionarMenu(item.key, item.proximamente, item.label)}
              style={{
                width: '100%', textAlign: 'left',
                background: jefeSeccion === item.key || (jefeSeccion === 'proximamente' && proximamenteNombre === item.label) ? '#1e1b4b' : 'transparent',
                border: 'none', padding: '11px 18px', color: item.proximamente ? '#6b7280' : '#e5e7eb',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.proximamente && <span style={{ marginLeft: 'auto', fontSize: 10, background: '#374151', padding: '2px 6px', borderRadius: 6 }}>Pronto</span>}
            </button>
          ))}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid #1f2937' }}>
          <button onClick={onCerrar} style={{ width: '100%', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {menuAbierto && (
        <div onClick={() => setMenuAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />
      )}

      <div style={{ flex: 1, marginLeft: 0, minHeight: '100vh' }}>
        <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
          <button onClick={() => setMenuAbierto(true)} style={{ background: '#1f2937', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, fontSize: 18, cursor: 'pointer' }}>☰</button>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              {jefeSeccion === 'proximamente' ? proximamenteNombre : MENU_ITEMS.find(m => m.key === jefeSeccion)?.label || 'Panel'}
            </h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Panel del Jefe · control total</p>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
          {jefeSeccion === 'inicio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Ventas hoy</p>
                  <p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: '#34d399' }}>${totalHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{ticketsHoy} tickets</p>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Utilidad estimada</p>
                  <p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: '#a5b4fc' }}>${utilidadHoy.toLocaleString()}</p>
                </div>
              </div>

              {stockBajo.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontWeight: 700, color: '#f87171', margin: '0 0 8px', fontSize: 13 }}>⚠️ Stock bajo ({stockBajo.length})</p>
                  {stockBajo.slice(0, 5).map(p => (
                    <p key={p.id} style={{ fontSize: 12, margin: '2px 0', color: '#fca5a5' }}>{p.nombre}: {p.stock} (mín {p.stockMinimo})</p>
                  ))}
                </div>
              )}

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
                <p style={{ fontWeight: 700, margin: '0 0 10px', fontSize: 13 }}>Ventas últimos 6 meses</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                  {ventasPorMes.map((m, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', background: '#4f46e5', borderRadius: '6px 6px 0 0', height: `${(m.total / maxMes) * 80}px`, minHeight: 4 }} />
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {jefeSeccion === 'ventas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Todas las ventas del sistema ({ventas.length})</p>
              {ventas.slice().sort((a, b) => {
                const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha || 0);
                const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha || 0);
                return fb.getTime() - fa.getTime();
              }).slice(0, 50).map(v => (
                <div key={v.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{v.vendedorNombre}</span>
                    <span style={{ fontWeight: 800, color: '#34d399' }}>${(v.total || 0).toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                    {v.medioPago} · {(v.items || []).length} items · {v.fecha?.toDate ? v.fecha.toDate().toLocaleString() : ''}
                  </p>
                </div>
              ))}
            </div>
          )}

          {jefeSeccion === 'inventario' && (
            <ProductosAdmin />
          )}

          {/* MÓDULO DE CRÉDITOS Y FIADOS CON AUTOCALCULADORA PARA EL JEFE */}
          {jefeSeccion === 'creditos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>💳 Gestión y Supervisión de Créditos / Fiados</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setMostrarFormCredito(!mostrarFormCredito)} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {mostrarFormCredito ? '✕ Cerrar Formulario' : '➕ Nuevo Crédito / Fiado'}
                  </button>
                  <button onClick={cargarCreditosGlobales} style={{ background: '#374151', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Actualizar
                  </button>
                </div>
              </div>

              {/* FORMULARIO DE NUEVO CRÉDITO Y AUTOCALCULADORA */}
              {mostrarFormCredito && (
                <form onSubmit={guardarNuevoCredito} style={{ background: '#111827', border: '1px solid #4338ca', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontWeight: 800, color: '#c7d2fe', margin: 0, fontSize: 14 }}>📝 Asignar Venta al Crédito (Requisitos Bancarios / Legales)</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Nombre Completo del Cliente:</label>
                      <input placeholder="Ej: Juan Pérez" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} required
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Cédula / Identificación:</label>
                      <input placeholder="Ej: 001-XXXXXX-XXXX" value={cedulaCliente} onChange={e => setCedulaCliente(e.target.value)} required
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Teléfono de Contacto:</label>
                      <input placeholder="Ej: +505 88888888" value={telefonoCliente} onChange={e => setTelefonoCliente(e.target.value)}
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Nombre del Fiador / Referencia:</label>
                      <input placeholder="Ej: María Gómez" value={fiadorCliente} onChange={e => setFiadorCliente(e.target.value)}
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#9ca3af' }}>Dirección Domiciliar:</label>
                    <input placeholder="Ej: De los semáforos 2 cuadras al lago..." value={direccionCliente} onChange={e => setDireccionCliente(e.target.value)}
                      style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Electrodoméstico / Mueble / Artículo:</label>
                      <input placeholder="Ej: Refrigeradora LG 14 Pies" value={articuloFiado} onChange={e => setArticuloFiado(e.target.value)} required
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Precio Base ($):</label>
                      <input type="number" placeholder="3000" value={precioBaseArticulo} onChange={e => setPrecioBaseArticulo(e.target.value)} required
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#9ca3af' }}>Prima / Enganche ($):</label>
                      <input type="number" placeholder="500" value={primaMonto} onChange={e => setPrimaMonto(e.target.value)}
                        style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 9, color: '#fff', fontSize: 12, outline: 'none' }} />
                    </div>
                  </div>

                  {/* Configuración de Plazos y Recargos */}
                  <div style={{ background: '#1e1b4b', padding: 12, borderRadius: 10, border: '1px solid #312e81' }}>
                    <p style={{ fontWeight: 700, fontSize: 12, color: '#c7d2fe', margin: '0 0 8px' }}>⚡ Autocalculadora de Plazo y Porcentajes de Financiamiento</p>
                    
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {[3, 6, 9, 12, 18, 24, 30, 36].map(meses => (
                        <button
                          type="button"
                          key={meses}
                          onClick={() => setPlazoSeleccionado(meses)}
                          style={{
                            background: plazoSeleccionado === meses ? '#4f46e5' : '#111827',
                            color: '#fff', border: '1px solid #374151', padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                          }}>
                          {meses} Meses ({porcentajesPlazos[meses]}%)
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#e5e7eb', marginTop: 6 }}>
                      <span>Plazo seleccionado: <b>{plazoSeleccionado} meses</b></span>
                      <span>Porcentaje de recargo aplicado: <b>{porcentajeRecargo}%</b></span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 'bold', color: '#34d399', marginTop: 6, borderTop: '1px solid #374151', paddingTop: 6 }}>
                      <span>Total Financiado con Intereses: <b>${montoConRecargo.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
                      <span>Cuota Mensual: <b>${cuotaMensualCalculada}</b></span>
                    </div>
                  </div>

                  <button type="submit" style={{ width: '100%', background: '#059669', color: '#fff', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                    Aprobar y Enviar Crédito a Caja
                  </button>
                </form>
              )}

              <input
                placeholder="🔍 Buscar cliente por nombre o cédula..."
                value={busquedaCredito}
                onChange={e => setBusquedaCredito(e.target.value)}
                style={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {creditosGlobales.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#6b7280' }}>No hay créditos activos registrados en el sistema.</p>
                ) : (
                  creditosGlobales
                    .filter(c => c.nombreCliente?.toLowerCase().includes(busquedaCredito.toLowerCase()))
                    .map(c => (
                      <div key={c.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 13, color: '#fff', margin: 0 }}>{c.nombreCliente} {c.articulo ? `(${c.articulo})` : ''}</p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0' }}>Cédula: {c.cedula || 'N/D'} · Plazo: <b>{c.plazoMeses} meses</b> · Fiador: {c.fiador || 'N/D'}</p>
                          <p style={{ fontSize: 11, color: '#818cf8', margin: 0 }}>Cuota mensual: ${c.cuotaMensual} · Abonos realizados: {c.abonos?.length || 0}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', margin: 0 }}>Debe: ${c.saldoPendiente?.toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {jefeSeccion === 'cajas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>Turnos / Cierres de caja</p>
              {turnos.slice().sort((a, b) => {
                const fa = a.fechaApertura?.toDate ? a.fechaApertura.toDate() : new Date(a.fechaApertura || 0);
                const fb = b.fechaApertura?.toDate ? b.fechaApertura.toDate() : new Date(b.fechaApertura || 0);
                return fb.getTime() - fa.getTime();
              }).map(t => (
                <div key={t.id} style={{
                  background: '#111827',
                  border: `1px solid ${t.estado === 'abierto' ? '#0d9488' : (t.diferencia || 0) !== 0 ? 'rgba(239,68,68,0.4)' : '#1f2937'}`,
                  borderRadius: 12, padding: 12
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700 }}>{t.vendedorNombre}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      background: t.estado === 'abierto' ? 'rgba(13,148,136,0.2)' : 'rgba(107,114,128,0.2)',
                      color: t.estado === 'abierto' ? '#5eead4' : '#9ca3af'
                    }}>{t.estado}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
                    Inicial: ${t.montoInicial}
                    {t.estado === 'cerrado' && (
                      <> · Contado: ${t.montoContado} · Dif: <span style={{ color: (t.diferencia || 0) !== 0 ? '#f87171' : '#34d399' }}>{t.diferencia}</span></>
                    )}
                  </p>
                </div>
              ))}
              {cierresConDiferencia.length > 0 && (
                <p style={{ fontSize: 12, color: '#f87171' }}>⚠ {cierresConDiferencia.length} cierres con diferencia</p>
              )}
            </div>
          )}

          {jefeSeccion === 'usuarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={registrarNuevoUsuarioSistema} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13, color: '#818cf8' }}>➕ Nuevo usuario</p>
                <input placeholder="Nombre" value={nuevoNombreUsuario} onChange={e => setNuevoNombreUsuario(e.target.value)}
                  style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
                <input type="email" placeholder="Correo" value={nuevoEmailUsuario} onChange={e => setNuevoEmailUsuario(e.target.value)}
                  style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
                <input type="password" placeholder="Contraseña" value={nuevoPassUsuario} onChange={e => setNuevoPassUsuario(e.target.value)}
                  style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
                <select value={nuevoRolUsuario} onChange={e => setNuevoRolUsuario(e.target.value)}
                  style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}>
                  <option value="vendedor">Vendedor</option>
                  <option value="bodega">Bodega</option>
                  <option value="chofer">Chofer</option>
                  <option value="cajero">Cajero</option>
                  <option value="jefe">Jefe</option>
                </select>
                <button type="submit" disabled={guardandoUsuario}
                  style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
                  {guardandoUsuario ? 'Guardando...' : 'Registrar usuario'}
                </button>
              </form>

              {usuariosSistema.map(u => (
                <div key={u.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: 13 }}>{u.nombre || u.email}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{u.email} · {u.rol}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => cambiarEstadoUsuario(u.id, u.activo !== false)}
                      style={{
                        background: u.activo !== false ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: u.activo !== false ? '#34d399' : '#f87171',
                        border: 'none', padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                      }}>
                      {u.activo !== false ? 'Activo' : 'Inactivo'}
                    </button>
                    <button onClick={() => eliminarUsuario(u.id, u.email)}
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '6px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PERMISOS GENERALES INCLUYENDO CAJA */}
          {jefeSeccion === 'permisos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
                Activa o desactiva los permisos del personal en el sistema. Se guarda en tiempo real en Firebase.
              </p>
              {([
                { key: 'bodegaCrearProductos' as const, label: 'Bodega: crear productos nuevos' },
                { key: 'bodegaAjustarStock' as const, label: 'Bodega: ajustar stock' },
                { key: 'bodegaRegistrarCompras' as const, label: 'Bodega: registrar compras a proveedores' },
                { key: 'choferRegistrarCompras' as const, label: 'Chofer: registrar compras a proveedores' },
                { key: 'cajaAbrirCerrar' as const, label: 'Caja: abrir y cerrar turnos y gaveta' },
                { key: 'cajaCobrarPreventas' as const, label: 'Caja: cobrar preventas y emitir tickets' },
                { key: 'cajaGestionarCreditos' as const, label: 'Caja: registrar abonos a créditos y fiados' },
              ]).map(item => (
                <div key={item.key} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                  <button
                    onClick={() => guardarPermiso(item.key, !permisos[item.key])}
                    style={{
                      background: permisos[item.key] ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)',
                      color: permisos[item.key] ? '#34d399' : '#f87171',
                      border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer'
                    }}
                  >
                    {permisos[item.key] ? 'Activado' : 'Desactivado'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {jefeSeccion === 'proximamente' && (
            <div style={{ textAlign: 'center', padding: 40, background: '#111827', borderRadius: 16, border: '1px solid #1f2937' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>🚧</p>
              <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>{proximamenteNombre}</p>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0 0' }}>Este módulo estará disponible pronto</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

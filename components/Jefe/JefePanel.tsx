'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  { key: 'reporte_vendedores', label: 'Ventas por Vendedor', icon: '👨‍💼' },
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

  const [creditosGlobales, setCreditosGlobales] = useState<any[]>([]);
  const [busquedaCredito, setBusquedaCredito] = useState('');
  
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

  const [porcentajesPlazos, setPorcentajesPlazos] = useState<Record<number, number>>({
    3: 5, 6: 10, 9: 15, 12: 20, 18: 30, 24: 40, 30: 50, 36: 60
  });

  const [fotoCedulaFrontal, setFotoCedulaFrontal] = useState<string | null>(null);
  const [fotoCedulaTrasera, setFotoCedulaTrasera] = useState<string | null>(null);
  const [fotosExtra, setFotosExtra] = useState<string[]>([]);
  const [cargandoCredito, setCargandoCredito] = useState(false);
  const [contratoImpresionData, setContratoImpresionData] = useState<any>(null);

  const comprimirImagen = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 600;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const manejarCambioFoto = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'frontal' | 'trasera' | 'extra') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64Comprimida = await comprimirImagen(file);
    if (tipo === 'frontal') setFotoCedulaFrontal(base64Comprimida);
    else if (tipo === 'trasera') setFotoCedulaTrasera(base64Comprimida);
    else if (tipo === 'extra' && fotosExtra.length < 2) {
      setFotosExtra([...fotosExtra, base64Comprimida]);
    }
  };

  const cargarCreditosGlobales = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'creditos'));
      const lista: any[] = [];
      querySnapshot.forEach((d) => lista.push({ id: d.id, ...d.data() }));
      setCreditosGlobales(lista);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    cargarCreditosGlobales();
  }, []);

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
    setCargandoCredito(true);
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
        fotoCedulaFrontal: fotoCedulaFrontal || null,
        fotoCedulaTrasera: fotoCedulaTrasera || null,
        fotosExtra: fotosExtra,
        fechaCreacion: serverTimestamp(),
        creadoPor: user.nombre || user.email,
        abonos: [],
        estadoCaja: 'pendiente'
      };
      const docRef = await addDoc(collection(db, 'creditos'), dataCredito);
      await addDoc(collection(db, 'ventas'), {
        cliente: nombreCliente.trim(),
        tipo: 'Crédito',
        total: parseFloat(montoConRecargo.toFixed(2)),
        vendedorNombre: user.nombre || 'Jefe / Sistema',
        medioPago: 'Crédito',
        items: [{ nombre: articuloFiado.trim() || 'Artículo financiado', cantidad: 1, precio: precioBaseNum }],
        fecha: serverTimestamp()
      });
      setContratoImpresionData({ id: docRef.id, ...dataCredito });
      alert('¡Crédito autorizado, sincronizado con ventas y enviado al panel del cajero!');
      setNombreCliente(''); setCedulaCliente(''); setTelefonoCliente(''); setDireccionCliente('');
      setFiadorCliente(''); setArticuloFiado(''); setPrecioBaseArticulo(''); setPrimaMonto('');
      setFotoCedulaFrontal(null); setFotoCedulaTrasera(null); setFotosExtra([]);
      setMostrarFormCredito(false);
      cargarCreditosGlobales();
    } catch (err: any) {
      alert('Error al registrar el crédito: ' + (err.message || ''));
    } finally {
      setCargandoCredito(false);
    }
  };

  const imprimirContrato = (tipoFormato: 'carta' | 'legal') => {
    const datos = contratoImpresionData || creditosGlobales[0];
    if (!datos) { alert('No hay datos para imprimir.'); return; }
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    ventana.document.write(`
      <html>
        <head><title>Contrato - ${tipoFormato.toUpperCase()}</title></head>
        <body style="font-family: Arial; padding: 20px;">
          <h2>TIENDA-SS - CONTRATO DE FINANCIAMIENTO</h2>
          <p><b>Cliente:</b> ${datos.nombreCliente} | <b>Cédula:</b> ${datos.cedula}</p>
          <p><b>Artículo:</b> ${datos.articulo} | <b>Total Financiado:</b> C$ ${datos.saldoPendiente?.toLocaleString()}</p>
          <p><b>Cuota Mensual:</b> C$ ${datos.cuotaMensual} (${datos.plazoMeses} meses)</p>
        </body>
      </html>
    `);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
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

  const turnosAbiertosAhora = turnos.filter(t => t.estado === 'abierto');

  const llamarApiUsuarios = async (method: 'POST' | 'PATCH' | 'DELETE', body: any) => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/usuarios', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  };

  const registrarNuevoUsuarioSistema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEmailUsuario || !nuevoPassUsuario || !nuevoNombreUsuario.trim()) return;
    setGuardandoUsuario(true);
    try {
      await llamarApiUsuarios('POST', { nombre: nuevoNombreUsuario.trim(), email: nuevoEmailUsuario.toLowerCase(), password: nuevoPassUsuario, rol: nuevoRolUsuario });
      setNuevoEmailUsuario(''); setNuevoPassUsuario(''); setNuevoNombreUsuario('');
      alert('¡Usuario registrado!');
    } catch (error: any) { alert(error.message); } finally { setGuardandoUsuario(false); }
  };

  const seleccionarMenu = (key: string, proximamente?: boolean, label?: string) => {
    if (proximamente) { setProximamenteNombre(label || key); setJefeSeccion('proximamente'); }
    else { setJefeSeccion(key); }
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

      {menuAbierto && <div onClick={() => setMenuAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30 }} />}

      <div style={{ flex: 1, minHeight: '100vh' }}>
        <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
          <button onClick={() => setMenuAbierto(true)} style={{ background: '#1f2937', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, fontSize: 18, cursor: 'pointer' }}>☰</button>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              {jefeSeccion === 'proximamente' ? proximamenteNombre : MENU_ITEMS.find(m => m.key === jefeSeccion)?.label || 'Panel'}
            </h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Panel del Jefe · Control Ejecutivo</p>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
          
          {/* VISTA DE INICIO REDISEÑADA Y PROFESIONAL */}
          {jefeSeccion === 'inicio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* Tarjetas de Métricas Principales */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                <div style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', border: '1px solid #374151', borderRadius: 16, padding: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Ventas Hoy</span>
                    <span style={{ fontSize: 16 }}>🧾</span>
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 2px', color: '#34d399' }}>C$ {totalHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>{ticketsHoy} transacciones realizadas</p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', border: '1px solid #374151', borderRadius: 16, padding: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Utilidad Est. Hoy</span>
                    <span style={{ fontSize: 16 }}>📈</span>
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 2px', color: '#a5b4fc' }}>C$ {utilidadHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Margen estimado de ganancia</p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', border: '1px solid #374151', borderRadius: 16, padding: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Inventario Activo</span>
                    <span style={{ fontSize: 16 }}>📦</span>
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 2px', color: '#38bdf8' }}>{productos.length} items</p>
                  <p style={{ fontSize: 11, color: stockBajo.length > 0 ? '#f87171' : '#6b7280', margin: 0 }}>
                    {stockBajo.length > 0 ? `⚠️ ${stockBajo.length} con stock bajo` : 'Stock en niveles óptimos'}
                  </p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', border: '1px solid #374151', borderRadius: 16, padding: 16, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Créditos / Fiados</span>
                    <span style={{ fontSize: 16 }}>💳</span>
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 2px', color: '#fbbf24' }}>{creditosGlobales.length}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Cartera activa de financiamiento</p>
                </div>
              </div>

              {/* Sección de Gráfica de Ventas Semestrales y Estado de Módulos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                
                {/* Gráfica de 6 Meses Estilizada */}
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <p style={{ fontWeight: 800, margin: 0, fontSize: 14, color: '#f3f4f6' }}>📊 Rendimiento de Ventas (6 Meses)</p>
                      <span style={{ fontSize: 11, background: '#1f2937', padding: '2px 8px', borderRadius: 6, color: '#9ca3af' }}>Historial</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, paddingBottom: 4, borderBottom: '1px solid #1f2937' }}>
                      {ventasPorMes.map((m, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 9, color: '#9ca3af' }}>{m.total > 0 ? `${(m.total / 1000).toFixed(0)}k` : '0'}</span>
                          <div style={{ 
                            width: '100%', 
                            background: m.total === maxMes ? 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)' : '#374151', 
                            borderRadius: '6px 6px 0 0', 
                            height: `${Math.max(6, (m.total / maxMes) * 85)}px`,
                            transition: 'height 0.3s ease'
                          }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#d1d5db' }}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '12px 0 0', textAlign: 'center' }}>Monitoreo consolidado de ingresos mensuales</p>
                </div>

                {/* Resumen Rápido por Módulos y Operatividad */}
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontWeight: 800, margin: 0, fontSize: 14, color: '#f3f4f6' }}>⚡ Estado Operativo de Módulos</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#030712', padding: '10px 12px', borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>💰</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Cajas / Turnos</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: turnosAbiertosAhora.length > 0 ? '#34d399' : '#f87171' }}>
                        {turnosAbiertosAhora.length > 0 ? `${turnosAbiertosAhora.length} turno(s) abierto(s)` : 'Cajas cerradas'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#030712', padding: '10px 12px', borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🧑‍💼</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Personal Activo</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>
                        {usuariosSistema.length} usuarios registrados
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#030712', padding: '10px 12px', borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🚚</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Compras / Proveedores</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc' }}>
                        {compras.length} órdenes registradas
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setJefeSeccion('reporte_vendedores')}
                    style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer', marginTop: 'auto' }}>
                    👨‍💼 Ver Reporte de Ventas por Vendedor
                  </button>
                </div>

              </div>

            </div>
          )}

          {/* OTRAS SECCIONES */}
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
                    <span style={{ fontWeight: 800, color: '#34d399' }}>C$ {(v.total || 0).toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{v.medioPago} · {(v.items || []).length} items</p>
                </div>
              ))}
            </div>
          )}

          {jefeSeccion === 'reporte_vendedores' && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px', color: '#38bdf8' }}>📊 Reporte Diario de Productos por Vendedor</p>
              {ventasHoy.length === 0 ? (
                <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '20px 0' }}>No hay ventas registradas el día de hoy.</p>
              ) : (
                (() => {
                  const porVendedor: Record<string, { totalMonto: number; totalUnidades: number; productos: Record<string, number> }> = {};
                  ventasHoy.forEach(v => {
                    const vendedor = v.vendedorNombre || 'Sin asignar';
                    if (!porVendedor[vendedor]) porVendedor[vendedor] = { totalMonto: 0, totalUnidades: 0, productos: {} };
                    porVendedor[vendedor].totalMonto += (v.total || 0);
                    (v.items || []).forEach((item: any) => {
                      const nombreProd = item.nombre || 'Producto';
                      const cant = item.cantidad || 1;
                      porVendedor[vendedor].totalUnidades += cant;
                      porVendedor[vendedor].productos[nombreProd] = (porVendedor[vendedor].productos[nombreProd] || 0) + cant;
                    });
                  });
                  return Object.entries(porVendedor).map(([nombreVendedor, data]) => (
                    <div key={nombreVendedor} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: 8, marginBottom: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>👨‍💼 {nombreVendedor}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#34d399' }}>C$ {data.totalMonto.toLocaleString()}</span>
                      </div>
                      {Object.entries(data.productos).map(([prod, cant], idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#d1d5db', padding: '4px 0' }}>
                          <span>• {prod}</span>
                          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{cant} un.</span>
                        </div>
                      ))}
                    </div>
                  ));
                })()
              )}
            </div>
          )}

          {jefeSeccion === 'inventario' && <ProductosAdmin />}

          {jefeSeccion === 'creditos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>💳 Créditos y Fiados</p>
                <button onClick={() => setMostrarFormCredito(!mostrarFormCredito)} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {mostrarFormCredito ? 'Cerrar' : '➕ Nuevo Crédito'}
                </button>
              </div>

              {mostrarFormCredito && (
                <form onSubmit={guardarNuevoCredito} style={{ background: '#111827', border: '1px solid #4338ca', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input placeholder="Nombre del cliente" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 12 }} />
                  <input placeholder="Cédula" value={cedulaCliente} onChange={e => setCedulaCliente(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 12 }} />
                  <input placeholder="Artículo" value={articuloFiado} onChange={e => setArticuloFiado(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 12 }} />
                  <input type="number" placeholder="Precio Base (C$)" value={precioBaseArticulo} onChange={e => setPrecioBaseArticulo(e.target.value)} required style={{ background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 12 }} />
                  <button type="submit" style={{ background: '#059669', color: '#fff', border: 'none', padding: 10, borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>Guardar Crédito</button>
                </form>
              )}

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

          {jefeSeccion === 'cajas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>Turnos / Cierres de caja</p>
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

          {jefeSeccion === 'usuarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={registrarNuevoUsuarioSistema} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13, color: '#818cf8' }}>➕ Nuevo usuario</p>
                <input placeholder="Nombre" value={nuevoNombreUsuario} onChange={e => setNuevoNombreUsuario(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input type="email" placeholder="Correo" value={nuevoEmailUsuario} onChange={e => setNuevoEmailUsuario(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <input type="password" placeholder="Contraseña" value={nuevoPassUsuario} onChange={e => setNuevoPassUsuario(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }} />
                <select value={nuevoRolUsuario} onChange={e => setNuevoRolUsuario(e.target.value)} style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13 }}>
                  <option value="vendedor">Vendedor</option>
                  <option value="bodega">Bodega</option>
                  <option value="chofer">Chofer</option>
                  <option value="cajero">Cajero</option>
                  <option value="jefe">Jefe</option>
                </select>
                <button type="submit" disabled={guardandoUsuario} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Registrar usuario</button>
              </form>
            </div>
          )}

          {jefeSeccion === 'permisos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Gestión de permisos del personal.</p>
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

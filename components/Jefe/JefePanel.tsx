'use client';

import React, { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
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
  const [porcentajesPlazos] = useState<Record<number, number>>({ 3: 5, 6: 10, 9: 15, 12: 20, 18: 30, 24: 40, 30: 50, 36: 60 });
  const [fotoCedulaFrontal, setFotoCedulaFrontal] = useState<string | null>(null);
  const [fotoCedulaTrasera, setFotoCedulaTrasera] = useState<string | null>(null);
  const [fotosExtra, setFotosExtra] = useState<string[]>([]);
  const [cargandoCredito, setCargandoCredito] = useState(false);
  const [contratoImpresionData, setContratoImpresionData] = useState<any>(null);

  const [nuevoEmailUsuario, setNuevoEmailUsuario] = useState('');
  const [nuevoPassUsuario, setNuevoPassUsuario] = useState('');
  const [nuevoNombreUsuario, setNuevoNombreUsuario] = useState('');
  const [nuevoRolUsuario, setNuevoRolUsuario] = useState('vendedor');
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

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
    else if (tipo === 'extra' && fotosExtra.length < 2) setFotosExtra([...fotosExtra, base64Comprimida]);
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

  useEffect(() => { cargarCreditosGlobales(); }, []);

  const precioBaseNum = parseFloat(precioBaseArticulo) || 0;
  const primaNum = parseFloat(primaMonto) || 0;
  const porcentajeRecargo = porcentajesPlazos[plazoSeleccionado] || 0;
  const subtotalFinanciar = Math.max(0, precioBaseNum - primaNum);
  const montoConRecargo = subtotalFinanciar * (1 + porcentajeRecargo / 100);
  const cuotaMensualCalculada = plazoSeleccionado > 0 ? (montoConRecargo / plazoSeleccionado).toFixed(2) : '0';

  const guardarNuevoCredito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreCliente.trim() || precioBaseNum <= 0) {
      alert('Ingrese nombre y precio válido.');
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
        fotoCedulaFrontal, fotoCedulaTrasera, fotosExtra,
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
        vendedorNombre: user.nombre || 'Jefe',
        medioPago: 'Crédito',
        items: [{ nombre: articuloFiado.trim() || 'Artículo', cantidad: 1, precio: precioBaseNum }],
        fecha: serverTimestamp()
      });
      setContratoImpresionData({ id: docRef.id, ...dataCredito });
      alert('¡Crédito registrado con éxito!');
      setNombreCliente(''); setCedulaCliente(''); setTelefonoCliente(''); setDireccionCliente('');
      setFiadorCliente(''); setArticuloFiado(''); setPrecioBaseArticulo(''); setPrimaMonto('');
      setFotoCedulaFrontal(null); setFotoCedulaTrasera(null); setFotosExtra([]);
      setMostrarFormCredito(false);
      cargarCreditosGlobales();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setCargandoCredito(false);
    }
  };

  const imprimirContrato = (tipoFormato: 'carta' | 'legal') => {
    const datos = contratoImpresionData || creditosGlobales[0];
    if (!datos) { alert('No hay datos.'); return; }
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    ventana.document.write(`<html><head><title>Contrato</title></head><body style="font-family:Arial;padding:20px;"><h2>Contrato - Tienda-SS</h2><p><b>Cliente:</b> ${datos.nombreCliente}</p><p><b>Artículo:</b> ${datos.articulo}</p><p><b>Debe:</b> C$ ${datos.saldoPendiente}</p></body></html>`);
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

      {menuAbierto && <div onClick={() => setMenuAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30 }} />}

      <div style={{ flex: 1, minHeight: '100vh' }}>
        <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
          <button onClick={() => setMenuAbierto(true)} style={{ background: '#1f2937', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: 10, fontSize: 18, cursor: 'pointer' }}>☰</button>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              {jefeSeccion === 'proximamente' ? proximamenteNombre : MENU_ITEMS.find(m => m.key === jefeSeccion)?.label || 'Panel'}
            </h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Panel Ejecutivo · Vista General</p>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
          
          {/* PANTALLA DE INICIO REFORZADA CON GRÁFICAS PROFESIONALES */}
          {jefeSeccion === 'inicio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* Tarjetas Superiores Estilo SaaS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                
                <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', borderRadius: 16, padding: 16, color: '#fff', boxShadow: '0 10px 15px -3px rgba(79,70,229,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Ventas del Día</span>
                    <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 8, fontSize: 11 }}>Hoy</span>
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>C$ {totalHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>{ticketsHoy} transacciones registradas</p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #ec4899 0%, #d946ef 100%)', borderRadius: 16, padding: 16, color: '#fff', boxShadow: '0 10px 15px -3px rgba(236,72,153,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Utilidad Estimada</span>
                    <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 8, fontSize: 11 }}>Margen</span>
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>C$ {utilidadHoy.toLocaleString()}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>Ganancia neta calculada</p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)', borderRadius: 16, padding: 16, color: '#fff', boxShadow: '0 10px 15px -3px rgba(14,165,233,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Inventario Activo</span>
                    <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 8, fontSize: 11 }}>Stock</span>
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>{productos.length} items</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>{stockBajo.length > 0 ? `⚠️ ${stockBajo.length} en stock bajo` : 'Inventario óptimo'}</p>
                </div>

                <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: 16, padding: 16, color: '#fff', boxShadow: '0 10px 15px -3px rgba(245,158,11,0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Créditos / Fiados</span>
                    <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 8, fontSize: 11 }}>Cartera</span>
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>{creditosGlobales.length}</p>
                  <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>Financiamientos activos</p>
                </div>

              </div>

              {/* Fila de Gráficos Principales (Línea degradada estilo SaaS y Barras Verticales) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
                
                {/* Gráfica de Línea de Tendencia con Área Degrada */}
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 800, margin: 0, fontSize: 14, color: '#f3f4f6' }}>Tendencia de Crecimiento</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Flujo de ventas semestral</p>
                    </div>
                    <span style={{ fontSize: 11, background: '#1e1b4b', color: '#a5b4fc', padding: '4px 8px', borderRadius: 8, fontWeight: 700 }}>Últimos 6m</span>
                  </div>
                  
                  {/* SVG Gráfico de Línea Curva con Área Degradada */}
                  <div style={{ height: 130, width: '100%', position: 'relative', marginTop: 10 }}>
                    <svg viewBox="0 0 500 150" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="colorDegrade" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Área bajo la curva */}
                      <path 
                        d="M 0,130 Q 100,40 200,90 T 400,30 T 500,60 L 500,150 L 0,150 Z" 
                        fill="url(#colorDegrade)" 
                      />
                      {/* Línea principal */}
                      <path 
                        d="M 0,130 Q 100,40 200,90 T 400,30 T 500,60" 
                        fill="none" 
                        stroke="#a855f7" 
                        strokeWidth="3" 
                      />
                      {/* Puntos en los nodos */}
                      {ventasPorMes.map((m, i) => {
                        const cx = (i / (ventasPorMes.length - 1)) * 500;
                        const cy = 130 - (m.total / maxMes) * 90;
                        return (
                          <g key={i}>
                            <circle cx={cx} cy={cy} r="4" fill="#c084fc" stroke="#111827" strokeWidth="2" />
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
                    {ventasPorMes.map((m, i) => <span key={i}>{m.label}</span>)}
                  </div>
                </div>

                {/* Gráfica de Barras Verticales de Ingresos */}
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 800, margin: 0, fontSize: 14, color: '#f3f4f6' }}>Ingresos por Mes</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Comparativa monetaria</p>
                    </div>
                    <span style={{ fontSize: 11, background: '#064e3b', color: '#34d399', padding: '4px 8px', borderRadius: 8, fontWeight: 700 }}>Activo</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130, paddingBottom: 4 }}>
                    {ventasPorMes.map((m, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ 
                          width: '100%', 
                          background: m.total === maxMes ? 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)' : '#374151', 
                          borderRadius: '6px 6px 0 0', 
                          height: `${Math.max(8, (m.total / maxMes) * 110)}px`,
                          transition: 'height 0.3s ease'
                        }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#d1d5db' }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Fila Inferior: Operatividad de Módulos y Distribución de Inventario */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
                
                {/* Estado de Operatividad y Módulos */}
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontWeight: 800, margin: 0, fontSize: 14, color: '#f3f4f6' }}>⚡ Operatividad General de Módulos</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#030712', padding: '10px 12px', borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>💰</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Cajas / Turnos</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399' }}>Operando con normalidad</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#030712', padding: '10px 12px', borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🧑‍💼</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Equipo de Trabajo</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8' }}>{usuariosSistema.length} cuentas en sistema</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#030712', padding: '10px 12px', borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>🚚</span>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Logística y Compras</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc' }}>{compras.length} registros</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setJefeSeccion('reporte_vendedores')}
                    style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer', marginTop: 'auto' }}>
                    👨‍💼 Ver Reporte Detallado por Vendedor
                  </button>
                </div>

                {/* Resumen de Alertas y Stock de Inventario */}
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontWeight: 800, margin: 0, fontSize: 14, color: '#f3f4f6' }}>📦 Estado del Inventario y Alertas</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ background: '#030712', padding: 12, borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        <span>Productos con Stock Óptimo</span>
                        <span style={{ color: '#34d399' }}>{productos.length - stockBajo.length} items</span>
                      </div>
                      <div style={{ width: '100%', background: '#1f2937', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${productos.length ? ((productos.length - stockBajo.length) / productos.length) * 100 : 100}%`, background: '#34d399', height: '100%' }} />
                      </div>
                    </div>

                    <div style={{ background: '#030712', padding: 12, borderRadius: 10, border: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        <span>Productos con Stock Crítico (Bajo)</span>
                        <span style={{ color: '#f87171' }}>{stockBajo.length} items</span>
                      </div>
                      <div style={{ width: '100%', background: '#1f2937', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${productos.length ? (stockBajo.length / productos.length) * 100 : 0}%`, background: '#f87171', height: '100%' }} />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setJefeSeccion('inventario')}
                    style={{ background: '#1f2937', color: '#38bdf8', border: 'none', padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer', marginTop: 'auto' }}>
                    📦 Gestionar Módulo de Inventario
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

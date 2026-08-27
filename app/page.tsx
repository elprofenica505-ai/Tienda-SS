'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USUARIOS = [
  { id: 'u1', usuario: 'jefe',   password: '1234', nombre: 'Dueño',  rol: 'jefe' as const },
  { id: 'u2', usuario: 'carlos', password: '1234', nombre: 'Carlos', rol: 'vendedor' as const },
  { id: 'u3', usuario: 'maria',  password: '1234', nombre: 'María',  rol: 'vendedor' as const },
  { id: 'u4', usuario: 'luis',   password: '1234', nombre: 'Luis',   rol: 'bodega' as const },
  { id: 'u5', usuario: 'pedro',  password: '1234', nombre: 'Pedro',  rol: 'chofer' as const },
];

type Rol = 'jefe' | 'vendedor' | 'bodega' | 'chofer';
type Vista =
  | 'login' | 'jefe_home' | 'jefe_ventas' | 'jefe_inventario'
  | 'vendedor_home' | 'vendedor_ticket'
  | 'bodega_home' | 'bodega_ajuste'
  | 'chofer_home';

interface Usuario { id: string; usuario: string; nombre: string; rol: Rol; }
interface Producto {
  id: string; codigo: string; nombre: string; stock: number; stockMinimo: number;
  precio: number; costo: number; imagen: string; categoria: string;
}
interface CarritoItem extends Producto { cantidad: number; }
interface Venta {
  id: string; total: number; items: any[]; fecha: any; estado: string;
  medioPago: string; vendedorId: string; vendedorNombre: string;
  recibido?: number; vuelto?: number;
}
interface Entrega {
  id: number; cliente: string; direccion: string; productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado'; choferId: string;
}

export default function TiendaSS() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [vista, setVista] = useState<Vista>('login');
  const [historial, setHistorial] = useState<Vista[]>([]);
  const [cargando, setCargando] = useState(true);

  const [userInput, setUserInput] = useState('');
  const [passInput, setPassInput] = useState('');

  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);

  // Vendedor
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [medioPago, setMedioPago] = useState<'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Mixto'>('Efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null);

  // Bodega
  const [nombreProd, setNombreProd] = useState('');
  const [stockIni, setStockIni] = useState('');
  const [precioProd, setPrecioProd] = useState('');
  const [stockMin, setStockMin] = useState('5');
  const [busquedaBod, setBusquedaBod] = useState('');
  const [ajusteId, setAjusteId] = useState<string | null>(null);
  const [ajusteCant, setAjusteCant] = useState('');
  const [ajusteTipo, setAjusteTipo] = useState<'entrada' | 'salida' | 'merma'>('entrada');

  const [entregas, setEntregas] = useState<Entrega[]>([
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick', productos: 'TV Samsung 55"', estado: 'Pendiente', choferId: 'u5' },
    { id: 2, cliente: 'Ana López', direccion: 'Villa El Carmen', productos: 'Cama King', estado: 'En Ruta', choferId: 'u5' },
    { id: 3, cliente: 'Luis Mora', direccion: 'Centroamérica', productos: 'Celular Infinix', estado: 'Entregado', choferId: 'u5' },
  ]);

  const irA = (v: Vista) => {
    setHistorial(h => [...h, vista]);
    setVista(v);
  };
  const volver = () => {
    if (historial.length === 0) {
      if (user?.rol === 'jefe') setVista('jefe_home');
      else if (user?.rol === 'vendedor') setVista('vendedor_home');
      else if (user?.rol === 'bodega') setVista('bodega_home');
      else if (user?.rol === 'chofer') setVista('chofer_home');
      else setVista('login');
      return;
    }
    const prev = historial[historial.length - 1];
    setHistorial(h => h.slice(0, -1));
    setVista(prev);
  };

  useEffect(() => {
    (async () => {
      try {
        const ps = await getDocs(collection(db, 'productos'));
        const lista: Producto[] = [];
        ps.forEach(d => {
          const x = d.data();
          lista.push({
            id: d.id,
            codigo: x.codigo || '',
            nombre: x.nombre || '',
            stock: x.stock || 0,
            stockMinimo: x.stockMinimo ?? 5,
            precio: x.precio || 0,
            costo: x.costo || 0,
            imagen: x.imagen || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=300',
            categoria: x.categoria || 'Otros',
          });
        });
        setProductos(lista);

        const vs = await getDocs(collection(db, 'ventas'));
        const lv: Venta[] = [];
        vs.forEach(d => lv.push({ id: d.id, ...d.data() } as Venta));
        setVentas(lv);
      } catch (e) {
        console.error(e);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const hoy = new Date();
  const esHoy = (f: any) => {
    if (!f) return false;
    const d = f.toDate ? f.toDate() : new Date(f);
    return d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  };
  const ventasHoy = ventas.filter(v => esHoy(v.fecha));
  const totalHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
  const ticketsHoy = ventasHoy.length;
  const ticketProm = ticketsHoy ? totalHoy / ticketsHoy : 0;
  const stockBajo = productos.filter(p => p.stock <= p.stockMinimo);

  const porVendedor: { nombre: string; total: number; tickets: number }[] = [];
  const mapV: Record<string, { nombre: string; total: number; tickets: number }> = {};
  ventasHoy.forEach(v => {
    const k = v.vendedorId || 'x';
    if (!mapV[k]) mapV[k] = { nombre: v.vendedorNombre || 'Sin nombre', total: 0, tickets: 0 };
    mapV[k].total += v.total || 0;
    mapV[k].tickets++;
  });
  Object.values(mapV).sort((a, b) => b.total - a.total).forEach(x => porVendedor.push(x));

  const porPago: Record<string, number> = {};
  ventasHoy.forEach(v => {
    const m = v.medioPago || 'Otros';
    porPago[m] = (porPago[m] || 0) + (v.total || 0);
  });

  const login = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const u = USUARIOS.find(x => x.usuario === userInput.toLowerCase().trim() && x.password === passInput);
    if (!u) { alert('Usuario o clave incorrectos'); return; }
    const usr: Usuario = { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
    setUser(usr);
    setHistorial([]);
    if (u.rol === 'jefe') setVista('jefe_home');
    else if (u.rol === 'vendedor') setVista('vendedor_home');
    else if (u.rol === 'bodega') setVista('bodega_home');
    else setVista('chofer_home');
    setUserInput(''); setPassInput('');
  };

  const loginRapido = (usuario: string) => {
    const u = USUARIOS.find(x => x.usuario === usuario)!;
    setUser({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });
    setHistorial([]);
    if (u.rol === 'jefe') setVista('jefe_home');
    else if (u.rol === 'vendedor') setVista('vendedor_home');
    else if (u.rol === 'bodega') setVista('bodega_home');
    else setVista('chofer_home');
  };

  const cerrar = () => {
    setUser(null);
    setVista('login');
    setHistorial([]);
    setCarrito([]);
    setUltimaVenta(null);
  };

  const agregarCarrito = (p: Producto) => {
    if (p.stock <= 0) { alert('Sin stock'); return; }
    const ex = carrito.find(c => c.id === p.id);
    if (ex) {
      if (ex.cantidad >= p.stock) { alert('Stock máximo'); return; }
      setCarrito(carrito.map(c => c.id === p.id ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else setCarrito([...carrito, { ...p, cantidad: 1 }]);
  };

  const cantCarrito = (id: string, d: number) => {
    const base = productos.find(p => p.id === id);
    setCarrito(carrito.map(c => {
      if (c.id !== id) return c;
      const n = c.cantidad + d;
      if (n <= 0) return null as any;
      if (base && n > base.stock) { alert('Stock máximo'); return c; }
      return { ...c, cantidad: n };
    }).filter(Boolean));
  };

  const totalCarrito = carrito.reduce((s, c) => s + c.precio * c.cantidad, 0);
  const vuelto = medioPago === 'Efectivo' && montoRecibido
    ? Math.max(0, parseFloat(montoRecibido) - totalCarrito) : 0;

  const cobrar = async () => {
    if (!user || carrito.length === 0) return;
    if (medioPago === 'Efectivo' && (!montoRecibido || parseFloat(montoRecibido) < totalCarrito)) {
      alert('El monto recibido debe ser mayor o igual al total');
      return;
    }
    try {
      const data = {
        items: carrito.map(c => ({
          id: c.id, codigo: c.codigo, nombre: c.nombre,
          cantidad: c.cantidad, precio: c.precio, subtotal: c.precio * c.cantidad
        })),
        total: totalCarrito,
        fecha: serverTimestamp(),
        estado: 'Completada',
        medioPago,
        vendedorId: user.id,
        vendedorNombre: user.nombre,
        recibido: medioPago === 'Efectivo' ? parseFloat(montoRecibido) : totalCarrito,
        vuelto: medioPago === 'Efectivo' ? vuelto : 0,
      };
      const ref = await addDoc(collection(db, 'ventas'), data);

      for (const c of carrito) {
        await updateDoc(doc(db, 'productos', c.id), {
          stock: Math.max(0, c.stock - c.cantidad)
        });
      }
      setProductos(productos.map(p => {
        const c = carrito.find(x => x.id === p.id);
        return c ? { ...p, stock: Math.max(0, p.stock - c.cantidad) } : p;
      }));

      const vs = await getDocs(collection(db, 'ventas'));
      const lv: Venta[] = [];
      vs.forEach(d => lv.push({ id: d.id, ...d.data() } as Venta));
      setVentas(lv);

      const ticket: Venta = { id: ref.id, ...data, fecha: new Date() } as any;
      setUltimaVenta(ticket);
      setCarrito([]);
      setMontoRecibido('');
      irA('vendedor_ticket');
    } catch (e) {
      console.error(e);
      alert('Error al cobrar');
    }
  };

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProd || !stockIni) { alert('Nombre y stock obligatorios'); return; }
    try {
      const data = {
        codigo: `PROD-${Math.floor(1000 + Math.random() * 9000)}`,
        nombre: nombreProd.trim(),
        stock: parseInt(stockIni) || 0,
        stockMinimo: parseInt(stockMin) || 5,
        precio: parseFloat(precioProd) || 0,
        costo: 0,
        categoria: 'Otros',
        imagen: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=300',
        creadoPor: user?.nombre,
        creadoEn: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'productos'), data);
      setProductos([{ id: ref.id, ...data } as Producto, ...productos]);
      setNombreProd(''); setStockIni(''); setPrecioProd(''); setStockMin('5');
      alert('Producto agregado');
    } catch (e) {
      console.error(e);
      alert('Error');
    }
  };

  const aplicarAjuste = async () => {
    if (!ajusteId || !ajusteCant) return;
    const p = productos.find(x => x.id === ajusteId);
    if (!p) return;
    const cant = parseInt(ajusteCant);
    if (isNaN(cant) || cant <= 0) { alert('Cantidad inválida'); return; }
    let ns = p.stock;
    if (ajusteTipo === 'entrada') ns += cant;
    else ns = Math.max(0, p.stock - cant);
    try {
      await updateDoc(doc(db, 'productos', ajusteId), {
        stock: ns,
        actualizadoPor: user?.nombre,
        actualizadoEn: serverTimestamp(),
      });
      setProductos(productos.map(x => x.id === ajusteId ? { ...x, stock: ns } : x));
      setAjusteId(null); setAjusteCant('');
      alert('Stock actualizado');
    } catch (e) {
      console.error(e);
      alert('Error');
    }
  };

  const btnVolver = (
    <button onClick={volver} style={{
      background: '#1f2937', border: '1px solid #374151', borderRadius: 10,
      padding: '8px 12px', color: '#d1d5db', fontWeight: 600, fontSize: 12, cursor: 'pointer'
    }}>← Volver</button>
  );

  const btnCerrar = (
    <button onClick={cerrar} style={{
      background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
      padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer'
    }}>Cerrar</button>
  );

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div><p>Cargando Tienda-SS...</p></div>
      </div>
    );
  }

  // ========== LOGIN ==========
  if (vista === 'login' || !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#111827', border: '1px solid #1f2937', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 50, height: 50, background: '#1f2937', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#facc15', fontSize: 24, border: '1px solid #374151', margin: '0 auto 8px' }}>⚡</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Tienda-SS</h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Sistema de control · Demo</p>
          </div>
          <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Usuario" value={userInput} onChange={e => setUserInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }} />
            <input type="password" placeholder="Contraseña" value={passInput} onChange={e => setPassInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }} />
            <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Iniciar sesión
            </button>
          </form>
          <div style={{ borderTop: '1px solid #1f2937', paddingTop: 14 }}>
            <p style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', marginBottom: 8 }}>ACCESOS RÁPIDOS · clave 1234</p>
            {USUARIOS.map(u => (
              <button key={u.id} onClick={() => loginRapido(u.usuario)}
                style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: '10px 12px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#fff' }}>{u.nombre}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{u.usuario} · {u.rol}</span>
                </span>
                <span style={{ color: '#818cf8', fontSize: 12 }}>Entrar →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ========== JEFE HOME ==========
  if (vista === 'jefe_home') {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 16, fontWeight: 800, color: '#f87171', margin: 0 }}>⚡ Centro de control</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            {btnCerrar}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Ventas hoy</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#34d399', margin: '4px 0 0' }}>${totalHoy.toLocaleString()}</p>
            </div>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Tickets</p>
              <p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>{ticketsHoy}</p>
            </div>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Ticket prom.</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#818cf8', margin: '4px 0 0' }}>${ticketProm.toFixed(0)}</p>
            </div>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Stock bajo</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: stockBajo.length ? '#f87171' : '#34d399', margin: '4px 0 0' }}>{stockBajo.length}</p>
            </div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>👥 Ventas por vendedor</p>
            {porVendedor.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af' }}>Sin ventas hoy. Entra como Carlos o María y vende.</p>
            ) : porVendedor.map((v, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{v.nombre}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#9ca3af' }}>{v.tickets} ticket(s)</span>
                </div>
                <span style={{ fontWeight: 800, color: '#34d399' }}>${v.total.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>💳 Por forma de pago</p>
            {Object.keys(porPago).length === 0 ? (
              <p style={{ fontSize: 12, color: '#9ca3af' }}>Sin datos</p>
            ) : Object.entries(porPago).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                <span>{k}</span>
                <span style={{ fontWeight: 700, color: '#818cf8' }}>${v.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {stockBajo.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#f87171', margin: '0 0 8px' }}>⚠️ Stock bajo</p>
              {stockBajo.slice(0, 5).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                  <span>{p.nombre}</span>
                  <span style={{ color: '#f87171', fontWeight: 700 }}>{p.stock}/{p.stockMinimo}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => irA('jefe_ventas')} style={{ background: '#0c4a6e', border: '1px solid #0ea5e9', borderRadius: 12, padding: 14, color: '#7dd3fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🧾 Ver ventas
            </button>
            <button onClick={() => irA('jefe_inventario')} style={{ background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: 12, padding: 14, color: '#a5b4fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📦 Inventario
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== JEFE VENTAS ==========
  if (vista === 'jefe_ventas') {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🧾 Ventas del día</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{ticketsHoy} tickets · ${totalHoy.toLocaleString()}</p>
              </div>
            </div>
            {btnCerrar}
          </div>
          {ventasHoy.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No hay ventas hoy</p>
          ) : ventasHoy.slice().reverse().map(v => (
            <div key={v.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>{v.vendedorNombre || '—'}</span>
                <span style={{ fontWeight: 800, color: '#34d399' }}>${(v.total || 0).toLocaleString()}</span>
              </div>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                {v.medioPago} · {(v.items || []).length} producto(s)
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== JEFE INVENTARIO ==========
  if (vista === 'jefe_inventario') {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📦 Inventario</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{productos.length} productos</p>
              </div>
            </div>
            {btnCerrar}
          </div>
          {productos.map(p => (
            <div key={p.id} style={{ background: '#111827', border: `1px solid ${p.stock <= p.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: 700, margin: 0 }}>{p.nombre}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>${p.precio} · Mín {p.stockMinimo}</p>
              </div>
              <span style={{ fontWeight: 800, color: p.stock <= p.stockMinimo ? '#f87171' : '#34d399' }}>{p.stock} un</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== VENDEDOR HOME ==========
  if (vista === 'vendedor_home') {
    const cat = productos.filter(p =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busqueda.toLowerCase())
    );
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif', paddingBottom: 40 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', margin: 0 }}>🛒 Punto de venta</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            {btnCerrar}
          </div>

          {carrito.length > 0 && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>🧾 Carrito</p>
              {carrito.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span>{c.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => cantCarrito(c.id, -1)} style={{ background: '#374151', color: '#fff', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>−</button>
                    <span style={{ fontWeight: 700 }}>{c.cantidad}</span>
                    <button onClick={() => cantCarrito(c.id, 1)} style={{ background: '#4f46e5', color: '#fff', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>+</button>
                    <span style={{ color: '#34d399', minWidth: 50, textAlign: 'right' }}>${(c.precio * c.cantidad).toFixed(0)}</span>
                  </div>
                </div>
              ))}

              <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10 }}>
                <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 10px' }}>Total: ${totalCarrito.toFixed(0)}</p>

                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>Forma de pago</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {(['Efectivo', 'Tarjeta', 'Transferencia', 'Mixto'] as const).map(m => (
                    <button key={m} onClick={() => setMedioPago(m)}
                      style={{
                        padding: 8, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: medioPago === m ? '#4f46e5' : '#1f2937', color: '#fff'
                      }}>{m}</button>
                  ))}
                </div>

                {medioPago === 'Efectivo' && (
                  <div style={{ marginBottom: 10 }}>
                    <input type="number" placeholder="Monto recibido" value={montoRecibido} onChange={e => setMontoRecibido(e.target.value)}
                      style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    {montoRecibido && parseFloat(montoRecibido) >= totalCarrito && (
                      <p style={{ fontSize: 13, color: '#34d399', margin: '6px 0 0' }}>Vuelto: ${vuelto.toFixed(0)}</p>
                    )}
                  </div>
                )}

                <button onClick={cobrar} style={{ width: '100%', background: '#10b981', color: '#030712', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                  💳 Cobrar
                </button>
              </div>
            </div>
          )}

          <input placeholder="🔍 Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }} />

          {cat.map(p => (
            <div key={p.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13 }}>{p.nombre}</p>
                <p style={{ fontSize: 12, color: '#34d399', margin: '2px 0 0' }}>${p.precio} · Stock {p.stock}</p>
              </div>
              <button onClick={() => agregarCarrito(p)} disabled={p.stock <= 0}
                style={{ background: p.stock <= 0 ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: p.stock <= 0 ? 'not-allowed' : 'pointer' }}>
                ➕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== TICKET ==========
  if (vista === 'vendedor_ticket' && ultimaVenta) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {btnVolver}
            {btnCerrar}
          </div>
          <div style={{ background: '#fff', color: '#111', borderRadius: 16, padding: 20 }}>
            <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, margin: '0 0 4px' }}>Tienda-SS</p>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#666', margin: '0 0 14px' }}>Comprobante de venta</p>
            <p style={{ fontSize: 12, margin: '0 0 4px' }}>Vendedor: <b>{ultimaVenta.vendedorNombre}</b></p>
            <p style={{ fontSize: 12, margin: '0 0 12px' }}>Pago: <b>{ultimaVenta.medioPago}</b></p>
            <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '10px 0', marginBottom: 10 }}>
              {(ultimaVenta.items || []).map((it: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>{it.nombre} x{it.cantidad}</span>
                  <span>${it.subtotal}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>TOTAL</span>
              <span>${ultimaVenta.total}</span>
            </div>
            {ultimaVenta.medioPago === 'Efectivo' && (
              <>
                <p style={{ fontSize: 12, margin: '8px 0 0' }}>Recibido: ${ultimaVenta.recibido}</p>
                <p style={{ fontSize: 12, margin: 0 }}>Vuelto: ${ultimaVenta.vuelto}</p>
              </>
            )}
            <p style={{ textAlign: 'center', fontSize: 10, color: '#999', marginTop: 16 }}>¡Gracias por su compra!</p>
          </div>
          <button onClick={() => { setUltimaVenta(null); setVista('vendedor_home'); setHistorial([]); }}
            style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            Nueva venta
          </button>
        </div>
      </div>
    );
  }

  // ========== BODEGA ==========
  if (vista === 'bodega_home') {
    const filtrados = productos.filter(p =>
      p.nombre.toLowerCase().includes(busquedaBod.toLowerCase())
    );
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📦 Bodega</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            {btnCerrar}
          </div>

          <form onSubmit={guardarProducto} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Nuevo producto</p>
            <input placeholder="Nombre *" value={nombreProd} onChange={e => setNombreProd(e.target.value)} required
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Stock *" value={stockIni} onChange={e => setStockIni(e.target.value)} required
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
              <input type="number" placeholder="Mín" value={stockMin} onChange={e => setStockMin(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
              <input type="number" placeholder="Precio" value={precioProd} onChange={e => setPrecioProd(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
            </div>
            <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Agregar</button>
          </form>

          <input placeholder="🔍 Buscar..." value={busquedaBod} onChange={e => setBusquedaBod(e.target.value)}
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />

          {filtrados.map(p => (
            <div key={p.id} style={{ background: '#111827', border: `1px solid ${p.stock <= p.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 700, margin: 0 }}>{p.nombre}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>${p.precio} · Mín {p.stockMinimo}</p>
                </div>
                <span style={{ fontWeight: 800, color: p.stock <= p.stockMinimo ? '#f87171' : '#34d399' }}>{p.stock}</span>
              </div>
              <button onClick={() => { setAjusteId(p.id); setAjusteCant(''); }}
                style={{ marginTop: 8, width: '100%', background: '#064e3b', color: '#6ee7b7', border: 'none', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Ajustar stock
              </button>
              {ajusteId === p.id && (
                <div style={{ marginTop: 8, padding: 10, background: '#030712', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['entrada', 'salida', 'merma'] as const).map(t => (
                      <button key={t} onClick={() => setAjusteTipo(t)}
                        style={{ flex: 1, padding: 6, borderRadius: 6, border: 'none', fontSize: 11, cursor: 'pointer', background: ajusteTipo === t ? '#4f46e5' : '#1f2937', color: '#fff' }}>
                        {t === 'entrada' ? 'Entrada' : t === 'salida' ? 'Salida' : 'Merma'}
                      </button>
                    ))}
                  </div>
                  <input type="number" placeholder="Cantidad" value={ajusteCant} onChange={e => setAjusteCant(e.target.value)}
                    style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 8, color: '#fff', fontSize: 13, outline: 'none' }} />
                  <button onClick={aplicarAjuste} style={{ background: '#059669', color: '#fff', border: 'none', padding: 8, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== CHOFER ==========
  if (vista === 'chofer_home') {
    const mis = entregas.filter(e => e.choferId === user.id);
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, color: '#facc15', margin: 0 }}>🚚 Mis entregas</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            {btnCerrar}
          </div>
          {mis.map(e => (
            <div key={e.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontWeight: 700, margin: 0 }}>{e.cliente}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>{e.direccion}</p>
                  <p style={{ fontSize: 12, margin: 0 }}>{e.productos}</p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, height: 'fit-content',
                  background: e.estado === 'Pendiente' ? 'rgba(245,158,11,0.15)' : e.estado === 'En Ruta' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                  color: e.estado === 'Pendiente' ? '#fbbf24' : e.estado === 'En Ruta' ? '#60a5fa' : '#34d399'
                }}>{e.estado}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEntregas(entregas.map(x => x.id === e.id ? { ...x, estado: 'En Ruta' } : x))}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>En Ruta</button>
                <button onClick={() => setEntregas(entregas.map(x => x.id === e.id ? { ...x, estado: 'Entregado' } : x))}
                  style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Entregado</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

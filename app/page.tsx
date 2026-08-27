'use client';
import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ========== USUARIOS DEMO ==========
const USUARIOS_DEMO = [
  { id: 'u1', usuario: 'jefe',   password: '1234', nombre: 'Dueño',   rol: 'jefe' },
  { id: 'u2', usuario: 'carlos', password: '1234', nombre: 'Carlos',  rol: 'vendedor' },
  { id: 'u3', usuario: 'maria',  password: '1234', nombre: 'María',   rol: 'vendedor' },
  { id: 'u4', usuario: 'luis',   password: '1234', nombre: 'Luis',    rol: 'bodega' },
  { id: 'u5', usuario: 'pedro',  password: '1234', nombre: 'Pedro',   rol: 'chofer' },
];

interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  rol: 'jefe' | 'vendedor' | 'bodega' | 'chofer';
}

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  modelo: string;
  categoria: string;
  stock: number;
  stockMinimo: number;
  precio: number;
  costo: number;
  imagen: string;
}

interface CarritoItem extends Producto {
  cantidadVenta: number;
}

interface Venta {
  id: string;
  total: number;
  items: any[];
  fecha: any;
  estado: string;
  medioPago?: string;
  vendedorId?: string;
  vendedorNombre?: string;
}

interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
  choferId?: string;
  choferNombre?: string;
}

export default function TiendaSSApp() {
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // Login
  const [usuarioInput, setUsuarioInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Datos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);

  // Bodega
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [categoria, setCategoria] = useState('Electrodomésticos');
  const [stockInicial, setStockInicial] = useState('');
  const [stockMinimo, setStockMinimo] = useState('5');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busquedaBodega, setBusquedaBodega] = useState('');
  const [filtroStockBajo, setFiltroStockBajo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ajustandoId, setAjustandoId] = useState<string | null>(null);
  const [ajusteTipo, setAjusteTipo] = useState<'entrada' | 'salida' | 'correccion'>('entrada');
  const [ajusteCantidad, setAjusteCantidad] = useState('');
  const [mostrarMasOpciones, setMostrarMasOpciones] = useState(false);

  // Vendedor
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [busquedaVendedor, setBusquedaVendedor] = useState('');
  const [ventaExitosa, setVentaExitosa] = useState(false);

  // Chofer
  const [entregas, setEntregas] = useState<Entrega[]>([
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick', productos: 'Smart TV 55"', estado: 'Pendiente', choferId: 'u5', choferNombre: 'Pedro' },
    { id: 2, cliente: 'María Gómez', direccion: 'Villa El Carmen', productos: 'Cama King', estado: 'En Ruta', choferId: 'u5', choferNombre: 'Pedro' },
    { id: 3, cliente: 'Carlos Ruiz', direccion: 'Colonia Centroamérica', productos: 'Infinix Note 50', estado: 'Entregado', choferId: 'u5', choferNombre: 'Pedro' },
  ]);

  useEffect(() => {
    const cargar = async () => {
      try {
        const prodSnap = await getDocs(collection(db, 'productos'));
        const listaProd: Producto[] = [];
        prodSnap.forEach((d) => {
          const data = d.data();
          listaProd.push({
            id: d.id,
            codigo: data.codigo || '',
            nombre: data.nombre || '',
            marca: data.marca || 'Sin marca',
            modelo: data.modelo || '',
            categoria: data.categoria || 'Otros',
            stock: data.stock || 0,
            stockMinimo: data.stockMinimo ?? 5,
            precio: data.precio || 0,
            costo: data.costo || 0,
            imagen: data.imagen || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=300&q=80'
          });
        });
        setProductos(listaProd);

        const ventasSnap = await getDocs(collection(db, 'ventas'));
        const listaVentas: Venta[] = [];
        ventasSnap.forEach((d) => {
          listaVentas.push({ id: d.id, ...d.data() } as Venta);
        });
        setVentas(listaVentas);
      } catch (error) {
        console.error(error);
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, []);

  // Helpers de fecha
  const hoy = new Date();
  const esHoy = (fecha: any) => {
    if (!fecha) return false;
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  };

  const ventasHoy = ventas.filter(v => esHoy(v.fecha));
  const totalVentasHoy = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);
  const ticketsHoy = ventasHoy.length;
  const ticketPromedio = ticketsHoy > 0 ? totalVentasHoy / ticketsHoy : 0;
  const stockBajoLista = productos.filter(p => p.stock <= p.stockMinimo);

  // Ventas por vendedor (hoy)
  const ventasPorVendedor: { nombre: string; total: number; tickets: number }[] = [];
  const mapaVend: Record<string, { nombre: string; total: number; tickets: number }> = {};
  ventasHoy.forEach(v => {
    const key = v.vendedorId || 'sin';
    const nombre = v.vendedorNombre || 'Sin asignar';
    if (!mapaVend[key]) {
      mapaVend[key] = { nombre, total: 0, tickets: 0 };
    }
    mapaVend[key].total += v.total || 0;
    mapaVend[key].tickets += 1;
  });
  Object.values(mapaVend)
    .sort((a, b) => b.total - a.total)
    .forEach(v => ventasPorVendedor.push(v));

  // Top productos hoy
  const topProductosHoy: { nombre: string; cantidad: number; total: number }[] = [];
  const mapaTop: Record<string, { nombre: string; cantidad: number; total: number }> = {};
  ventasHoy.forEach(v => {
    (v.items || []).forEach((item: any) => {
      if (!mapaTop[item.nombre]) {
        mapaTop[item.nombre] = { nombre: item.nombre, cantidad: 0, total: 0 };
      }
      mapaTop[item.nombre].cantidad += item.cantidad || 0;
      mapaTop[item.nombre].total += item.subtotal || 0;
    });
  });
  Object.values(mapaTop).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5).forEach(p => topProductosHoy.push(p));

  // Login
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const found = USUARIOS_DEMO.find(
      u => u.usuario === usuarioInput.toLowerCase().trim() && u.password === passwordInput
    );
    if (found) {
      setUsuarioActual({
        id: found.id,
        usuario: found.usuario,
        nombre: found.nombre,
        rol: found.rol as any
      });
      setUsuarioInput('');
      setPasswordInput('');
    } else {
      alert('Usuario o contraseña incorrectos');
    }
  };

  const loginRapido = (user: string) => {
    const found = USUARIOS_DEMO.find(u => u.usuario === user);
    if (found) {
      setUsuarioActual({
        id: found.id,
        usuario: found.usuario,
        nombre: found.nombre,
        rol: found.rol as any
      });
    }
  };

  const cerrarSesion = () => {
    setUsuarioActual(null);
    setCarrito([]);
  };

  const handleCapturarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagenPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const limpiarFormulario = () => {
    setCodigo('');
    setNombre('');
    setMarca('');
    setStockInicial('');
    setStockMinimo('5');
    setPrecio('');
    setCosto('');
    setImagenPreview(null);
    setEditandoId(null);
    setMostrarMasOpciones(false);
  };

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || (!editandoId && !stockInicial)) {
      alert('Nombre y Stock son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      const codigoAuto = codigo.trim() || `PROD-${Math.floor(1000 + Math.random() * 9000)}`;
      const data: any = {
        codigo: codigoAuto,
        nombre: nombre.trim(),
        marca: marca.trim() || 'Sin marca',
        modelo: 'Estándar',
        categoria,
        stockMinimo: parseInt(stockMinimo, 10) || 5,
        precio: parseFloat(precio) || 0,
        costo: parseFloat(costo) || 0,
        imagen: imagenPreview || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=300&q=80',
        actualizadoEn: serverTimestamp(),
        actualizadoPor: usuarioActual?.nombre || 'Sistema'
      };

      if (editandoId) {
        await updateDoc(doc(db, 'productos', editandoId), data);
        setProductos(productos.map(p => p.id === editandoId ? { ...p, ...data } : p));
        alert('Producto actualizado');
      } else {
        data.stock = parseInt(stockInicial, 10) || 0;
        data.creadoEn = serverTimestamp();
        data.creadoPor = usuarioActual?.nombre || 'Sistema';
        const docRef = await addDoc(collection(db, 'productos'), data);
        setProductos([{ id: docRef.id, ...data } as Producto, ...productos]);
        alert('Producto agregado');
      }
      limpiarFormulario();
    } catch (error) {
      console.error(error);
      alert('Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const iniciarEdicion = (prod: Producto) => {
    setEditandoId(prod.id);
    setCodigo(prod.codigo);
    setNombre(prod.nombre);
    setMarca(prod.marca);
    setCategoria(prod.categoria);
    setStockMinimo(String(prod.stockMinimo));
    setPrecio(String(prod.precio));
    setCosto(String(prod.costo));
    setImagenPreview(prod.imagen);
    setMostrarMasOpciones(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const aplicarAjuste = async () => {
    if (!ajustandoId || !ajusteCantidad) return;
    const prod = productos.find(p => p.id === ajustandoId);
    if (!prod) return;
    const cantidad = parseInt(ajusteCantidad, 10);
    if (isNaN(cantidad) || cantidad <= 0) {
      alert('Cantidad inválida');
      return;
    }
    let nuevoStock = prod.stock;
    if (ajusteTipo === 'entrada') nuevoStock += cantidad;
    else if (ajusteTipo === 'salida') nuevoStock = Math.max(0, prod.stock - cantidad);
    else nuevoStock = cantidad;

    try {
      await updateDoc(doc(db, 'productos', ajustandoId), { 
        stock: nuevoStock,
        actualizadoPor: usuarioActual?.nombre || 'Sistema',
        actualizadoEn: serverTimestamp()
      });
      setProductos(productos.map(p => p.id === ajustandoId ? { ...p, stock: nuevoStock } : p));
      setAjustandoId(null);
      setAjusteCantidad('');
      alert('Stock actualizado');
    } catch (error) {
      console.error(error);
      alert('Error al ajustar');
    }
  };

  const actualizarStock = async (id: string, delta: number) => {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    const nuevoStock = Math.max(0, producto.stock + delta);
    try {
      await updateDoc(doc(db, 'productos', id), { stock: nuevoStock });
      setProductos(productos.map(p => p.id === id ? { ...p, stock: nuevoStock } : p));
    } catch (error) {
      console.error(error);
    }
  };

  const agregarAlCarrito = (prod: Producto) => {
    if (prod.stock <= 0) {
      alert('Sin stock');
      return;
    }
    const existe = carrito.find(item => item.id === prod.id);
    if (existe) {
      if (existe.cantidadVenta >= prod.stock) {
        alert('Stock máximo');
        return;
      }
      setCarrito(carrito.map(item => item.id === prod.id ? { ...item, cantidadVenta: item.cantidadVenta + 1 } : item));
    } else {
      setCarrito([...carrito, { ...prod, cantidadVenta: 1 }]);
    }
  };

  const cambiarCantidadCarrito = (id: string, delta: number) => {
    const prodBase = productos.find(p => p.id === id);
    setCarrito(carrito.map(item => {
      if (item.id === id) {
        const nueva = item.cantidadVenta + delta;
        if (nueva <= 0) return null;
        if (prodBase && nueva > prodBase.stock) {
          alert('Stock máximo');
          return item;
        }
        return { ...item, cantidadVenta: nueva };
      }
      return item;
    }).filter(Boolean) as CarritoItem[]);
  };

  const procesarVenta = async () => {
    if (carrito.length === 0 || !usuarioActual) return;
    try {
      const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0);
      await addDoc(collection(db, 'ventas'), {
        items: carrito.map(item => ({
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          cantidad: item.cantidadVenta,
          precio: item.precio,
          subtotal: item.precio * item.cantidadVenta
        })),
        total,
        fecha: serverTimestamp(),
        estado: 'Completada',
        medioPago: 'Efectivo',
        vendedorId: usuarioActual.id,
        vendedorNombre: usuarioActual.nombre
      });

      for (const item of carrito) {
        const nuevoStock = Math.max(0, item.stock - item.cantidadVenta);
        await updateDoc(doc(db, 'productos', item.id), { stock: nuevoStock });
      }

      setProductos(productos.map(p => {
        const vendido = carrito.find(c => c.id === p.id);
        return vendido ? { ...p, stock: Math.max(0, p.stock - vendido.cantidadVenta) } : p;
      }));

      const ventasSnap = await getDocs(collection(db, 'ventas'));
      const listaVentas: Venta[] = [];
      ventasSnap.forEach((d) => listaVentas.push({ id: d.id, ...d.data() } as Venta));
      setVentas(listaVentas);

      setCarrito([]);
      setVentaExitosa(true);
      setTimeout(() => setVentaExitosa(false), 3000);
      alert(`Venta registrada a nombre de ${usuarioActual.nombre}`);
    } catch (error) {
      console.error(error);
      alert('Error al procesar venta');
    }
  };

  const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0);

  const cambiarEstadoEntrega = (id: number, nuevoEstado: 'Pendiente' | 'En Ruta' | 'Entregado') => {
    setEntregas(entregas.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e));
  };

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
          <p>Cargando Tienda-SS...</p>
        </div>
      </div>
    );
  }

  // ========== LOGIN ==========
  if (!usuarioActual) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#1f2937', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#facc15', fontSize: '24px', border: '1px solid #374151', margin: '0 auto 8px' }}>⚡</div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>Tienda-SS</h1>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>Sistema de Gestión · Demo</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="text" placeholder="Usuario" value={usuarioInput} onChange={e => setUsuarioInput(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            <input type="password" placeholder="Contraseña" value={passwordInput} onChange={e => setPasswordInput(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            <button type="submit" style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              Iniciar Sesión
            </button>
          </form>

          <div style={{ borderTop: '1px solid #1f2937', paddingTop: '16px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', textAlign: 'center', marginBottom: '10px' }}>ACCESOS RÁPIDOS (clave: 1234)</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {USUARIOS_DEMO.map(u => (
                <button key={u.id} onClick={() => loginRapido(u.usuario)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'block' }}>{u.nombre}</span>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{u.usuario} · {u.rol}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#818cf8' }}>Entrar →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== JEFE ==========
  if (usuarioActual.rol === 'jefe') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '16px', fontWeight: 800, color: '#f87171', margin: 0 }}>⚡ Dashboard</h1>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Hola, {usuarioActual.nombre}</p>
            </div>
            <button onClick={cerrarSesion} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Ventas hoy</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#34d399', margin: '4px 0 0' }}>${totalVentasHoy.toLocaleString()}</p>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Tickets</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#fff', margin: '4px 0 0' }}>{ticketsHoy}</p>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Ticket promedio</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#818cf8', margin: '4px 0 0' }}>${ticketPromedio.toFixed(0)}</p>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Stock bajo</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: stockBajoLista.length > 0 ? '#f87171' : '#34d399', margin: '4px 0 0' }}>{stockBajoLista.length}</p>
            </div>
          </div>

          {/* VENTAS POR VENDEDOR - LO MÁS IMPORTANTE */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>👥 Ventas por vendedor (hoy)</p>
            {ventasPorVendedor.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Aún no hay ventas hoy. Entra como Carlos o María y registra alguna.</p>
            ) : (
              ventasPorVendedor.map((v, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < ventasPorVendedor.length - 1 ? '1px solid #1f2937' : 'none' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{v.nombre}</span>
                    <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>{v.tickets} ticket{v.tickets !== 1 ? 's' : ''}</span>
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#34d399' }}>${v.total.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>

          {stockBajoLista.length > 0 && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '14px', padding: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', margin: '0 0 8px' }}>⚠️ Stock bajo</p>
              {stockBajoLista.slice(0, 4).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' }}>
                  <span>{p.nombre}</span>
                  <span style={{ color: '#f87171', fontWeight: 700 }}>{p.stock} / min {p.stockMinimo}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>🏆 Más vendidos hoy</p>
            {topProductosHoy.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Sin datos aún</p>
            ) : (
              topProductosHoy.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #1f2937' }}>
                  <span>{i + 1}. {p.nombre}</span>
                  <span style={{ color: '#34d399' }}>{p.cantidad} un · ${p.total.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== BODEGA ==========
  if (usuarioActual.rol === 'bodega') {
    const productosFiltrados = productos.filter(p => {
      const match = p.nombre.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busquedaBodega.toLowerCase());
      const matchStock = filtroStockBajo ? p.stock <= p.stockMinimo : true;
      return match && matchStock;
    });

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>📦 Inventario</h1>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{usuarioActual.nombre} · {productos.length} productos</p>
            </div>
            <button onClick={cerrarSesion} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

          <form onSubmit={guardarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', margin: 0 }}>
              {editandoId ? '✏️ Editar producto' : '➕ Agregar producto'}
            </h2>
            <input type="text" placeholder="Nombre *" value={nombre} onChange={e => setNombre(e.target.value)} required
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '11px', fontSize: '13px', color: '#fff', outline: 'none' }} />
            {!editandoId && (
              <input type="number" placeholder="Stock inicial *" value={stockInicial} onChange={e => setStockInicial(e.target.value)} required
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '11px', fontSize: '13px', color: '#fff', outline: 'none' }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input type="number" placeholder="Stock mínimo" value={stockMinimo} onChange={e => setStockMinimo(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
              <input type="number" placeholder="Precio" value={precio} onChange={e => setPrecio(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
            </div>
            <button type="button" onClick={() => setMostrarMasOpciones(!mostrarMasOpciones)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '12px', textAlign: 'left', cursor: 'pointer' }}>
              {mostrarMasOpciones ? '▾ Ocultar' : '▸ Más opciones'}
            </button>
            {mostrarMasOpciones && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="text" placeholder="Código (auto)" value={codigo} onChange={e => setCodigo(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
                <input type="number" placeholder="Costo" value={costo} onChange={e => setCosto(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
              </div>
            )}
            <button type="submit" disabled={guardando}
              style={{ backgroundColor: guardando ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar' : 'Agregar'}
            </button>
            {editandoId && (
              <button type="button" onClick={limpiarFormulario} style={{ backgroundColor: '#374151', color: '#fff', border: 'none', padding: '10px', borderRadius: '10px', fontSize: '12px', cursor: 'pointer' }}>
                Cancelar
              </button>
            )}
          </form>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="🔍 Buscar..." value={busquedaBodega} onChange={e => setBusquedaBodega(e.target.value)}
              style={{ flex: 1, backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '13px', color: '#fff', outline: 'none' }} />
            <button onClick={() => setFiltroStockBajo(!filtroStockBajo)}
              style={{ backgroundColor: filtroStockBajo ? 'rgba(239,68,68,0.2)' : '#111827', border: `1px solid ${filtroStockBajo ? '#f87171' : '#374151'}`, borderRadius: '10px', padding: '10px 12px', color: filtroStockBajo ? '#f87171' : '#9ca3af', fontSize: '12px', cursor: 'pointer' }}>
              Stock bajo
            </button>
          </div>

          {productosFiltrados.map(prod => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: `1px solid ${prod.stock <= prod.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: '14px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', color: '#818cf8' }}>{prod.codigo}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: prod.stock <= prod.stockMinimo ? '#f87171' : '#34d399' }}>{prod.stock} un</span>
              </div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px' }}>{prod.nombre}</h3>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 10px' }}>${prod.precio} · Mín: {prod.stockMinimo}</p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => iniciarEdicion(prod)} style={{ flex: 1, backgroundColor: '#1e1b4b', color: '#a5b4fc', border: 'none', padding: '7px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>Editar</button>
                <button onClick={() => { setAjustandoId(prod.id); setAjusteCantidad(''); }} style={{ flex: 1, backgroundColor: '#064e3b', color: '#6ee7b7', border: 'none', padding: '7px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer' }}>Ajustar</button>
              </div>
              {ajustandoId === prod.id && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#030712', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(['entrada', 'salida', 'correccion'] as const).map(t => (
                      <button key={t} onClick={() => setAjusteTipo(t)}
                        style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', fontSize: '11px', cursor: 'pointer', backgroundColor: ajusteTipo === t ? '#4f46e5' : '#1f2937', color: '#fff' }}>
                        {t === 'entrada' ? 'Entrada' : t === 'salida' ? 'Salida' : 'Corregir'}
                      </button>
                    ))}
                  </div>
                  <input type="number" placeholder="Cantidad" value={ajusteCantidad} onChange={e => setAjusteCantidad(e.target.value)}
                    style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '8px', fontSize: '13px', color: '#fff', outline: 'none' }} />
                  <button onClick={aplicarAjuste} style={{ backgroundColor: '#059669', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== VENDEDOR ==========
  if (usuarioActual.rol === 'vendedor') {
    const catalogo = productos.filter(p =>
      p.nombre.toLowerCase().includes(busquedaVendedor.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busquedaVendedor.toLowerCase())
    );

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8', margin: 0 }}>🛒 Ventas</h1>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{usuarioActual.nombre} · Vendedor</p>
            </div>
            <button onClick={cerrarSesion} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

          {ventaExitosa && (
            <div style={{ backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', borderRadius: '12px', padding: '12px', textAlign: 'center', color: '#34d399', fontWeight: 700 }}>
              ✅ Venta de {usuarioActual.nombre} registrada
            </div>
          )}

          {carrito.length > 0 && (
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>🧾 Carrito</h2>
              {carrito.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span>{item.nombre} x{item.cantidadVenta}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => cambiarCantidadCarrito(item.id, -1)} style={{ backgroundColor: '#374151', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer' }}>−</button>
                    <button onClick={() => cambiarCantidadCarrito(item.id, 1)} style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                    <span style={{ color: '#34d399' }}>${(item.precio * item.cantidadVenta).toFixed(0)}</span>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #374151', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '16px' }}>Total: ${totalVenta.toFixed(0)}</span>
                <button onClick={procesarVenta} style={{ backgroundColor: '#10b981', color: '#030712', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                  💳 Cobrar
                </button>
              </div>
            </div>
          )}

          <input type="text" placeholder="🔍 Buscar producto..." value={busquedaVendedor} onChange={e => setBusquedaVendedor(e.target.value)}
            style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none' }} />

          {catalogo.map(prod => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>{prod.nombre}</h3>
                <p style={{ fontSize: '12px', color: '#34d399', margin: '2px 0 0' }}>${prod.precio} · Stock: {prod.stock}</p>
              </div>
              <button onClick={() => agregarAlCarrito(prod)} disabled={prod.stock <= 0}
                style={{ backgroundColor: prod.stock <= 0 ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: prod.stock <= 0 ? 'not-allowed' : 'pointer' }}>
                ➕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== CHOFER ==========
  if (usuarioActual.rol === 'chofer') {
    const misEntregas = entregas.filter(e => e.choferId === usuarioActual.id || !e.choferId);
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#facc15', margin: 0 }}>🚚 Mis Entregas</h1>
              <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{usuarioActual.nombre} · Chofer</p>
            </div>
            <button onClick={cerrarSesion} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

          {misEntregas.map(envio => (
            <div key={envio.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{envio.cliente}</h3>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0' }}>{envio.direccion}</p>
                  <p style={{ fontSize: '12px', margin: 0 }}>{envio.productos}</p>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', height: 'fit-content',
                  backgroundColor: envio.estado === 'Pendiente' ? 'rgba(245,158,11,0.15)' : envio.estado === 'En Ruta' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                  color: envio.estado === 'Pendiente' ? '#fbbf24' : envio.estado === 'En Ruta' ? '#60a5fa' : '#34d399'
                }}>{envio.estado}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => cambiarEstadoEntrega(envio.id, 'En Ruta')} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>En Ruta</button>
                <button onClick={() => cambiarEstadoEntrega(envio.id, 'Entregado')} style={{ backgroundColor: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Entregado</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

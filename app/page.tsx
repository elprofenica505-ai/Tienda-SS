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
}

interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
}

type Vista = 'login' | 'bodega' | 'vendedor' | 'chofer' | 'jefe';

export default function TiendaSSApp() {
  const [vistaActual, setVistaActual] = useState<Vista>('login');
  const [vistaAnterior, setVistaAnterior] = useState<Vista | null>(null);
  const [cargando, setCargando] = useState(true);

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);

  // Bodega
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
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
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick, Managua', productos: 'Smart TV Sony 55"', estado: 'Pendiente' },
    { id: 2, cliente: 'María Gómez', direccion: 'Villa El Carmen', productos: 'Cama King Size', estado: 'En Ruta' },
    { id: 3, cliente: 'Carlos Ruiz', direccion: 'Colonia Centroamérica', productos: 'Infinix Note 50 Pro', estado: 'Entregado' },
  ]);

  // Función para navegar guardando la vista anterior
  const irA = (nuevaVista: Vista) => {
    if (nuevaVista !== vistaActual) {
      setVistaAnterior(vistaActual);
      setVistaActual(nuevaVista);
    }
  };

  const volverAtras = () => {
    if (vistaAnterior) {
      setVistaActual(vistaAnterior);
      setVistaAnterior(null);
    } else {
      setVistaActual('login');
    }
  };

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
        console.error('Error cargando datos:', error);
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, []);

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
  Object.values(mapaTop)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5)
    .forEach(p => topProductosHoy.push(p));

  const handleLogin = (e?: React.FormEvent, rolForzado?: string) => {
    if (e) e.preventDefault();
    const rol = rolForzado || usuario.toLowerCase().trim();
    if (['bodega', 'vendedor', 'chofer', 'jefe'].includes(rol)) {
      setVistaAnterior(null);
      setVistaActual(rol as Vista);
    } else {
      alert('⚠️ Usa los accesos rápidos');
    }
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
    setModelo('');
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
      alert('⚠️ Nombre y Stock son obligatorios');
      return;
    }

    setGuardando(true);
    try {
      const codigoAuto = codigo.trim() || `PROD-${Math.floor(1000 + Math.random() * 9000)}`;
      const data: any = {
        codigo: codigoAuto,
        nombre: nombre.trim(),
        marca: marca.trim() || 'Sin marca',
        modelo: modelo.trim() || 'Estándar',
        categoria,
        stockMinimo: parseInt(stockMinimo, 10) || 5,
        precio: parseFloat(precio) || 0,
        costo: parseFloat(costo) || 0,
        imagen: imagenPreview || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=300&q=80',
        actualizadoEn: serverTimestamp()
      };

      if (editandoId) {
        await updateDoc(doc(db, 'productos', editandoId), data);
        setProductos(productos.map(p => p.id === editandoId ? { ...p, ...data } : p));
        alert('✅ Producto actualizado');
      } else {
        data.stock = parseInt(stockInicial, 10) || 0;
        data.creadoEn = serverTimestamp();
        const docRef = await addDoc(collection(db, 'productos'), data);
        setProductos([{ id: docRef.id, ...data } as Producto, ...productos]);
        alert('✅ Producto agregado');
      }
      limpiarFormulario();
    } catch (error) {
      console.error(error);
      alert('❌ Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const iniciarEdicion = (prod: Producto) => {
    setEditandoId(prod.id);
    setCodigo(prod.codigo);
    setNombre(prod.nombre);
    setMarca(prod.marca);
    setModelo(prod.modelo);
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
      await updateDoc(doc(db, 'productos', ajustandoId), { stock: nuevoStock });
      setProductos(productos.map(p => p.id === ajustandoId ? { ...p, stock: nuevoStock } : p));
      setAjustandoId(null);
      setAjusteCantidad('');
      alert('✅ Stock actualizado');
    } catch (error) {
      console.error(error);
      alert('Error al ajustar stock');
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
      alert('⚠️ Sin stock');
      return;
    }
    const existe = carrito.find(item => item.id === prod.id);
    if (existe) {
      if (existe.cantidadVenta >= prod.stock) {
        alert('⚠️ Stock máximo');
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
          alert('⚠️ Stock máximo');
          return item;
        }
        return { ...item, cantidadVenta: nueva };
      }
      return item;
    }).filter(Boolean) as CarritoItem[]);
  };

  const procesarVenta = async () => {
    if (carrito.length === 0) return;
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
        medioPago: 'Efectivo'
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
      alert('✅ Venta registrada');
    } catch (error) {
      console.error(error);
      alert('❌ Error al procesar venta');
    }
  };

  const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0);

  const cambiarEstadoEntrega = (id: number, nuevoEstado: 'Pendiente' | 'En Ruta' | 'Entregado') => {
    setEntregas(entregas.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e));
  };

  // Botón Volver reutilizable
  const BotonVolver = () => (
    <button 
      onClick={volverAtras}
      style={{ 
        backgroundColor: '#1f2937', 
        border: '1px solid #374151', 
        borderRadius: '10px', 
        padding: '8px 14px', 
        color: '#d1d5db', 
        fontWeight: 600, 
        fontSize: '12px', 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}
    >
      ← Volver
    </button>
  );

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
  if (vistaActual === 'login') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#1f2937', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#facc15', fontSize: '24px', border: '1px solid #374151', margin: '0 auto 8px' }}>⚡</div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>Tienda-SS</h1>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>Sistema de Gestión</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="text" placeholder="Usuario" value={usuario} onChange={e => setUsuario(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            <button type="submit" style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              Iniciar Sesión
            </button>
          </form>
          <div style={{ borderTop: '1px solid #1f2937', paddingTop: '16px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', textAlign: 'center', marginBottom: '8px' }}>ACCESOS RÁPIDOS</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { rol: 'bodega', icon: '📦', color: '#818cf8', desc: 'Inventario' },
                { rol: 'vendedor', icon: '🛒', color: '#38bdf8', desc: 'Caja' },
                { rol: 'chofer', icon: '🚚', color: '#facc15', desc: 'Rutas' },
                { rol: 'jefe', icon: '⚡', color: '#f87171', desc: 'Dashboard' }
              ].map(b => (
                <button key={b.rol} onClick={() => handleLogin(undefined, b.rol)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: b.color, display: 'block' }}>{b.icon} {b.rol}</span>
                  <span style={{ fontSize: '10px', color: '#9ca3af' }}>{b.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== JEFE ==========
  if (vistaActual === 'jefe') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {vistaAnterior && <BotonVolver />}
              <div>
                <h1 style={{ fontSize: '16px', fontWeight: 800, color: '#f87171', margin: 0 }}>⚡ Dashboard</h1>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Resumen del negocio</p>
              </div>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

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

          {stockBajoLista.length > 0 && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '14px', padding: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', margin: '0 0 8px' }}>⚠️ Productos con stock bajo</p>
              {stockBajoLista.slice(0, 5).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                  <span>{p.nombre}</span>
                  <span style={{ color: '#f87171', fontWeight: 700 }}>{p.stock} / min {p.stockMinimo}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>🏆 Más vendidos hoy</p>
            {topProductosHoy.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Aún no hay ventas hoy</p>
            ) : (
              topProductosHoy.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #1f2937' }}>
                  <span>{i + 1}. {p.nombre}</span>
                  <span style={{ color: '#34d399' }}>{p.cantidad} un · ${p.total.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>📦 Inventario</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Total productos</span>
              <span style={{ fontWeight: 700 }}>{productos.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
              <span>Unidades totales</span>
              <span style={{ fontWeight: 700 }}>{productos.reduce((a, p) => a + p.stock, 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
              <span>Valor inventario</span>
              <span style={{ fontWeight: 700, color: '#818cf8' }}>
                ${productos.reduce((a, p) => a + (p.stock * p.precio), 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button onClick={() => irA('bodega')}
              style={{ backgroundColor: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: '12px', padding: '14px', color: '#a5b4fc', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              📦 Inventario
            </button>
            <button onClick={() => irA('vendedor')}
              style={{ backgroundColor: '#0c4a6e', border: '1px solid #0ea5e9', borderRadius: '12px', padding: '14px', color: '#7dd3fc', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              🛒 Ventas
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== BODEGA ==========
  if (vistaActual === 'bodega') {
    const productosFiltrados = productos.filter(p => {
      const matchBusqueda = p.nombre.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
        p.marca.toLowerCase().includes(busquedaBodega.toLowerCase());
      const matchStock = filtroStockBajo ? p.stock <= p.stockMinimo : true;
      return matchBusqueda && matchStock;
    });

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BotonVolver />
              <div>
                <h1 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>📦 Inventario</h1>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>{productos.length} productos · {stockBajoLista.length} con stock bajo</p>
              </div>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

          <form onSubmit={guardarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', margin: 0 }}>
              {editandoId ? '✏️ Editar producto' : '➕ Agregar producto'}
            </h2>
            
            <input type="text" placeholder="Nombre del producto *" value={nombre} onChange={e => setNombre(e.target.value)} required
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '11px', fontSize: '13px', color: '#fff', outline: 'none' }} />

            {!editandoId && (
              <input type="number" placeholder="Stock inicial *" value={stockInicial} onChange={e => setStockInicial(e.target.value)} required
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '11px', fontSize: '13px', color: '#fff', outline: 'none' }} />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input type="number" placeholder="Stock mínimo" value={stockMinimo} onChange={e => setStockMinimo(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
              <input type="number" placeholder="Precio venta" value={precio} onChange={e => setPrecio(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input type="number" placeholder="Costo (opcional)" value={costo} onChange={e => setCosto(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}>
                <option>Electrodomésticos</option>
                <option>Motos y Vehículos</option>
                <option>Celulares</option>
                <option>Muebles/Hogar</option>
                <option>Otros</option>
              </select>
            </div>

            <button type="button" onClick={() => setMostrarMasOpciones(!mostrarMasOpciones)}
              style={{ backgroundColor: 'transparent', border: 'none', color: '#9ca3af', fontSize: '12px', fontWeight: 600, textAlign: 'left', padding: '4px 0', cursor: 'pointer' }}>
              {mostrarMasOpciones ? '▾ Ocultar opciones' : '▸ Más opciones'}
            </button>

            {mostrarMasOpciones && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="text" placeholder="Código (auto si vacío)" value={codigo} onChange={e => setCodigo(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
                <input type="text" placeholder="Marca" value={marca} onChange={e => setMarca(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleCapturarFoto} style={{ fontSize: '12px' }} />
                {imagenPreview && <img src={imagenPreview} alt="Preview" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={guardando}
                style={{ flex: 1, backgroundColor: guardando ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar'}
              </button>
              {editandoId && (
                <button type="button" onClick={limpiarFormulario}
                  style={{ backgroundColor: '#374151', color: '#fff', border: 'none', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="🔍 Buscar..." value={busquedaBodega} onChange={e => setBusquedaBodega(e.target.value)}
              style={{ flex: 1, backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '13px', color: '#fff', outline: 'none' }} />
            <button onClick={() => setFiltroStockBajo(!filtroStockBajo)}
              style={{ backgroundColor: filtroStockBajo ? 'rgba(239,68,68,0.2)' : '#111827', border: `1px solid ${filtroStockBajo ? '#f87171' : '#374151'}`, borderRadius: '10px', padding: '10px 12px', color: filtroStockBajo ? '#f87171' : '#9ca3af', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Stock bajo
            </button>
          </div>

          {productosFiltrados.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '20px' }}>No hay productos</p>
          ) : (
            productosFiltrados.map(prod => (
              <div key={prod.id} style={{ backgroundColor: '#111827', border: `1px solid ${prod.stock <= prod.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: '14px', padding: '12px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <img src={prod.imagen} alt={prod.nombre} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', color: '#818cf8' }}>{prod.codigo}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: prod.stock <= prod.stockMinimo ? '#f87171' : '#34d399' }}>
                        {prod.stock} un {prod.stock <= prod.stockMinimo && '(bajo)'}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0' }}>{prod.nombre}</h3>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>
                      ${prod.precio} · Mín: {prod.stockMinimo}
                      {prod.costo > 0 && ` · Margen: ${(((prod.precio - prod.costo) / prod.precio) * 100).toFixed(0)}%`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                  <button onClick={() => iniciarEdicion(prod)}
                    style={{ flex: 1, backgroundColor: '#1e1b4b', color: '#a5b4fc', border: 'none', padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => { setAjustandoId(prod.id); setAjusteTipo('entrada'); setAjusteCantidad(''); }}
                    style={{ flex: 1, backgroundColor: '#064e3b', color: '#6ee7b7', border: 'none', padding: '7px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    📊 Ajustar
                  </button>
                  <button onClick={() => actualizarStock(prod.id, 1)}
                    style={{ backgroundColor: '#374151', color: '#fff', border: 'none', width: '32px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>+</button>
                  <button onClick={() => actualizarStock(prod.id, -1)}
                    style={{ backgroundColor: '#374151', color: '#fff', border: 'none', width: '32px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>−</button>
                </div>

                {ajustandoId === prod.id && (
                  <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#030712', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['entrada', 'salida', 'correccion'] as const).map(t => (
                        <button key={t} onClick={() => setAjusteTipo(t)}
                          style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                            backgroundColor: ajusteTipo === t ? '#4f46e5' : '#1f2937', color: '#fff' }}>
                          {t === 'entrada' ? 'Entrada' : t === 'salida' ? 'Salida' : 'Corregir'}
                        </button>
                      ))}
                    </div>
                    <input type="number" placeholder="Cantidad" value={ajusteCantidad} onChange={e => setAjusteCantidad(e.target.value)}
                      style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '8px', fontSize: '13px', color: '#fff', outline: 'none' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={aplicarAjuste}
                        style={{ flex: 1, backgroundColor: '#059669', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        Aplicar
                      </button>
                      <button onClick={() => setAjustandoId(null)}
                        style={{ backgroundColor: '#374151', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ========== VENDEDOR ==========
  if (vistaActual === 'vendedor') {
    const catalogoFiltrado = productos.filter(p =>
      p.nombre.toLowerCase().includes(busquedaVendedor.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busquedaVendedor.toLowerCase())
    );

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BotonVolver />
              <div>
                <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8', margin: 0 }}>🛒 Ventas</h1>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Caja y catálogo</p>
              </div>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>

          {ventaExitosa && (
            <div style={{ backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', borderRadius: '12px', padding: '12px', textAlign: 'center', color: '#34d399', fontWeight: 700 }}>
              ✅ Venta registrada
            </div>
          )}

          {carrito.length > 0 && (
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>🧾 Carrito ({carrito.length})</h2>
              {carrito.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px' }}>{item.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => cambiarCantidadCarrito(item.id, -1)} style={{ backgroundColor: '#374151', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer' }}>−</button>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{item.cantidadVenta}</span>
                    <button onClick={() => cambiarCantidadCarrito(item.id, 1)} style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                    <span style={{ fontSize: '12px', color: '#34d399', minWidth: '50px', textAlign: 'right' }}>${(item.precio * item.cantidadVenta).toFixed(0)}</span>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #374151', paddingTop: '10px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '16px' }}>Total: ${totalVenta.toFixed(0)}</span>
                <button onClick={procesarVenta} style={{ backgroundColor: '#10b981', color: '#030712', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                  💳 Cobrar
                </button>
              </div>
            </div>
          )}

          <input type="text" placeholder="🔍 Buscar producto..." value={busquedaVendedor} onChange={e => setBusquedaVendedor(e.target.value)}
            style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none' }} />

          {catalogoFiltrado.map(prod => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                <img src={prod.imagen} alt={prod.nombre} style={{ width: '46px', height: '46px', objectFit: 'cover', borderRadius: '8px' }} />
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0 }}>{prod.nombre}</h3>
                  <p style={{ fontSize: '11px', color: '#34d399', margin: '2px 0 0' }}>${prod.precio} · Stock: {prod.stock}</p>
                </div>
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
  if (vistaActual === 'chofer') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BotonVolver />
              <div>
                <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#facc15', margin: 0 }}>🚚 Rutas</h1>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Entregas del día</p>
              </div>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
          {entregas.map(envio => (
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
                <button onClick={() => cambiarEstadoEntrega(envio.id, 'En Ruta')} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>En Ruta</button>
                <button onClick={() => cambiarEstadoEntrega(envio.id, 'Entregado')} style={{ backgroundColor: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Entregado</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

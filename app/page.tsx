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
  precio: number;
  imagen: string;
}

interface CarritoItem extends Producto {
  cantidadVenta: number;
}

interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
}

export default function TiendaSSApp() {
  const [vistaActual, setVistaActual] = useState<'login' | 'bodega' | 'vendedor' | 'chofer' | 'jefe'>('login');
  const [cargando, setCargando] = useState(true);

  // Login
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  // Productos
  const [productos, setProductos] = useState<Producto[]>([]);

  // Estados Bodega
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [categoria, setCategoria] = useState('Electrodomésticos');
  const [stockInicial, setStockInicial] = useState('');
  const [precio, setPrecio] = useState('');
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busquedaBodega, setBusquedaBodega] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Estados Vendedor
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [busquedaVendedor, setBusquedaVendedor] = useState('');
  const [ventaExitosa, setVentaExitosa] = useState(false);

  // Estados Chofer
  const [entregas, setEntregas] = useState<Entrega[]>([
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick, Managua', productos: 'Smart TV Sony 55"', estado: 'Pendiente' },
    { id: 2, cliente: 'María Gómez', direccion: 'Villa El Carmen', productos: 'Cama King Size', estado: 'En Ruta' },
    { id: 3, cliente: 'Carlos Ruiz', direccion: 'Colonia Centroamérica', productos: 'Infinix Note 50 Pro', estado: 'Entregado' },
  ]);

  // Cargar productos desde Firebase
  useEffect(() => {
    const cargarProductos = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'productos'));
        const lista: Producto[] = [];
        querySnapshot.forEach((docSnap) => {
          lista.push({ id: docSnap.id, ...docSnap.data() } as Producto);
        });
        setProductos(lista);
      } catch (error) {
        console.error('Error al cargar productos:', error);
      } finally {
        setCargando(false);
      }
    };
    cargarProductos();
  }, []);

  // Login
  const handleLogin = (e?: React.FormEvent, rolForzado?: string) => {
    if (e) e.preventDefault();
    const rol = rolForzado || usuario.toLowerCase().trim();
    if (['bodega', 'vendedor', 'chofer', 'jefe'].includes(rol)) {
      setVistaActual(rol as any);
    } else {
      alert('⚠️ Usuario o clave incorrecta. Usa los accesos rápidos (clave: 1234)');
    }
  };

  // Cámara
  const handleCapturarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagenPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Registrar producto (simplificado)
  const registrarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !stockInicial) {
      alert('⚠️ Solo necesitas Nombre y Stock.');
      return;
    }

    setGuardando(true);
    try {
      const codigoAuto = codigo.trim() || `PROD-${Math.floor(1000 + Math.random() * 9000)}`;

      const nuevoProducto = {
        codigo: codigoAuto,
        nombre: nombre.trim(),
        marca: marca.trim() || 'Sin marca',
        modelo: modelo.trim() || 'Estándar',
        categoria,
        stock: parseInt(stockInicial, 10) || 0,
        precio: parseFloat(precio) || 0,
        imagen: imagenPreview || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=300&q=80',
        creadoEn: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'productos'), nuevoProducto);
      
      setProductos([{ id: docRef.id, ...nuevoProducto } as Producto, ...productos]);
      
      setCodigo('');
      setNombre('');
      setMarca('');
      setModelo('');
      setStockInicial('');
      setPrecio('');
      setImagenPreview(null);
      
      alert('✅ Producto agregado correctamente');
    } catch (error) {
      console.error(error);
      alert('❌ Error al guardar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  // Actualizar stock
  const actualizarStock = async (id: string, delta: number) => {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const nuevoStock = Math.max(0, producto.stock + delta);
    
    try {
      await updateDoc(doc(db, 'productos', id), { stock: nuevoStock });
      setProductos(productos.map(p => p.id === id ? { ...p, stock: nuevoStock } : p));
    } catch (error) {
      console.error(error);
      alert('Error al actualizar stock');
    }
  };

  // Vendedor
  const agregarAlCarrito = (prod: Producto) => {
    if (prod.stock <= 0) {
      alert('⚠️ No hay stock disponible.');
      return;
    }
    const existe = carrito.find(item => item.id === prod.id);
    if (existe) {
      if (existe.cantidadVenta >= prod.stock) {
        alert('⚠️ Stock máximo alcanzado.');
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
        const nuevaCantidad = item.cantidadVenta + delta;
        if (nuevaCantidad <= 0) return null;
        if (prodBase && nuevaCantidad > prodBase.stock) {
          alert('⚠️ Stock máximo alcanzado.');
          return item;
        }
        return { ...item, cantidadVenta: nuevaCantidad };
      }
      return item;
    }).filter(Boolean) as CarritoItem[]);
  };

  // Procesar venta
  const procesarVenta = async () => {
    if (carrito.length === 0) return;

    try {
      await addDoc(collection(db, 'ventas'), {
        items: carrito.map(item => ({
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          cantidad: item.cantidadVenta,
          precio: item.precio,
          subtotal: item.precio * item.cantidadVenta
        })),
        total: carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0),
        fecha: serverTimestamp(),
        estado: 'Completada'
      });

      for (const item of carrito) {
        const nuevoStock = Math.max(0, item.stock - item.cantidadVenta);
        await updateDoc(doc(db, 'productos', item.id), { stock: nuevoStock });
      }

      setProductos(productos.map(p => {
        const itemVendido = carrito.find(c => c.id === p.id);
        if (itemVendido) {
          return { ...p, stock: Math.max(0, p.stock - itemVendido.cantidadVenta) };
        }
        return p;
      }));

      setCarrito([]);
      setVentaExitosa(true);
      setTimeout(() => setVentaExitosa(false), 4000);
      alert('✅ ¡Venta guardada correctamente!');
    } catch (error) {
      console.error(error);
      alert('❌ Error al procesar la venta.');
    }
  };

  const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0);

  // Chofer
  const cambiarEstadoEntrega = (id: number, nuevoEstado: 'Pendiente' | 'En Ruta' | 'Entregado') => {
    setEntregas(entregas.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e));
  };

  // Pantalla de carga
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
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>Sistema Logístico e Inventario Profesional</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Usuario de acceso</label>
              <input type="text" placeholder="ej. bodega, vendedor, chofer, jefe" value={usuario} onChange={e => setUsuario(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Contraseña</label>
              <input type="password" placeholder="********" value={password} onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              Iniciar Sesión
            </button>
          </form>

          <div style={{ borderTop: '1px solid #1f2937', paddingTop: '16px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', textAlign: 'center', marginBottom: '8px' }}>ACCESOS RÁPIDOS (CLAVE: 1234)</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button onClick={() => handleLogin(undefined, 'bodega')} style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', display: 'block' }}>📦 bodega</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>Inventario y Cámara</span>
              </button>
              <button onClick={() => handleLogin(undefined, 'vendedor')} style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', display: 'block' }}>🛒 vendedor</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>Caja y Catálogo</span>
              </button>
              <button onClick={() => handleLogin(undefined, 'chofer')} style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#facc15', display: 'block' }}>🚚 chofer</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>Rutas</span>
              </button>
              <button onClick={() => handleLogin(undefined, 'jefe')} style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', display: 'block' }}>⚡ jefe</span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>Administración</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== BODEGA ==========
  if (vistaActual === 'bodega') {
    const productosFiltrados = productos.filter(p =>
      p.nombre.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
      p.marca.toLowerCase().includes(busquedaBodega.toLowerCase())
    );

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>📦 Tienda-SS</h1>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Módulo de Bodega</p>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              🚪 Cerrar Sesión
            </button>
          </div>

          {/* Formulario simplificado */}
          <form onSubmit={registrarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Agregar Producto Rápido</h2>
            
            <input 
              type="text" 
              placeholder="Nombre del producto *" 
              value={nombre} 
              onChange={e => setNombre(e.target.value)} 
              required
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none' }} 
            />

            <input 
              type="number" 
              placeholder="Stock inicial *" 
              value={stockInicial} 
              onChange={e => setStockInicial(e.target.value)} 
              required
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '13px', color: '#fff', outline: 'none' }} 
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input 
                type="number" 
                placeholder="Precio (opcional)" 
                value={precio} 
                onChange={e => setPrecio(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} 
              />
              <select 
                value={categoria} 
                onChange={e => setCategoria(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
              >
                <option>Electrodomésticos</option>
                <option>Motos y Vehículos</option>
                <option>Celulares</option>
                <option>Muebles/Hogar</option>
                <option>Otros</option>
              </select>
            </div>

            **Summary:**
Opciones avanzadas (opcional)
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="text" placeholder="Código (se genera solo si lo dejas vacío)" value={codigo} onChange={e => setCodigo(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
                <input type="text" placeholder="Marca (opcional)" value={marca} onChange={e => setMarca(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
                <input type="text" placeholder="Modelo (opcional)" value={modelo} onChange={e => setModelo(e.target.value)}
                  style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleCapturarFoto} style={{ fontSize: '12px' }} />
                {imagenPreview && <img src={imagenPreview} alt="Preview" style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px' }} />}
              </div>

            <button 
              type="submit" 
              disabled={guardando}
              style={{ backgroundColor: guardando ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '13px', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            >
              {guardando ? 'Guardando...' : 'Agregar Producto'}
            </button>
          </form>

          {/* Lista de productos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', margin: 0 }}>📋 Existencias ({productosFiltrados.length})</h2>
            <input type="text" placeholder="🔍 Buscar..." value={busquedaBodega} onChange={e => setBusquedaBodega(e.target.value)}
              style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
            
            {productosFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '20px' }}>No hay productos aún. Agrega el primero.</p>
            ) : (
              productosFiltrados.map(prod => (
                <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <img src={prod.imagen} alt={prod.nombre} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 700 }}>{prod.stock} unids</span>
                    </div>
                    <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0' }}>{prod.nombre}</h3>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{prod.marca} · ${prod.precio}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => actualizarStock(prod.id, -1)} style={{ backgroundColor: '#374151', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer' }}>−</button>
                    <button onClick={() => actualizarStock(prod.id, 1)} style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              ))
            )}
          </div>
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
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif', paddingBottom: carrito.length > 0 ? '140px' : '20px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8', margin: 0 }}>🛒 Tienda-SS</h1>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Caja y Catálogo</p>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              🚪 Cerrar
            </button>
          </div>

          {ventaExitosa && (
            <div style={{ backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', borderRadius: '12px', padding: '12px', textAlign: 'center', color: '#34d399', fontWeight: 700 }}>
              ✅ ¡Venta guardada correctamente!
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {catalogoFiltrado.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No hay productos. Agrega desde Bodega.</p>
            ) : (
              catalogoFiltrado.map(prod => (
                <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                    <img src={prod.imagen} alt={prod.nombre} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px' }} />
                    <div>
                      <span style={{ fontSize: '9px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                      <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '2px 0' }}>{prod.nombre}</h3>
                      <p style={{ fontSize: '11px', color: '#34d399', margin: 0 }}>${prod.precio} · Stock: {prod.stock}</p>
                    </div>
                  </div>
                  <button onClick={() => agregarAlCarrito(prod)} disabled={prod.stock <= 0}
                    style={{ backgroundColor: prod.stock <= 0 ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: prod.stock <= 0 ? 'not-allowed' : 'pointer' }}>
                    ➕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== CHOFER ==========
  if (vistaActual === 'chofer') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#facc15', margin: 0 }}>🚚 Tienda-SS</h1>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Gestión de Rutas y Entregas</p>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              🚪 Cerrar
            </button>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px', borderBottom: '1px solid #1f2937' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: 0 }}>Asignación de Envíos del Día</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {entregas.map(envio => (
                <div key={envio.id} style={{ padding: '14px', borderBottom: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{envio.cliente}</h3>
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0' }}>{envio.direccion}</p>
                      <p style={{ fontSize: '12px', color: '#d1d5db', margin: 0 }}>{envio.productos}</p>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px',
                      backgroundColor: envio.estado === 'Pendiente' ? 'rgba(245,158,11,0.15)' : envio.estado === 'En Ruta' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                      color: envio.estado === 'Pendiente' ? '#fbbf24' : envio.estado === 'En Ruta' ? '#60a5fa' : '#34d399',
                      border: `1px solid ${envio.estado === 'Pendiente' ? 'rgba(245,158,11,0.3)' : envio.estado === 'En Ruta' ? 'rgba(59,130,246,0.3)' : 'rgba(16,185,129,0.3)'}`
                    }}>
                      {envio.estado}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => cambiarEstadoEntrega(envio.id, 'En Ruta')}
                      style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      En Ruta
                    </button>
                    <button onClick={() => cambiarEstadoEntrega(envio.id, 'Entregado')}
                      style={{ backgroundColor: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      Entregado
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== JEFE ==========
  if (vistaActual === 'jefe') {
    const totalProductos = productos.length;
    const unidadesTotales = productos.reduce((acc, p) => acc + p.stock, 0);
    const valorInventario = productos.reduce((acc, p) => acc + (p.stock * p.precio), 0);
    const stockBajo = productos.filter(p => p.stock <= 5).length;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#f87171', margin: 0 }}>⚡ Tienda-SS</h1>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Panel de Administración</p>
            </div>
            <button onClick={() => setVistaActual('login')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              🚪 Cerrar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff', display: 'block' }}>{totalProductos}</span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>Productos</span>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', display: 'block' }}>{unidadesTotales}</span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>Unidades</span>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#818cf8', display: 'block' }}>${valorInventario.toLocaleString()}</span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>Valor Inventario</span>
            </div>
            <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: stockBajo > 0 ? '#f87171' : '#34d399', display: 'block' }}>{stockBajo}</span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>Stock Bajo</span>
            </div>
          </div>

          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>Resumen de Inventario</h2>
            {productos.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>No hay productos registrados.</p>
            ) : (
              productos.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
                  <span style={{ fontSize: '13px' }}>{p.nombre}</span>
                  <span style={{ fontSize: '13px', color: p.stock <= 5 ? '#f87171' : '#34d399', fontWeight: 600 }}>{p.stock} unids</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

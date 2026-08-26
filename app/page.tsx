'use client';
import React, { useState, useRef } from 'react';

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

export default function TiendaSSApp() {
  const [vistaActual, setVistaActual] = useState<'login' | 'bodega' | 'vendedor' | 'chofer' | 'jefe'>('login');
  
  // Login
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  // Base de datos completa inicial de productos
  const [productos, setProductos] = useState<Producto[]>([
    {
      id: '1',
      codigo: 'TV-SON-55',
      nombre: 'Smart TV 4K UHD',
      marca: 'Sony',
      modelo: 'Bravia X80K',
      categoria: 'Electrodomésticos',
      stock: 12,
      precio: 450,
      imagen: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: '2',
      codigo: 'MOT-01',
      nombre: 'Moto Deportiva 200cc',
      marca: 'Yamaha',
      modelo: 'R200',
      categoria: 'Motos y Vehículos',
      stock: 5,
      precio: 2400,
      imagen: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: '3',
      codigo: 'CEL-XI-12',
      nombre: 'Smartphone Note 12',
      marca: 'Xiaomi',
      modelo: 'Redmi Note',
      categoria: 'Celulares',
      stock: 25,
      precio: 210,
      imagen: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=300&q=80'
    }
  ]);

  // Estados Bodega (Formulario y Cámara)
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

  // Estados Vendedor (Caja y Catálogo)
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [busquedaVendedor, setBusquedaVendedor] = useState('');
  const [ventaExitosa, setVentaExitosa] = useState(false);

  // Procesar Login
  const handleLogin = (e?: React.FormEvent, rolForzado?: string) => {
    if (e) e.preventDefault();
    const rol = rolForzado || usuario.toLowerCase().trim();

    if (['bodega', 'vendedor', 'chofer', 'jefe'].includes(rol)) {
      setVistaActual(rol as any);
    } else {
      alert('⚠️ Usuario o clave incorrecta. Usa los accesos rápidos de abajo (clave: 1234)');
    }
  };

  // Capturar foto de la cámara en Bodega
  const handleCapturarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagenPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Registrar producto en Bodega
  const registrarProducto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo || !nombre || !stockInicial) {
      alert('⚠️ Faltan campos obligatorios.');
      return;
    }

    setGuardando(true);
    const nuevoItem: Producto = {
      id: Date.now().toString(),
      codigo,
      nombre,
      marca,
      modelo,
      categoria,
      stock: parseInt(stockInicial, 10) || 0,
      precio: parseFloat(precio) || 0,
      imagen: imagenPreview || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=300&q=80'
    };

    setProductos([nuevoItem, ...productos]);
    setCodigo('');
    setNombre('');
    setMarca('');
    setModelo('');
    setStockInicial('');
    setPrecio('');
    setImagenPreview(null);
    setGuardando(false);
    alert('✅ ¡Producto guardado con éxito!');
  };

  const actualizarStock = (id: string, delta: number) => {
    setProductos(productos.map(p => p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p));
  };

  // Funciones de Vendedor (Caja)
  const agregarAlCarrito = (prod: Producto) => {
    if (prod.stock <= 0) {
      alert('⚠️ No hay stock disponible de este producto.');
      return;
    }
    const existe = carrito.find(item => item.id === prod.id);
    if (existe) {
      if (existe.cantidadVenta >= prod.stock) {
        alert('⚠️ No puedes agregar más unidades de las que hay en stock.');
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

  const procesarVenta = () => {
    if (carrito.length === 0) return;

    // Descontar stock real
    let nuevosProductos = [...productos];
    carrito.forEach(itemCar => {
      nuevosProductos = nuevosProductos.map(p => p.id === itemCar.id ? { ...p, stock: Math.max(0, p.stock - itemCar.cantidadVenta) } : p);
    });

    setProductos(nuevosProductos);
    setCarrito([]);
    setVentaExitosa(true);
    setTimeout(() => setVentaExitosa(false), 4000);
  };

  const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0);

  // ── 1. VISTA DE LOGIN ──
  if (vistaActual === 'login') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
          
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#1f2937', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#facc15', fontSize: '24px', border: '1px solid #374151' }}>⚡</div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: 0 }}>Tienda-SS</h1>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Sistema Logístico e Inventario Profesional</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Usuario de acceso</label>
              <input
                type="text"
                placeholder="ej. bodega, vendedor, chofer, jefe"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Contraseña</label>
              <input
                type="password"
                placeholder="********"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '12px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}
            >
              Iniciar Sesión
            </button>
          </form>

          {/* Accesos Rápidos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #1f2937', paddingTop: '16px' }}>
            <span style={{ fontSize: '10px', color: '#6b7280', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Accesos Rápidos (Clave: 1234)</span>
            
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

  // ── 2. VISTA DE BODEGA ──
  if (vistaActual === 'bodega') {
    const productosFiltrados = productos.filter(p => 
      p.nombre.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busquedaBodega.toLowerCase()) ||
      p.marca.toLowerCase().includes(busquedaBodega.toLowerCase())
    );

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif', boxSizing: 'border-box', width: '100%', overflowX: 'hidden' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: '0 0 2px 0' }}>📦 Tienda-SS</h1>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Módulo de Bodega</p>
            </div>
            <button
              onClick={() => setVistaActual('login')}
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
            >
              🚪 Cerrar Sesión
            </button>
          </div>

          <form onSubmit={registrarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box', width: '100%' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Registrar Nuevo Producto</h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#030712', padding: '8px', borderRadius: '10px', border: '1px solid #374151', boxSizing: 'border-box', width: '100%' }}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handleCapturarFoto}
                style={{ display: 'none' }}
              />
              <div style={{ width: '45px', height: '45px', borderRadius: '8px', backgroundColor: '#1f2937', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {imagenPreview ? (
                  <img src={imagenPreview} alt="Cam" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '18px' }}>📷</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                >
                  📸 Tomar Foto con Cámara
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <input
                type="text"
                placeholder="Código / SKU"
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                style={{ flex: 1, minWidth: 0, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                style={{ flex: 1, minWidth: 0, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="Electrodomésticos">Electrodomésticos</option>
                <option value="Motos y Vehículos">Motos y Vehículos</option>
                <option value="Celulares">Celulares</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Nombre del producto"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
            />

            <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <input
                type="text"
                placeholder="Marca"
                value={marca}
                onChange={e => setMarca(e.target.value)}
                style={{ flex: 1, minWidth: 0, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                type="text"
                placeholder="Modelo"
                value={modelo}
                onChange={e => setModelo(e.target.value)}
                style={{ flex: 1, minWidth: 0, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
              <input
                type="number"
                placeholder="Stock inicial"
                value={stockInicial}
                onChange={e => setStockInicial(e.target.value)}
                style={{ flex: 1, minWidth: 0, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
              <input
                type="number"
                placeholder="Precio ($)"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                style={{ flex: 1, minWidth: 0, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={guardando}
              style={{ backgroundColor: guardando ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%' }}
            >
              {guardando ? 'Guardando...' : 'Guardar Producto en Bodega 🚀'}
            </button>
          </form>

          {/* Listado de Existencias */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', margin: 0 }}>📋 Existencias Actuales ({productosFiltrados.length})</h2>
            
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, marca o código..."
              value={busquedaBodega}
              onChange={e => setBusquedaBodega(e.target.value)}
              style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />

            {productosFiltrados.map(prod => (
              <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <img src={prod.imagen} alt={prod.nombre} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px', backgroundColor: '#1f2937', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{prod.stock} unids</span>
                    </div>
                    <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: '2px 0' }}>{prod.nombre}</h3>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>{prod.marca} - {prod.modelo} | <b>${prod.precio}</b></p>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #1f2937', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: '#ef4444' }}>🔻 Salida de Stock:</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {[-1, -5, -10, -50].map(val => (
                      <button key={val} onClick={() => actualizarStock(prod.id, val)} style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', padding: '4px 0', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>{val}</button>
                    ))}
                  </div>

                  <span style={{ fontSize: '9px', color: '#10b981', marginTop: '2px' }}>➕ Entrada de Stock:</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {[1, 5, 10, 50].map(val => (
                      <button key={val} onClick={() => actualizarStock(prod.id, val)} style={{ flex: 1, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '4px', padding: '4px 0', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>+{val}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    );
  }

  // ── 3. VISTA DE VENDEDOR (Caja y Catálogo Operativo) ──
  if (vistaActual === 'vendedor') {
    const catalogoFiltrado = productos.filter(p => 
      p.nombre.toLowerCase().includes(busquedaVendedor.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busquedaVendedor.toLowerCase()) ||
      p.categoria.toLowerCase().includes(busquedaVendedor.toLowerCase())
    );

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#f3f4f6', padding: '12px', fontFamily: 'sans-serif', boxSizing: 'border-box', width: '100%', overflowX: 'hidden' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
          
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
            <div>
              <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8', margin: '0 0 2px 0' }}>🛒 Tienda-SS</h1>
              <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Caja y Catálogo de Vendedor</p>
            </div>
            <button
              onClick={() => setVistaActual('login')}
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
            >
              🚪 Cerrar Sesión
            </button>
          </div>

          {ventaExitosa && (
            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#34d399', padding: '12px', borderRadius: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 700 }}>
              🎉 ¡Venta procesada con éxito! Stock actualizado en bodega.
            </div>
          )}

          {/* Carrito de Venta Actual */}
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', margin: 0 }}>🛍️ Carrito de Venta</h2>
            
            {carrito.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, textAlign: 'center', padding: '10px 0' }}>El carrito está vacío. Selecciona productos abajo.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {carrito.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#030712', padding: '8px 10px', borderRadius: '8px', border: '1px solid #374151' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff', display: 'block' }}>{item.nombre}</span>
                      <span style={{ fontSize: '10px', color: '#34d399' }}>${item.precio} c/u</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={() => cambiarCantidadCarrito(item.id, -1)} style={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>-</button>
                      <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '15px', textAlign: 'center' }}>{item.cantidadVenta}</span>
                      <button onClick={() => cambiarCantidadCarrito(item.id, 1)} style={{ backgroundColor: '#1f2937', color: '#fff', border: 'none', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>+</button>
                    </div>
                  </div>
                ))}

                <div style={{ borderTop: '1px solid #1f2937', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Total a Pagar:</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#34d399' }}>${totalVenta.toFixed(2)}</span>
                </div>

                <button
                  onClick={procesarVenta}
                  style={{ backgroundColor: '#10b981', color: '#030712', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', marginTop: '4px' }}
                >
                  💳 Cobrar y Facturar
                </button>
              </div>
            )}
          </div>

          {/* Catálogo Disponible */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#facc15', margin: 0 }}>📦 Catálogo de Productos</h2>
            
            <input
              type="text"
              placeholder="🔍 Buscar producto para vender..."
              value={busquedaVendedor}
              onChange={e => setBusquedaVendedor(e.target.value)}
              style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />

            {catalogoFiltrado.map(prod => (
              <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <img src={prod.imagen} alt={prod.nombre} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px', backgroundColor: '#1f2937', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: '9px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                    <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: '2px 0' }}>{prod.nombre}</h3>
                    <p style={{ fontSize: '10px', color: '#34d399', margin: 0 }}>${prod.precio} | Stock: {prod.stock}</p>
                  </div>
                </div>
                <button
                  onClick={() => agregarAlCarrito(prod)}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                >
                  ➕ Agregar
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    );
  }

  // ── 4. VISTAS DE CHOFER Y JEFE ──
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#030712', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '24px', borderRadius: '16px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <h2 style={{ color: vistaActual === 'chofer' ? '#facc15' : '#f87171', marginBottom: '8px', textTransform: 'uppercase' }}>Módulo de {vistaActual}</h2>
        <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '20px' }}>Panel operativo activo y conectado al sistema central.</p>
        <button
          onClick={() => setVistaActual('login')}
          style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%' }}
        >
          ⬅️ Volver al Inicio / Login
        </button>
      </div>
    </div>
  );
}

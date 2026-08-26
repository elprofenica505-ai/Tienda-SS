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

interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
}

export default function TiendaSSApp() {
  const [vistaActual, setVistaActual] = useState<'login' | 'bodega' | 'vendedor' | 'chofer' | 'jefe'>('login');
  
  // Login
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

  // Productos compartidos
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

  // Cámara Bodega
  const handleCapturarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagenPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Registrar producto
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
    setCodigo(''); setNombre(''); setMarca(''); setModelo('');
    setStockInicial(''); setPrecio(''); setImagenPreview(null);
    setGuardando(false);
    alert('✅ ¡Producto guardado con éxito!');
  };

  const actualizarStock = (id: string, delta: number) => {
    setProductos(productos.map(p => p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p));
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

  const procesarVenta = () => {
    if (carrito.length === 0) return;
    let nuevosProductos = [...productos];
    carrito.forEach(itemCar => {
      nuevosProductos = nuevosProductos.map(p => 
        p.id === itemCar.id ? { ...p, stock: Math.max(0, p.stock - itemCar.cantidadVenta) } : p
      );
    });
    setProductos(nuevosProductos);
    setCarrito([]);
    setVentaExitosa(true);
    setTimeout(() => setVentaExitosa(false), 4000);
  };

  const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cantidadVenta), 0);

  // Chofer
  const cambiarEstadoEntrega = (id: number, nuevoEstado: 'Pendiente' | 'En Ruta' | 'Entregado') => {
    setEntregas(entregas.map(e => e.id === id ? { ...e, estado: nuevoEstado } : e));
  };

  // ========== VISTA LOGIN ==========
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

  // ========== VISTA BODEGA ==========
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

          <form onSubmit={registrarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Registrar Nuevo Producto</h2>
            <input type="text" placeholder="Código / SKU" value={codigo} onChange={e => setCodigo(e.target.value)} required
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
            <input type="text" placeholder="Nombre del producto" value={nombre} onChange={e => setNombre(e.target.value)} required
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input type="text" placeholder="Marca" value={marca} onChange={e => setMarca(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
              <input type="text" placeholder="Modelo" value={modelo} onChange={e => setModelo(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }} />
            </div>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}>
              <option>Electrodomésticos</option>
              <option>Motos y Vehículos</option>
              <option>Celulares</

'use client';
import React, { useState, useRef, useEffect } from 'react';
// Importa tus dependencias reales de Firebase si ya las tienes:
// import { db } from '../../lib/firebase';
// import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';

interface ProductoBodega {
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

export file function ControlBodegaReal() {
  // Estado con productos de ejemplo (aquí se conectaría con onSnapshot de Firebase)
  const [productos, setProductos] = useState<ProductoBodega[]>([
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
      codigo: 'MOT-CHN-EV',
      nombre: 'Moto Eléctrica Urbana',
      marca: 'Super Soco',
      modelo: 'TSX Pro 2026',
      categoria: 'Motos y Vehículos',
      stock: 8,
      precio: 1250,
      imagen: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=300&q=80'
    }
  ]);

  // Estados del Formulario de Registro
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [categoria, setCategoria] = useState('Electrodomésticos');
  const [stockInicial, setStockInicial] = useState('');
  const [precio, setPrecio] = useState('');
  
  // Captura de Cámara Nativa
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Buscador y Filtro
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [guardando, setGuardando] = useState(false);

  // Manejar foto de la cámara
  const handleCapturarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagenPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Agregar nuevo producto a la base de datos
  const registrarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo || !nombre || !stockInicial) {
      alert('⚠️ Faltan campos obligatorios (Código, Nombre o Stock).');
      return;
    }

    setGuardando(true);

    try {
      const nuevoItem: ProductoBodega = {
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

      // ── AQUÍ SE GUARDA EN FIREBASE FIRESTORE ──
      // await addDoc(collection(db, "productos_bodega"), nuevoItem);

      setProductos(prev => [nuevoItem, ...prev]);

      // Limpiar formulario
      setCodigo('');
      setNombre('');
      setMarca('');
      setModelo('');
      setStockInicial('');
      setPrecio('');
      setImagenPreview(null);

      alert('✅ ¡Producto registrado y sincronizado con Ventas y Gerencia!');
    } catch (error) {
      console.error(error);
      alert('❌ Error al registrar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  // Modificar stock rápido (+1, -5, etc.)
  const actualizarStock = async (id: number | string, cantidadDelta: number) => {
    setProductos(prev => prev.map(prod => {
      if (prod.id === id) {
        const nuevoStock = Math.max(0, prod.stock + cantidadDelta);
        
        // ── AQUÍ ACTUALIZARÍAS EN FIREBASE ──
        // await updateDoc(doc(db, "productos_bodega", id), { stock: nuevoStock });

        return { ...prod, stock: nuevoStock };
      }
      return prod;
    }));
  };

  // Filtrado de productos
  const productosFiltrados = productos.filter(p => {
    const textoMatch = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
                       p.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
                       p.marca.toLowerCase().includes(busqueda.toLowerCase()) ||
                       p.modelo.toLowerCase().includes(busqueda.toLowerCase());
    const catMatch = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro;
    return textoMatch && catMatch;
  });

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#030712',
      color: '#f3f4f6',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Encabezado */}
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '20px', padding: '16px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px 0' }}>📦 Tienda-SS - Control Logístico</h1>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Sincronización en tiempo real con Bodega, Ventas y Gerencia.</p>
        </div>

        {/* Formulario de Registro con Cámara */}
        <form onSubmit={registrarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Registrar Nuevo Producto (Motos, TV, etc.)</h2>

          {/* Botón de Cámara nativa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#030712', padding: '10px', borderRadius: '12px', border: '1px solid #374151' }}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleCapturarFoto}
              style={{ display: 'none' }}
            />
            <div style={{ width: '55px', height: '55px', borderRadius: '10px', backgroundColor: '#1f2937', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {imagenPreview ? (
                <img src={imagenPreview} alt="Cam" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '20px' }}>📷</span>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
              >
                📸 Tomar Foto con Cámara
              </button>
              <span style={{ fontSize: '9px', color: '#9ca3af' }}>Reemplaza la URL por captura directa.</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Código / SKU (Ej. MOT-01)"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            />
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            >
              <option value="Electrodomésticos">Electrodomésticos</option>
              <option value="Motos y Vehículos">Motos y Vehículos</option>
              <option value="Celulares">Celulares</option>
              <option value="Hogar">Hogar</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Nombre del producto (Ej. Moto Eléctrica)"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
          />

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Marca (Ej. Super Soco)"
              value={marca}
              onChange={e => setMarca(e.target.value)}
              style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            />
            <input
              type="text"
              placeholder="Modelo (Ej. TSX Pro)"
              value={modelo}
              onChange={e => setModelo(e.target.value)}
              style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="number"
              placeholder="Stock inicial"
              value={stockInicial}
              onChange={e => setStockInicial(e.target.value)}
              style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            />
            <input
              type="number"
              placeholder="Precio ($ USD)"
              value={precio}
              onChange={e => setPrecio(e.target.value)}
              style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            />
          </div>

          <button
            type="submit"
            disabled={guardando}
            style={{ backgroundColor: guardando ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginTop: '4px' }}
          >
            {guardando ? 'Guardando en la Nube...' : 'Guardar Producto en Bodega 🚀'}
          </button>
        </form>

        {/* Listado y Existencias Actuales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', margin: 0 }}>📋 Existencias Actuales</h2>
          
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, marca, modelo o código..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '12px', padding: '12px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%' }}
          />

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {['Todas', 'Electrodomésticos', 'Motos y Vehículos', 'Celulares', 'Hogar'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaFiltro(cat)}
                style={{
                  backgroundColor: categoriaFiltro === cat ? '#4f46e5' : '#111827',
                  color: categoriaFiltro === cat ? '#fff' : '#9ca3af',
                  border: '1px solid #374151',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {productosFiltrados.map(prod => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <img src={prod.imagen} alt={prod.nombre} style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: '10px', backgroundColor: '#1f2937' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700, backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>{prod.stock} unidades</span>
                  </div>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#fff', margin: '2px 0' }}>{prod.nombre}</h3>
                  <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Marca: <strong>{prod.marca}</strong> | Modelo: <strong>{prod.modelo}</strong></p>
                </div>
              </div>

              {/* Botones de control rápido de stock */}
              <div style={{ borderTop: '1px solid #1f2937', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: '#ef4444' }}>🔻 Salida de Stock:</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[-1, -5, -10, -50, -100].map(val => (
                    <button
                      key={val}
                      onClick={() => actualizarStock(prod.id, val)}
                      style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '6px 0', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                <span style={{ fontSize: '10px', color: '#10b981', marginTop: '2px' }}>➕ Entrada de Stock:</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[1, 5, 10, 50, 100].map(val => (
                    <button
                      key={val}
                      onClick={() => actualizarStock(prod.id, val)}
                      style={{ flex: 1, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', padding: '6px 0', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      +{val}
                    </button>
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

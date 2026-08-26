'use client';
import React, { useState, useRef } from 'react';

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

export default function ControlBodegaReal() {
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

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [categoria, setCategoria] = useState('Electrodomésticos');
  const [stockInicial, setStockInicial] = useState('');
  const [precio, setPrecio] = useState('');
  
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [guardando, setGuardando] = useState(false);

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

      setProductos(prev => [nuevoItem, ...prev]);

      setCodigo('');
      setNombre('');
      setMarca('');
      setModelo('');
      setStockInicial('');
      setPrecio('');
      setImagenPreview(null);

      alert('✅ ¡Producto registrado exitosamente!');
    } catch (error) {
      console.error(error);
      alert('❌ Error al registrar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  const actualizarStock = (id: string, cantidadDelta: number) => {
    setProductos(prev => prev.map(prod => {
      if (prod.id === id) {
        const nuevoStock = Math.max(0, prod.stock + cantidadDelta);
        return { ...prod, stock: nuevoStock };
      }
      return prod;
    }));
  };

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
      padding: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
      width: '100%',
      overflowX: 'hidden'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
        
        {/* Barra de Navegación / Header Superior con Botón de Salida */}
        <div style={{ 
          backgroundColor: '#111827', 
          border: '1px solid #1f2937', 
          borderRadius: '16px', 
          padding: '12px 16px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          boxSizing: 'border-box',
          width: '100%'
        }}>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: '0 0 2px 0' }}>📦 Tienda-SS</h1>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Módulo de Bodega</p>
          </div>
          <button
            onClick={() => window.location.href = '/'} // O cambia la ruta de tu página de inicio/login
            style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.15)', 
              color: '#f87171', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              padding: '6px 12px', 
              borderRadius: '8px', 
              fontSize: '11px', 
              fontWeight: 700, 
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            🚪 Salir / Inicio
          </button>
        </div>

        {/* Formulario de Registro */}
        <form onSubmit={registrarProducto} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box', width: '100%' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Registrar Nuevo Producto</h2>

          {/* Botón de Cámara */}
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
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', width: '100%' }}
              >
                📸 Tomar Foto
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
              <option value="Hogar">Hogar</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Nombre del producto (Ej. Moto Eléctrica)"
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
            style={{ backgroundColor: guardando ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
          >
            {guardando ? 'Guardando...' : 'Guardar Producto en Bodega 🚀'}
          </button>
        </form>

        {/* Sección de Existencias Actuales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', margin: 0 }}>📋 Existencias Actuales</h2>
          
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, marca o código..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none', boxSizing: 'border-box', width: '100%' }}
          />

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', width: '100%' }}>
            {['Todas', 'Electrodomésticos', 'Motos y Vehículos', 'Celulares', 'Hogar'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaFiltro(cat)}
                style={{
                  backgroundColor: categoriaFiltro === cat ? '#4f46e5' : '#111827',
                  color: categoriaFiltro === cat ? '#fff' : '#9ca3af',
                  border: '1px solid #374151',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {productosFiltrados.map(prod => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box', width: '100%' }}>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
                <img src={prod.imagen} alt={prod.nombre} style={{ width: '55px', height: '55px', objectFit: 'cover', borderRadius: '8px', backgroundColor: '#1f2937', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                    <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{prod.stock} unids</span>
                  </div>
                  <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.nombre}</h3>
                  <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.marca} - {prod.modelo}</p>
                </div>
              </div>

              {/* Controles de Stock compactos y seguros en pantalla */}
              <div style={{ borderTop: '1px solid #1f2937', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', boxSizing: 'border-box' }}>
                <span style={{ fontSize: '9px', color: '#ef4444' }}>🔻 Salida de Stock:</span>
                <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
                  {[-1, -5, -10, -50, -100].map(val => (
                    <button
                      key={val}
                      onClick={() => actualizarStock(prod.id, val)}
                      style={{ flex: 1, minWidth: 0, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', padding: '4px 0', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                <span style={{ fontSize: '9px', color: '#10b981', marginTop: '2px' }}>➕ Entrada de Stock:</span>
                <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
                  {[1, 5, 10, 50, 100].map(val => (
                    <button
                      key={val}
                      onClick={() => actualizarStock(prod.id, val)}
                      style={{ flex: 1, minWidth: 0, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '4px', padding: '4px 0', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
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

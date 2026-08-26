'use client';
import React, { useState } from 'react';

interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  marca: string;
  modelo: string;
  categoria: string;
  imagen: string;
  stock: number;
  minimo: number;
}

export default function InventarioBodega() {
  const [productos, setProductos] = useState<Producto[]>([
    {
      id: 1,
      codigo: 'TV-SON-55',
      nombre: 'Smart TV 4K UHD',
      marca: 'Sony',
      modelo: 'Bravia X80K',
      categoria: 'Electrodomésticos',
      imagen: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=300&q=80',
      stock: 12,
      minimo: 3
    },
    {
      id: 2,
      codigo: 'MOT-CHN-EV',
      nombre: 'Moto Eléctrica Urbana',
      marca: 'Super Soco',
      modelo: 'TSX Pro 2026',
      categoria: 'Motos y Vehículos',
      imagen: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=300&q=80',
      stock: 8,
      minimo: 2
    },
    {
      id: 3,
      codigo: 'CEL-INF-50',
      nombre: 'Smartphone Gamer',
      marca: 'Infinix',
      modelo: 'Note 50 Pro Rider',
      categoria: 'Celulares y Tecnología',
      imagen: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=300&q=80',
      stock: 25,
      minimo: 5
    }
  ]);

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [categoria, setCategoria] = useState('Electrodomésticos');
  const [imagen, setImagen] = useState('');
  const [stockInicial, setStockInicial] = useState('');
  
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');

  const agregarProducto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !stockInicial) return;

    const nuevoItem: Producto = {
      id: Date.now(),
      codigo: codigo.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      nombre,
      marca: marca.trim() || 'Genérica',
      modelo: modelo.trim() || 'Estándar',
      categoria,
      imagen: imagen.trim() || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=300&q=80',
      stock: parseInt(stockInicial),
      minimo: 3
    };

    setProductos([nuevoItem, ...productos]);
    setCodigo('');
    setNombre('');
    setMarca('');
    setModelo('');
    setImagen('');
    setStockInicial('');
  };

  const ajustarStock = (id: number, cantidad: number) => {
    setProductos(
      productos.map((p) => {
        if (p.id === id) {
          const nuevoStock = Math.max(0, p.stock + cantidad);
          return { ...p, stock: nuevoStock };
        }
        return p;
      })
    );
  };

  const productosFiltrados = productos.filter(p => {
    const coincideTexto = 
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.marca.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.modelo.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busqueda.toLowerCase());
    
    const coincideCat = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro;
    return coincideTexto && coincideCat;
  });

  const totalProductos = productos.length;
  const stockCritico = productos.filter(p => p.stock <= p.minimo).length;
  const unidadesTotales = productos.reduce((acc, p) => acc + p.stock, 0);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#030712',
      color: '#f3f4f6',
      padding: '20px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Encabezado */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', margin: '0 0 2px 0' }}>📦 Bodega y Logística Tienda-SS</h1>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Control avanzado de inventario y entradas masivas</p>
            </div>
            <span style={{
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 600
            }}>
              Bodeguero
            </span>
          </div>

          {/* Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', display: 'block' }}>{totalProductos}</span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Referencias</span>
            </div>
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', display: 'block' }}>{unidadesTotales}</span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Stock Global</span>
            </div>
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: stockCritico > 0 ? '#fb7185' : '#34d399', display: 'block' }}>{stockCritico}</span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Críticos</span>
            </div>
          </div>
        </div>

        {/* Formulario Completo */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '20px'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: '0 0 14px 0' }}>➕ Registrar Nuevo Producto (Motos, TV, etc.)</h2>
          <form onSubmit={agregarProducto} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="text"
                placeholder="Código / SKU (Ej. MOT-01)"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none' }}
              />
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none' }}
              >
                <option value="Electrodomésticos">Electrodomésticos</option>
                <option value="Motos y Vehículos">Motos y Vehículos</option>
                <option value="Muebles/Hogar">Muebles / Hogar</option>
                <option value="Celulares y Tecnología">Celulares y Tech</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Nombre del producto (Ej. Moto Eléctrica)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="text"
                placeholder="Marca (Ej. Super Soco)"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none' }}
              />
              <input
                type="text"
                placeholder="Modelo (Ej. TSX Pro)"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
              <input
                type="url"
                placeholder="URL de foto (Imagen web o link)"
                value={imagen}
                onChange={(e) => setImagen(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none' }}
              />
              <input
                type="number"
                placeholder="Stock inicial"
                value={stockInicial}
                onChange={(e) => setStockInicial(e.target.value)}
                style={{ backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#ffffff', outline: 'none' }}
                required
              />
            </div>

            <button
              type="submit"
              style={{
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                fontWeight: 600,
                borderRadius: '10px',
                padding: '12px',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '4px',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
              }}
            >
              Guardar Producto en Bodega
            </button>
          </form>
        </div>

        {/* Existencias y Filtros por Categoría */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', margin: 0 }}>📋 Existencias Actuales</h2>
            
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, marca, modelo o código..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid #374151',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#ffffff',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box'
              }}
            />

            {/* Selector de categoría */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {['Todas', 'Electrodomésticos', 'Motos y Vehículos', 'Muebles/Hogar', 'Celulares y Tecnología'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaFiltro(cat)}
                  style={{
                    backgroundColor: categoriaFiltro === cat ? '#4f46e5' : '#030712',
                    color: categoriaFiltro === cat ? '#ffffff' : '#9ca3af',
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
          </div>

          {/* Tarjetas de inventario */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {productosFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '20px' }}>No hay productos en esta categoría.</p>
            ) : (
              productosFiltrados.map((prod) => {
                const esCritico = prod.stock <= prod.minimo;
                return (
                  <div key={prod.id} style={{
                    backgroundColor: '#030712',
                    border: '1px solid #1f2937',
                    borderRadius: '14px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <img
                        src={prod.imagen}
                        alt={prod.nombre}
                        style={{
                          width: '64px',
                          height: '64px',
                          objectFit: 'cover',
                          borderRadius: '10px',
                          border: '1px solid #374151',
                          backgroundColor: '#1f2937'
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#818cf8', fontWeight: 700 }}>
                            {prod.codigo}
                          </span>
                          <span style={{
                            backgroundColor: esCritico ? 'rgba(244, 63, 94, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                            color: esCritico ? '#fb7185' : '#34d399',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700
                          }}>
                            {prod.stock} unids {esCritico && '⚠️'}
                          </span>
                        </div>

                        <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', margin: '2px 0' }}>
                          {prod.nombre}
                        </h3>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>
                          Marca: <strong style={{ color: '#e5e7eb' }}>{prod.marca}</strong> | Modelo: <strong style={{ color: '#e5e7eb' }}>{prod.modelo}</strong>
                        </p>
                        <span style={{ fontSize: '10px', color: '#6b7280', display: 'block', marginTop: '2px' }}>
                          Categoría: {prod.categoria}
                        </span>
                      </div>
                    </div>

                    {/* Controles de lotes masivos (+/- 1, 5, 10, 50, 100) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '6px', borderTop: '1px solid #1f2937' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>🔻 Salida de Stock:</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                        {[1, 5, 10, 50, 100].map((cant) => (
                          <button
                            key={`sub-${cant}`}
                            onClick={() => ajustarStock(prod.id, -cant)}
                            style={{
                              backgroundColor: 'rgba(244, 63, 94, 0.15)',
                              color: '#fb7185',
                              border: '1px solid rgba(244, 63, 94, 0.3)',
                              padding: '6px 2px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'center'
                            }}
                          >
                            -{cant}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>➕ Entrada de Stock:</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                        {[1, 5, 10, 50, 100].map((cant) => (
                          <button
                            key={`add-${cant}`}
                            onClick={() => ajustarStock(prod.id, cant)}
                            style={{
                              backgroundColor: 'rgba(52, 211, 153, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                              padding: '6px 2px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'center'
                            }}
                          >
                            +{cant}
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

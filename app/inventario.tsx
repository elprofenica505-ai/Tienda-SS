'use client';
import React, { useState } from 'react';

interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  stock: number;
  minimo: number;
}

export default function InventarioBodega() {
  const [productos, setProductos] = useState<Producto[]>([
    { id: 1, nombre: 'Smart TV Sony 55"', categoria: 'Electrodomésticos', stock: 12, minimo: 3 },
    { id: 2, nombre: 'Cama King Size ortopédica', categoria: 'Muebles/Hogar', stock: 5, minimo: 2 },
    { id: 3, nombre: 'Infinix Note 50 Pro', categoria: 'Celulares', stock: 25, minimo: 5 },
    { id: 4, nombre: 'Juego de Sala Esquinero', categoria: 'Muebles/Hogar', stock: 4, minimo: 2 },
  ]);

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [categoriaNueva, setCategoriaNueva] = useState('Electrodomésticos');
  const [stockNuevo, setStockNuevo] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const agregarProducto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreNuevo || !stockNuevo) return;

    const nuevoItem: Producto = {
      id: Date.now(),
      nombre: nombreNuevo,
      categoria: categoriaNueva,
      stock: parseInt(stockNuevo),
      minimo: 2,
    };

    setProductos([...productos, nuevoItem]);
    setNombreNuevo('');
    setStockNuevo('');
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

  const productosFiltrados = productos.filter(p => 
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busqueda.toLowerCase())
  );

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
      <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Cabecera limpia */}
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
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', margin: '0 0 2px 0' }}>📦 Bodega Tienda-SS</h1>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Gestión de inventario y existencias</p>
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

          {/* Tarjetas de Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', display: 'block' }}>{totalProductos}</span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Items</span>
            </div>
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#34d399', display: 'block' }}>{unidadesTotales}</span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Total Unidades</span>
            </div>
            <div style={{ backgroundColor: '#030712', border: '1px solid #1f2937', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: stockCritico > 0 ? '#fb7185' : '#34d399', display: 'block' }}>{stockCritico}</span>
              <span style={{ fontSize: '10px', color: '#9ca3af' }}>Críticos</span>
            </div>
          </div>
        </div>

        {/* Sección Registrar Producto */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '20px'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: '0 0 12px 0' }}>➕ Registrar Nueva Mercadería</h2>
          <form onSubmit={agregarProducto} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              placeholder="Nombre del producto (ej. Refrigeradora)"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid #374151',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '13px',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
                width: '100%'
              }}
              required
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select
                value={categoriaNueva}
                onChange={(e) => setCategoriaNueva(e.target.value)}
                style={{
                  backgroundColor: '#030712',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '12px',
                  color: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              >
                <option value="Electrodomésticos">Electrodomésticos</option>
                <option value="Muebles/Hogar">Muebles / Hogar</option>
                <option value="Celulares">Celulares / Tech</option>
              </select>
              <input
                type="number"
                placeholder="Stock inicial"
                value={stockNuevo}
                onChange={(e) => setStockNuevo(e.target.value)}
                style={{
                  backgroundColor: '#030712',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
                required
              />
            </div>
            <button
              type="submit"
              style={{
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                fontWeight: 600,
                borderRadius: '12px',
                padding: '12px',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '4px',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
              }}
            >
              Guardar en Bodega
            </button>
          </form>
        </div>

        {/* Listado de Productos Estilo Tarjetas Móviles */}
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
              placeholder="🔍 Buscar producto en bodega..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid #374151',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
                width: '100%'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {productosFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '20px' }}>Sin resultados.</p>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', display: 'block', marginBottom: '2px' }}>
                          {prod.nombre}
                        </span>
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>{prod.categoria}</span>
                      </div>
                      <span style={{
                        backgroundColor: esCritico ? 'rgba(244, 63, 94, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                        color: esCritico ? '#fb7185' : '#34d399',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        {prod.stock} unids {esCritico && '⚠️'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '4px', borderTop: '1px solid #1f2937' }}>
                      <button
                        onClick={() => ajustarStock(prod.id, -1)}
                        style={{
                          backgroundColor: 'rgba(244, 63, 94, 0.15)',
                          color: '#fb7185',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          padding: '8px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ➖ Salida (-1)
                      </button>
                      <button
                        onClick={() => ajustarStock(prod.id, 1)}
                        style={{
                          backgroundColor: 'rgba(52, 211, 153, 0.15)',
                          color: '#34d399',
                          border: '1px solid rgba(52, 211, 153, 0.3)',
                          padding: '8px',
                          borderRadius: '10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        ➕ Entrada (+1)
                      </button>
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

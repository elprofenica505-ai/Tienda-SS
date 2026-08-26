'use client';
import React, { useState } from 'react';

interface ProductoVenta {
  id: number;
  codigo: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  imagen: string;
}

interface ItemCarrito extends ProductoVenta {
  cantidadVenta: number;
}

export default function CajaVentas() {
  const [productos] = useState<ProductoVenta[]>([
    {
      id: 1,
      codigo: 'TV-SON-55',
      nombre: 'Smart TV Sony 55"',
      precio: 450,
      stock: 12,
      categoria: 'Electrodomésticos',
      imagen: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: 2,
      codigo: 'CAM-KIN-01',
      nombre: 'Cama King Size Ortopédica',
      precio: 320,
      stock: 5,
      categoria: 'Muebles/Hogar',
      imagen: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: 3,
      codigo: 'CEL-INF-50',
      nombre: 'Infinix Note 50 Pro',
      precio: 230,
      stock: 25,
      categoria: 'Celulares',
      imagen: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: 4,
      codigo: 'SOF-ESQ-01',
      nombre: 'Juego de Sala Esquinero',
      precio: 580,
      stock: 3,
      categoria: 'Muebles/Hogar',
      imagen: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=300&q=80'
    }
  ]);

  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [modalCobro, setModalCobro] = useState(false);

  const agregarAlCarrito = (prod: ProductoVenta) => {
    setCarrito(prev => {
      const existe = prev.find(item => item.id === prod.id);
      if (existe) {
        if (existe.cantidadVenta < prod.stock) {
          return prev.map(item => item.id === prod.id ? { ...item, cantidadVenta: item.cantidadVenta + 1 } : item);
        }
        return prev;
      }
      return [...prev, { ...prod, cantidadVenta: 1 }];
    });
  };

  const cambiarCantidad = (id: number, delta: number) => {
    setCarrito(prev => prev.map(item => {
      if (item.id === id) {
        const nuevaCant = item.cantidadVenta + delta;
        if (nuevaCant <= 0) return null;
        if (nuevaCant > item.stock) return item;
        return { ...item, cantidadVenta: nuevaCant };
      }
      return item;
    }).filter(Boolean) as ItemCarrito[]);
  };

  const totalPagar = carrito.reduce((acc, item) => acc + (item.precio * item.cantidadVenta), 0);
  const totalArticulos = carrito.reduce((acc, item) => acc + item.cantidadVenta, 0);

  const productosFiltrados = productos.filter(p => {
    const coincideTexto = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCat = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro;
    return coincideTexto && coincideCat;
  });

  const finalizarVenta = () => {
    alert(`¡Venta procesada con éxito! Total cobrado: $${totalPagar} USD`);
    setCarrito([]);
    setModalCobro(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#030712',
      color: '#f3f4f6',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
      paddingBottom: carrito.length > 0 ? '120px' : '20px'
    }}>
      <div style={{ maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Encabezado */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: '0 0 2px 0' }}>🏷️ Caja y Ventas Tienda-SS</h1>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Rol: Vendedor | Facturación Rápida</p>
          </div>
          <button onClick={() => alert('Sesión cerrada')} style={{
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            color: '#fb7185',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            padding: '6px 12px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Cerrar Sesión
          </button>
        </div>

        {/* Buscador y Filtros */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            placeholder="🔍 Buscar producto por nombre o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              backgroundColor: '#111827',
              border: '1px solid #374151',
              borderRadius: '12px',
              padding: '12px 14px',
              fontSize: '13px',
              color: '#ffffff',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box'
            }}
          />

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {['Todas', 'Electrodomésticos', 'Muebles/Hogar', 'Celulares'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaFiltro(cat)}
                style={{
                  backgroundColor: categoriaFiltro === cat ? '#4f46e5' : '#111827',
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

        {/* Catálogo en Tarjetas Visuales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: 0 }}>🛍️ Catálogo Disponible</h2>
          
          {productosFiltrados.map(prod => {
            const enCarrito = carrito.find(item => item.id === prod.id);
            const stockDisponible = prod.stock - (enCarrito ? enCarrito.cantidadVenta : 0);

            return (
              <div key={prod.id} style={{
                backgroundColor: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '16px',
                padding: '14px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
                <img
                  src={prod.imagen}
                  alt={prod.nombre}
                  style={{
                    width: '72px',
                    height: '72px',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    border: '1px solid #374151',
                    backgroundColor: '#1f2937'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase' }}>{prod.categoria}</span>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', margin: '2px 0' }}>{prod.nombre}</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#34d399' }}>${prod.precio} USD</span>
                    <span style={{ fontSize: '10px', color: stockDisponible > 0 ? '#9ca3af' : '#fb7185' }}>
                      Stock: {stockDisponible} unid.
                    </span>
                  </div>

                  <button
                    onClick={() => agregarAlCarrito(prod)}
                    disabled={stockDisponible <= 0}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      backgroundColor: stockDisponible > 0 ? '#4f46e5' : '#374151',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: stockDisponible > 0 ? 'pointer' : 'not-allowed',
                      boxShadow: stockDisponible > 0 ? '0 4px 10px rgba(79, 70, 229, 0.3)' : 'none'
                    }}
                  >
                    {stockDisponible > 0 ? '＋ Agregar a la Venta' : 'Agotado'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Barra Flotante de Carrito / Cobro */}
      {carrito.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#111827',
          borderTop: '1px solid #374151',
          padding: '16px',
          boxShadow: '0 -10px 25px rgba(0,0,0,0.5)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '650px',
          margin: '0 auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>🛒 Carrito Activo ({totalArticulos} ítems)</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#34d399' }}>${totalPagar} USD</span>
            </div>
            <button
              onClick={() => setModalCobro(true)}
              style={{
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
              }}
            >
              Cobrar / Facturar ⚡
            </button>
          </div>

          <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #1f2937', paddingTop: '8px' }}>
            {carrito.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#030712', padding: '6px 10px', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600 }}>{item.nombre}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => cambiarCantidad(item.id, -1)} style={{ background: '#374151', color: '#fff', border: 'none', width: '22px', height: '22px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>-</button>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8' }}>{item.cantidadVenta}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)} style={{ background: '#374151', color: '#fff', border: 'none', width: '22px', height: '22px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>+</button>
                  <span style={{ fontSize: '11px', color: '#34d399', width: '50px', textAlign: 'right' }}>${item.precio * item.cantidadVenta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Cobro */}
      {modalCobro && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 200
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '20px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>💵 Finalizar Facturación</h3>
            
            <div style={{ backgroundColor: '#030712', padding: '14px', borderRadius: '12px', border: '1px solid #1f2937' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>Total Artículos:</span>
                <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600 }}>{totalArticulos} unidades</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1f2937', paddingTop: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Total a Pagar:</span>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#34d399' }}>${totalPagar} USD</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setModalCobro(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={finalizarVenta}
                style={{
                  flex: 1,
                  backgroundColor: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
                }}
              >
                Confirmar Pago ✅
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

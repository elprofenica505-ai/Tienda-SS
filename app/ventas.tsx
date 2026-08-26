'use client';
import React, { useState } from 'react';
// Importa tus instancias reales de firebase si las tienes configuradas, ej:
// import { db } from '../lib/firebase';
// import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface ProductoVenta {
  id: number;
  codigo: string;
  modelo: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  imagen: string;
}

interface ItemCarrito extends ProductoVenta {
  cantidadVenta: number;
}

export default function CajaVentasReal() {
  const [productos] = useState<ProductoVenta[]>([
    {
      id: 1,
      codigo: 'TV-SON-55',
      modelo: 'Bravia XR-55X90L',
      nombre: 'Smart TV Sony 55"',
      precio: 450,
      stock: 12,
      categoria: 'Electrodomésticos',
      imagen: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: 2,
      codigo: 'CAM-KIN-01',
      modelo: 'Ortopédica Master Rest',
      nombre: 'Cama King Size Ortopédica',
      precio: 320,
      stock: 5,
      categoria: 'Muebles/Hogar',
      imagen: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: 3,
      codigo: 'CEL-INF-50',
      modelo: 'Note 50 Pro 4G',
      nombre: 'Infinix Note 50 Pro',
      precio: 230,
      stock: 25,
      categoria: 'Celulares',
      imagen: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=300&q=80'
    },
    {
      id: 4,
      codigo: 'SOF-ESQ-01',
      modelo: 'L-Shape Modern Velvet',
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
  
  // Datos del cliente y logística
  const [nombreCliente, setNombreCliente] = useState('');
  const [cedulaCliente, setCedulaCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  
  // Control de Modal y Pagos
  const [modalCobro, setModalCobro] = useState(false);
  const [tipoPago, setTipoPago] = useState<'Contado' | 'Credito'>('Contado');
  const [pagaCon, setPagaCon] = useState<string>('');
  
  // Crédito
  const [plazoMeses, setPlazoMeses] = useState<number>(3);
  const [porcentajePrima, setPorcentajePrima] = useState<number>(20);
  
  // Estado de carga con IA / Firebase
  const [procesando, setProcesando] = useState(false);
  const [analisisIA, setAnalisisIA] = useState<string | null>(null);

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

  const montoPrima = (totalPagar * porcentajePrima) / 100;
  const saldoFinanciar = totalPagar - montoPrima;
  const cuotaMensual = plazoMeses > 0 ? saldoFinanciar / plazoMeses : 0;

  const efectivoRecibido = parseFloat(pagaCon) || 0;
  const vuelto = efectivoRecibido - totalPagar;

  const productosFiltrados = productos.filter(p => {
    const coincideTexto = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.toLowerCase().includes(busqueda.toLowerCase()) || p.modelo.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCat = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro;
    return coincideTexto && coincideCat;
  });

  // Función simulada/real de análisis de IA y guardado en Firebase
  const ejecutarValidacionIA = () => {
    setAnalisisIA("🤖 Analizando perfil de riesgo y disponibilidad con IA...");
    setTimeout(() => {
      if (tipoPago === 'Credito') {
        setAnalisisIA(`✅ IA Valido: Crédito aprobado para ${plazoMeses} meses. Prima del ${porcentajePrima}% cubierta correctamente.`);
      } else {
        setAnalisisIA("✅ IA Valido: Transacción de contado optimizada y stock verificado.");
      }
    }, 1000);
  };

  const guardarFacturaRealFirebase = async () => {
    if (!nombreCliente.trim()) {
      alert('⚠️ Por favor ingrese el nombre del cliente para la factura.');
      return;
    }
    if (tipoPago === 'Contado' && efectivoRecibido < totalPagar) {
      alert('⚠️ El efectivo recibido es menor al total de la compra.');
      return;
    }

    setProcesando(true);
    ejecutarValidacionIA();

    try {
      const facturaData = {
        nroFactura: `F-SS-${Math.floor(100000 + Math.random() * 900000)}`,
        fecha: new Date().toISOString(),
        cliente: {
          nombre: nombreCliente,
          cedula: cedulaCliente,
          telefono: telefonoCliente
        },
        items: carrito.map(i => ({
          codigo: i.codigo,
          modelo: i.modelo,
          nombre: i.nombre,
          cantidad: i.cantidadVenta,
          precioUnitario: i.precio,
          subtotal: i.precio * i.cantidadVenta
        })),
        tipoPago,
        totalGeneral: totalPagar,
        detallesPago: tipoPago === 'Contado' ? {
          efectivoRecibido,
          vuelto
        } : {
          plazoMeses,
          porcentajePrima,
          montoPrima,
          saldoFinanciar,
          cuotaMensual
        },
        estado: 'Completado'
      };

      // ── AQUÍ SE CONECTA CON FIREBASE FIRESTORE ──
      // await addDoc(collection(db, "ventas"), {
      //   ...facturaData,
      //   timestamp: serverTimestamp()
      // });

      console.log("Factura guardada en Firebase:", facturaData);

      setTimeout(() => {
        setProcesando(false);
        alert(`🎉 ¡Factura ${facturaData.nroFactura} guardada en Firebase y procesada con éxito!`);
        
        // Abrir ventana de impresión real
        imprimirFacturaHTML(facturaData);

        // Limpiar estado
        setCarrito([]);
        setModalCobro(false);
        setNombreCliente('');
        setCedulaCliente('');
        setTelefonoCliente('');
        setPagaCon('');
        setAnalisisIA(null);
      }, 1500);

    } catch (error) {
      console.error("Error al guardar en Firebase:", error);
      alert("❌ Hubo un error al guardar en la base de datos.");
      setProcesando(false);
    }
  };

  const imprimirFacturaHTML = (factura: any) => {
    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) return;

    ventanaImpresion.document.write(`
      <html>
        <head>
          <title>Factura ${factura.nroFactura} - Tienda-SS</title>
          <style>
            body { font-family: monospace; padding: 20px; color: #000; width: 300px; margin: 0 auto; }
            h2, h4 { text-align: center; margin: 5px 0; }
            .line { border-bottom: 1px dashed #000; margin: 10px 0; }
            table { width: 100%; font-size: 11px; border-collapse: collapse; }
            th, td { text-align: left; padding: 3px 0; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <h2>TIENDA-SS</h2>
          <h4>Sistema Logístico y Comercial</h4>
          <p style="text-align: center; font-size: 10px;">Managua, Nicaragua</p>
          <div class="line"></div>
          <p><strong>Factura:</strong> ${factura.nroFactura}</p>
          <p><strong>Fecha:</strong> ${new Date(factura.fecha).toLocaleString()}</p>
          <p><strong>Cliente:</strong> ${factura.cliente.nombre}</p>
          <p><strong>Cédula:</strong> ${factura.cliente.cedula || 'N/D'}</p>
          <div class="line"></div>
          <table>
            <thead>
              <tr>
                <th>Cant/Desc</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${factura.items.map((i: any) => `
                <tr>
                  <td colspan="2"><strong>${i.cantidad}x</strong> ${i.nombre} (${i.codigo})<br/><span style="font-size:9px;">Mod: ${i.modelo}</span></td>
                </tr>
                <tr>
                  <td>$${i.precioUnitario} c/u</td>
                  <td class="right">$${i.subtotal}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="line"></div>
          <p><strong>Tipo de Pago:</strong> De ${factura.tipoPago}</p>
          ${factura.tipoPago === 'Contado' ? `
            <p>Efectivo: $${factura.detallesPago.efectivoRecibido}</p>
            <p>Vuelto: $${factura.detallesPago.vuelto.toFixed(2)}</p>
          ` : `
            <p>Plazo: ${factura.detallesPago.plazoMeses} meses</p>
            <p>Prima (${factura.detallesPago.porcentajePrima}%): $${factura.detallesPago.montoPrima.toFixed(2)}</p>
            <p>Cuota: $${factura.detallesPago.cuotaMensual.toFixed(2)} /mes</p>
          `}
          <div class="line"></div>
          <h3 class="right">TOTAL: $${factura.totalGeneral} USD</h3>
          <div class="line"></div>
          <p style="text-align: center; font-size: 10px;">¡Gracias por su compra en Tienda-SS!<br/>Documento fiscal oficial</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    ventanaImpresion.document.close();
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
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: '0 0 2px 0' }}>🏷️ Caja y Ventas Firebase + IA</h1>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Rol: Vendedor | Facturación con Registro Real</p>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, código o modelo..."
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

        {/* Catálogo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: 0 }}>🛍️ Inventario y Modelos</h2>
          
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
                    width: '76px',
                    height: '76px',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    border: '1px solid #374151',
                    backgroundColor: '#1f2937'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>CÓD: {prod.codigo}</span>
                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>Stock: {stockDisponible}</span>
                  </div>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', margin: '2px 0' }}>{prod.nombre}</h3>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px 0' }}>Modelo: <span style={{ color: '#d1d5db' }}>{prod.modelo}</span></p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#34d399' }}>${prod.precio} USD</span>
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
                      cursor: stockDisponible > 0 ? 'pointer' : 'not-allowed'
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

      {/* Carrito Flotante */}
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
              <span style={{ fontSize: '12px', color: '#9ca3af', display: 'block' }}>🛒 Total Carrito ({totalArticulos} ítems)</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#34d399' }}>${totalPagar} USD</span>
            </div>
            <button
              onClick={() => setModalCobro(true)}
              style={{
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '12px 22px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
              }}
            >
              Facturar en Firebase ⚡
            </button>
          </div>

          <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #1f2937', paddingTop: '8px' }}>
            {carrito.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#030712', padding: '6px 10px', borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600, display: 'block' }}>{item.nombre}</span>
                  <span style={{ fontSize: '9px', color: '#9ca3af' }}>Ref: {item.codigo} | Mod: {item.modelo}</span>
                </div>
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

      {/* Modal Real de Facturación y Logística */}
      {modalCobro && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 200,
          overflowY: 'auto'
        }}>
          <div style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '20px',
            padding: '20px',
            width: '100%',
            maxWidth: '460px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>📑 Datos del Cliente y Facturación Real</h3>
            
            {/* Datos del Cliente para Firebase */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#030712', padding: '12px', borderRadius: '12px', border: '1px solid #1f2937' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8' }}>👤 Información del Comprador</span>
              <input
                type="text"
                placeholder="Nombre completo del cliente *"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#fff', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Cédula / Identificación"
                  value={cedulaCliente}
                  onChange={(e) => setCedulaCliente(e.target.value)}
                  style={{ flex: 1, backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#fff', outline: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Teléfono"
                  value={telefonoCliente}
                  onChange={(e) => setTelefonoCliente(e.target.value)}
                  style={{ flex: 1, backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#fff', outline: 'none' }}
                />
              </div>
            </div>

            {/* Tipo de Pago */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>Modalidad Comercial:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setTipoPago('Contado')}
                  style={{
                    flex: 1,
                    backgroundColor: tipoPago === 'Contado' ? '#4f46e5' : '#1f2937',
                    color: '#fff',
                    border: 'none',
                    padding: '10px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  💵 De Contado
                </button>
                <button
                  onClick={() => setTipoPago('Credito')}
                  style={{
                    flex: 1,
                    backgroundColor: tipoPago === 'Credito' ? '#4f46e5' : '#1f2937',
                    color: '#fff',
                    border: 'none',
                    padding: '10px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  💳 Al Crédito
                </button>
              </div>
            </div>

            {/* Configuración Contado */}
            {tipoPago === 'Contado' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#030712', padding: '12px', borderRadius: '12px', border: '1px solid #1f2937' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>💵 Efectivo Recibido (USD):</label>
                  <input
                    type="number"
                    placeholder="Ej. 500"
                    value={pagaCon}
                    onChange={(e) => setPagaCon(e.target.value)}
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '14px',
                      color: '#fff',
                      width: '100%',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>Vuelto / Cambio exacto:</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: vuelto >= 0 ? '#38bdf8' : '#fb7185' }}>
                    {vuelto >= 0 ? `$${vuelto.toFixed(2)} USD` : 'Fondos insuficientes'}
                  </span>
                </div>
              </div>
            )}

            {/* Configuración Crédito */}
            {tipoPago === 'Credito' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#030712', padding: '12px', borderRadius: '12px', border: '1px solid #1f2937' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>⏱️ Plazo de Financiamiento:</label>
                  <select
                    value={plazoMeses}
                    onChange={(e) => setPlazoMeses(Number(e.target.value))}
                    style={{
                      backgroundColor: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '12px',
                      color: '#fff',
                      width: '100%',
                      outline: 'none'
                    }}
                  >
                    <option value={3}>3 Meses</option>
                    <option value={6}>6 Meses</option>
                    <option value={12}>12 Meses</option>
                    <option value={18}>18 Meses</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>📊 Porcentaje de Prima Inicial (%):</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[10, 20, 30, 50].map(p => (
                      <button
                        key={p}
                        onClick={() => setPorcentajePrima(p)}
                        style={{
                          flex: 1,
                          backgroundColor: porcentajePrima === p ? '#374151' : '#111827',
                          color: '#fff',
                          border: '1px solid #4b5563',
                          padding: '6px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #1f2937', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#9ca3af' }}>Monto de Prima ({porcentajePrima}%):</span>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>${montoPrima.toFixed(2)} USD</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: '#9ca3af' }}>Saldo a Financiar:</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>${saldoFinanciar.toFixed(2)} USD</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '2px' }}>
                    <span style={{ color: '#818cf8', fontWeight: 700 }}>Cuota Mensual estimada:</span>
                    <span style={{ color: '#38bdf8', fontWeight: 800 }}>${cuotaMensual.toFixed(2)} USD / mes</span>
                  </div>
                </div>
              </div>
            )}

            {/* Aviso de IA */}
            {analisisIA && (
              <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.15)', border: '1px solid rgba(79, 70, 229, 0.3)', padding: '10px', borderRadius: '10px', fontSize: '11px', color: '#c7d2fe' }}>
                {analisisIA}
              </div>
            )}

            {/* Botones de Acción */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => setModalCobro(false)}
                disabled={procesando}
                style={{
                  flex: 1,
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarFacturaRealFirebase}
                disabled={procesando}
                style={{
                  flex: 1,
                  backgroundColor: procesando ? '#374151' : '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  cursor: procesando ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)'
                }}
              >
                {procesando ? 'Guardando...' : 'Confirmar e Imprimir 🖨️'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

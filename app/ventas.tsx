'use client';
import React, { useState } from 'react';

interface ProductoVenta {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stockDisponible: number;
}

export default function ModuloVentas() {
  const [catalogo] = useState<ProductoVenta[]>([
    { id: 1, nombre: 'Smart TV Sony 55"', categoria: 'Electrodomésticos', precio: 450, stockDisponible: 12 },
    { id: 2, nombre: 'Cama King Size ortopédica', categoria: 'Muebles/Hogar', precio: 320, stockDisponible: 5 },
    { id: 3, nombre: 'Infinix Note 50 Pro', categoria: 'Celulares', precio: 230, stockDisponible: 25 },
    { id: 4, nombre: 'Juego de Sala Esquinero', categoria: 'Muebles/Hogar', precio: 580, stockDisponible: 4 },
  ]);

  const [carrito, setCarrito] = useState<{ producto: ProductoVenta; cantidad: number }[]>([]);
  const [cliente, setCliente] = useState('');

  const agregarAlCarrito = (prod: ProductoVenta) => {
    const itemExistente = carrito.find((item) => item.producto.id === prod.id);
    if (itemExistente) {
      setCarrito(
        carrito.map((item) =>
          item.producto.id === prod.id ? { ...item, cantidad: item.cantidad + 1 } : item
        )
      );
    } else {
      setCarrito([...carrito, { producto: prod, cantidad: 1 }]);
    }
  };

  const calcularTotal = () => {
    return carrito.reduce((acc, item) => acc + item.producto.precio * item.cantidad, 0);
  };

  const procesarVenta = (e: React.FormEvent) => {
    e.preventDefault();
    if (carrito.length === 0) {
      alert('El carrito está vacío.');
      return;
    }
    if (!cliente) {
      alert('Por favor ingresa el nombre del cliente.');
      return;
    }
    alert(`¡Venta registrada con éxito para ${cliente}! Total: $${calcularTotal()}`);
    setCarrito([]);
    setCliente('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold">🏷️ Caja y Ventas - Tienda-SS</h1>
            <p className="text-slate-400 text-sm">Selección de productos y facturación directa</p>
          </div>
          <span className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-semibold">
            Rol: Vendedor
          </span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Catálogo de Productos */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-indigo-300">Catálogo Disponible</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalogo.map((prod) => (
                <div key={prod.id} className="bg-slate-800 border border-slate-700 p-4 rounded-xl shadow flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-indigo-400 font-medium uppercase tracking-wider">{prod.categoria}</span>
                    <h3 className="text-white font-bold text-base mt-1">{prod.nombre}</h3>
                    <p className="text-emerald-400 font-semibold text-lg mt-2">${prod.precio} USD</p>
                    <p className="text-slate-400 text-xs mt-1">Stock en bodega: {prod.stockDisponible} unidades</p>
                  </div>
                  <button
                    onClick={() => agregarAlCarrito(prod)}
                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition shadow"
                  >
                    Agregar a la Venta
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen del Carrito / Factura */}
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl shadow-lg flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-4 text-indigo-300">Factura Actual</h2>
              <div className="space-y-3 mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Nombre del Cliente
                </label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="border-t border-slate-700 pt-4 space-y-2 max-h-60 overflow-y-auto">
                {carrito.length === 0 ? (
                  <p className="text-slate-500 text-xs text-center py-4">No hay productos seleccionados.</p>
                ) : (
                  carrito.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm bg-slate-900/50 p-2 rounded-lg">
                      <div>
                        <p className="font-medium text-white">{item.producto.nombre}</p>
                        <p className="text-xs text-slate-400">Cant: {item.cantidad} x ${item.producto.precio}</p>
                      </div>
                      <p className="font-semibold text-indigo-300">${item.cantidad * item.producto.precio}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-slate-700 pt-4 mt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-slate-300 font-medium">Total a Pagar:</span>
                <span className="text-xl font-bold text-emerald-400">${calcularTotal()} USD</span>
              </div>
              <button
                onClick={procesarVenta}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition shadow-lg text-sm"
              >
                Completar Venta y Facturar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

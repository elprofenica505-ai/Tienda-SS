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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold">📦 Control de Inventario - Bodega Tienda-SS</h1>
            <p className="text-slate-400 text-sm">Gestión de entradas, salidas y existencias en tiempo real</p>
          </div>
          <span className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-semibold">
            Rol: Bodeguero
          </span>
        </header>

        {/* Formulario de Ingreso de Nuevo Producto */}
        <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl shadow-lg">
          <h2 className="text-lg font-semibold mb-4 text-indigo-300">Registrar Nueva Mercadería</h2>
          <form onSubmit={agregarProducto} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Nombre del producto (ej. Colchón, Tele...)"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              required
            />
            <select
              value={categoriaNueva}
              onChange={(e) => setCategoriaNueva(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="Electrodomésticos">Electrodomésticos</option>
              <option value="Muebles/Hogar">Muebles / Hogar</option>
              <option value="Celulares">Celulares y Tecnología</option>
            </select>
            <input
              type="number"
              placeholder="Stock inicial"
              value={stockNuevo}
              onChange={(e) => setStockNuevo(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
              required
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg p-3 transition text-sm shadow-md"
            >
              Agregar a Bodega
            </button>
          </form>
        </div>

        {/* Tabla de Inventario Actual */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold">Existencias en Stock</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4">Producto</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4 text-center">Stock Actual</th>
                  <th className="p-4 text-center">Acciones de Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 text-sm">
                {productos.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-750 transition">
                    <td className="p-4 font-medium text-white">{prod.nombre}</td>
                    <td className="p-4 text-slate-400">{prod.categoria}</td>
                    <td className="p-4 text-center font-bold">
                      <span
                        className={`px-3 py-1 rounded-full text-xs ${
                          prod.stock <= prod.minimo
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {prod.stock} unidades
                      </span>
                    </td>
                    <td className="p-4 text-center space-x-2">
                      <button
                        onClick={() => ajustarStock(prod.id, -1)}
                        className="bg-rose-600/80 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs transition shadow"
                      >
                        ➖ Salida
                      </button>
                      <button
                        onClick={() => ajustarStock(prod.id, 1)}
                        className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs transition shadow"
                      >
                        ➕ Entrada
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

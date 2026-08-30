'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
}

interface CategoriaItem {
  id: string;
  nombre: string;
}

export default function ProductosAdmin() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([
    'Abarrotes',
    'Bebidas',
    'Limpieza',
    'Electrodomésticos',
    'Otros',
  ]);
  const [nombre, setNombre] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Abarrotes');
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribeProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const lista: Producto[] = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as Producto[];
      setProductos(lista);
    });

    const unsubscribeCategorias = onSnapshot(collection(db, 'categorias'), (snapshot) => {
      const listaCats = snapshot.docs.map((docItem) => docItem.data().nombre as string);
      if (listaCats.length > 0) {
        setCategorias((prev) => Array.from(new Set([...prev, ...listaCats])));
      }
    });

    return () => {
      unsubscribeProductos();
      unsubscribeCategorias();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let categoriaFinal = categoriaSeleccionada;

    if (categoriaSeleccionada === 'NUEVA') {
      if (!nuevaCategoriaInput.trim()) {
        alert('Escribe el nombre de la nueva categoría');
        return;
      }
      categoriaFinal = nuevaCategoriaInput.trim();
      try {
        await addDoc(collection(db, 'categorias'), { nombre: categoriaFinal });
        if (!categorias.includes(categoriaFinal)) {
          setCategorias([...categorias, categoriaFinal]);
        }
      } catch (err) {
        console.error('Error al guardar categoría:', err);
      }
    }

    if (!nombre || !precio || !stock) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'productos'), {
        nombre,
        categoria: categoriaFinal,
        precio: parseFloat(precio),
        stock: parseInt(stock),
        createdAt: new Date(),
      });
      setNombre('');
      setPrecio('');
      setStock('');
      setNuevaCategoriaInput('');
      setCategoriaSeleccionada(categorias[0] || 'Abarrotes');
    } catch (error) {
      console.error('Error al agregar producto:', error);
      alert('Hubo un error al registrar el producto');
    } finally {
      setLoading(false);
    }
  };

  const eliminarProducto = async (id: string, nombreProd: string) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente "${nombreProd}"?`)) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  const valorTotalVenta = productos.reduce((acc, p) => acc + p.precio * p.stock, 0);
  const valorTotalCosto = 0; // Opcional si agregas costo unitario más adelante

  return (
    <div className="space-y-6 pb-8 animate-fadeIn">
      {/* Tarjetas de Resumen Dinámicas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-slate-900 to-[#111827] border border-slate-800 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Valor a costo</p>
          <p className="text-2xl font-black text-white">${valorTotalCosto.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-slate-900 to-[#111827] border border-slate-800 p-4 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Valor a venta</p>
          <p className="text-2xl font-black text-emerald-400">${valorTotalVenta.toLocaleString()}</p>
        </div>
      </div>

      {/* Formulario de Registro con Estilo Moderno */}
      <div className="bg-[#111827] border border-slate-800/80 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-lg">📦</span>
          <div>
            <h3 className="text-base font-bold text-white">Nuevo Producto</h3>
            <p className="text-xs text-slate-400">Registra mercancía directo al inventario en tiempo real</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre del Producto</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700/80 rounded-2xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition shadow-inner"
              placeholder="Ej. Arroz Faisán 80% 2lb"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Precio de Venta ($)</label>
              <input
                type="number"
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full bg-[#030712] border border-slate-700/80 rounded-2xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition shadow-inner"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Stock Inicial</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full bg-[#030712] border border-slate-700/80 rounded-2xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition shadow-inner"
                placeholder="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Categoría</label>
            <select
              value={categoriaSeleccionada}
              onChange={(e) => setCategoriaSeleccionada(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700/80 rounded-2xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition shadow-inner"
            >
              {categorias.map((cat, idx) => (
                <option key={idx} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="NUEVA">➕ Agregar nueva categoría...</option>
            </select>
          </div>

          {categoriaSeleccionada === 'NUEVA' && (
            <div className="animate-fadeIn">
              <label className="block text-xs font-semibold text-emerald-400 mb-1.5">Nombre de la Nueva Categoría</label>
              <input
                type="text"
                value={nuevaCategoriaInput}
                onChange={(e) => setNuevaCategoriaInput(e.target.value)}
                className="w-full bg-[#030712] border border-emerald-500/50 rounded-2xl p-3 text-white text-sm focus:outline-none focus:border-emerald-400 transition shadow-inner"
                placeholder="Ej. Lácteos, Granos Básicos..."
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 rounded-2xl text-sm transition shadow-lg shadow-emerald-900/30 mt-2"
          >
            {loading ? 'Guardando en Firebase...' : 'Registrar Producto'}
          </button>
        </form>
      </div>

      {/* Lista Estilizada en Tarjetas Visuales (Adiós formato Excel aburrido) */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            📋 Inventario Activo
            <span className="bg-slate-800 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-mono">
              {productos.length}
            </span>
          </h3>
        </div>

        {productos.length === 0 ? (
          <div className="bg-[#111827] border border-slate-800 p-8 text-center rounded-3xl text-slate-400 text-sm">
            No hay productos registrados todavía. ¡Agrega el primero arriba!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {productos.map((prod) => (
              <div
                key={prod.id}
                className="bg-[#111827] border border-slate-800/80 hover:border-slate-700 p-4 rounded-2xl flex justify-between items-center transition shadow-md"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/50">
                      {prod.categoria}
                    </span>
                  </div>
                  <h4 className="text-white font-bold text-base leading-tight">{prod.nombre}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400 pt-0.5">
                    <span>Precio: <strong className="text-emerald-400 font-semibold">${prod.precio.toFixed(2)}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="inline-block bg-slate-900 border border-slate-800 text-emerald-400 text-xs font-black px-3 py-1.5 rounded-xl shadow-inner">
                      {prod.stock} un.
                    </span>
                  </div>
                  <button
                    onClick={() => eliminarProducto(prod.id, prod.nombre)}
                    className="w-9 h-9 flex items-center justify-center bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition shadow-sm"
                    title="Eliminar producto"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

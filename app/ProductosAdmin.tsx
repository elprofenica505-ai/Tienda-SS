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

export default function ProductosAdmin() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Abarrotes');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const lista: Producto[] = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      })) as Producto[];
      setProductos(lista);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !precio || !stock) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'productos'), {
        nombre,
        categoria,
        precio: parseFloat(precio),
        stock: parseInt(stock),
        createdAt: new Date(),
      });
      setNombre('');
      setPrecio('');
      setStock('');
    } catch (error) {
      console.error('Error al agregar producto:', error);
      alert('Hubo un error al registrar el producto');
    } finally {
      setLoading(false);
    }
  };

  const eliminarProducto = async (id: string) => {
    if (confirm('¿Eliminar este producto del inventario?')) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  const valorTotalVenta = productos.reduce((acc, p) => acc + (p.precio * p.stock), 0);

  return (
    <div className="space-y-4 pb-6">
      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#111827] border border-slate-800 p-4 rounded-2xl">
          <p className="text-xs text-slate-400 mb-1">Valor a costo</p>
          <p className="text-xl font-bold text-white">$0</p>
        </div>
        <div className="bg-[#111827] border border-slate-800 p-4 rounded-2xl">
          <p className="text-xs text-slate-400 mb-1">Valor a venta</p>
          <p className="text-xl font-bold text-emerald-400">${valorTotalVenta.toLocaleString()}</p>
        </div>
      </div>

      {/* Formulario de Registro Estilizado */}
      <div className="bg-[#111827] border border-slate-800 p-4 rounded-2xl">
        <h3 className="text-sm font-bold text-white mb-3">📦 Registrar Nuevo Producto</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre del producto</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700 rounded-xl p-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
              placeholder="Ej. Arroz 1kg"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Precio ($)</label>
              <input
                type="number"
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full bg-[#030712] border border-slate-700 rounded-xl p-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Stock inicial</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full bg-[#030712] border border-slate-700 rounded-xl p-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                placeholder="0"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full bg-[#030712] border border-slate-700 rounded-xl p-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="Abarrotes">Abarrotes</option>
              <option value="Bebidas">Bebidas</option>
              <option value="Limpieza">Limpieza</option>
              <option value="Electrodomésticos">Electrodomésticos</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-sm transition mt-1"
          >
            {loading ? 'Guardando...' : 'Guardar Producto'}
          </button>
        </form>
      </div>

      {/* Lista de Productos en Tarjetas Limpias */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-300 px-1">Inventario Actual en Base de Datos</h3>
        {productos.length === 0 ? (
          <div className="bg-[#111827] border border-slate-800 p-6 text-center rounded-2xl text-slate-400 text-sm">
            No hay productos registrados en Firebase todavía.
          </div>
        ) : (
          productos.map((prod) => (
            <div key={prod.id} className="bg-[#111827] border border-slate-800 p-3.5 rounded-2xl flex justify-between items-center">
              <div>
                <p className="text-white font-bold text-sm">{prod.nombre}</p>
                <p className="text-xs text-slate-400">
                  Cat: {prod.categoria} · Venta: <span className="text-emerald-400">${prod.precio.toFixed(2)}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-slate-800 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-xl">
                  {prod.stock} un
                </span>
                <button
                  onClick={() => eliminarProducto(prod.id)}
                  className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white p-2 rounded-xl text-xs transition"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

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
    if (confirm('¿Estás seguro de eliminar este producto?')) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  return (
    <div className="p-4 bg-slate-900 rounded-xl text-white my-4">
      <h2 className="text-xl font-bold mb-4">Gestión de Inventario (Panel del Jefe)</h2>

      <form onSubmit={handleSubmit} className="bg-slate-800 p-4 rounded-xl mb-6 grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm mb-1">Nombre del Producto</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
            placeholder="Ej. Arroz 1kg"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Categoría</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
          >
            <option value="Abarrotes">Abarrotes</option>
            <option value="Bebidas">Bebidas</option>
            <option value="Limpieza">Limpieza</option>
            <option value="Ferretería">Ferretería</option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Precio ($)</label>
          <input
            type="number"
            step="0.01"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Stock Inicial</label>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
            placeholder="0"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded font-semibold transition mt-2"
        >
          {loading ? 'Guardando...' : 'Registrar Producto'}
        </button>
      </form>

      <div className="bg-slate-800 rounded-xl overflow-x-auto shadow-lg p-2">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-700 text-slate-300">
              <th className="p-2">Nombre</th>
              <th className="p-2">Cat.</th>
              <th className="p-2">Precio</th>
              <th className="p-2">Stock</th>
              <th className="p-2 text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {productos.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400">
                  No hay productos registrados todavía.
                </td>
              </tr>
            ) : (
              productos.map((prod) => (
                <tr key={prod.id} className="border-t border-slate-700">
                  <td className="p-2 font-medium">{prod.nombre}</td>
                  <td className="p-2 text-slate-300">{prod.categoria}</td>
                  <td className="p-2 text-emerald-400 font-semibold">${prod.precio.toFixed(2)}</td>
                  <td className="p-2">
                    <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-200">
                      {prod.stock}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => eliminarProducto(prod.id)}
                      className="bg-red-600 text-white px-2 py-1 rounded text-xs"
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

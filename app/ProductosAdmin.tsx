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
  const [categorias, setCategorias] = useState<string[]>([
    'Abarrotes',
    'Bebidas',
    'Limpieza',
    'Electrodomésticos',
    'Equipos tecnológicos',
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
    if (confirm(`¿Deseas eliminar "${nombreProd}"?`)) {
      await deleteDoc(doc(db, 'productos', id));
    }
  };

  const valorTotalVenta = productos.reduce((acc, p) => acc + p.precio * p.stock, 0);

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '480px', margin: '0 auto' }}>
      
      {/* Tarjetas Superiores Estilo Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '16px' }}>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase' }}>Valor a costo</p>
          <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>$0</p>
        </div>
        <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '16px' }}>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase' }}>Valor a venta</p>
          <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#34d399' }}>${valorTotalVenta.toLocaleString()}</p>
        </div>
      </div>

      {/* Formulario de Registro Estilizado */}
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>📦</span>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>Registrar Nuevo Producto</h3>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Control directo al inventario</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Nombre del producto</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
              placeholder="Ej. Infinix Note 40 Pro"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Precio ($)</label>
              <input
                type="number"
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Stock inicial</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
                placeholder="0"
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Categoría</label>
            <select
              value={categoriaSeleccionada}
              onChange={(e) => setCategoriaSeleccionada(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
            >
              {categorias.map((cat, idx) => (
                <option key={idx} value={cat} style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                  {cat}
                </option>
              ))}
              <option value="NUEVA" style={{ backgroundColor: '#111827', color: '#34d399' }}>➕ Agregar nueva categoría...</option>
            </select>
          </div>

          {categoriaSeleccionada === 'NUEVA' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#34d399', marginBottom: '4px' }}>Nombre de la nueva categoría</label>
              <input
                type="text"
                value={nuevaCategoriaInput}
                onChange={(e) => setNuevaCategoriaInput(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #34d399', borderRadius: '10px', padding: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
                placeholder="Ej. Línea Blanca"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', backgroundColor: '#059669', color: '#ffffff', fontWeight: 'bold', padding: '12px', borderRadius: '10px', fontSize: '13px', border: 'none', cursor: 'pointer', marginTop: '4px' }}
          >
            {loading ? 'Guardando...' : 'Registrar Producto'}
          </button>
        </form>
      </div>

      {/* Lista de Productos Estilizada en Tarjetas Super Limpias */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#d1d5db', margin: '0 4px' }}>Inventario Activo ({productos.length})</h3>
        
        {productos.length === 0 ? (
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '24px', textAlign: 'center', borderRadius: '16px', color: '#9ca3af', fontSize: '13px' }}>
            No hay productos registrados todavía.
          </div>
        ) : (
          productos.map((prod) => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '14px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', backgroundColor: '#1f2937', color: '#d1d5db', padding: '2px 8px', borderRadius: '6px', width: 'fit-content', fontWeight: '500' }}>
                  {prod.categoria}
                </span>
                <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>{prod.nombre}</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                  Precio: <strong style={{ color: '#34d399' }}>${prod.precio.toFixed(2)}</strong> · Stock: <strong style={{ color: '#ffffff' }}>{prod.stock} un</strong>
                </p>
              </div>
              <button
                onClick={() => eliminarProducto(prod.id, prod.nombre)}
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: 'none', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}
                title="Eliminar producto"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

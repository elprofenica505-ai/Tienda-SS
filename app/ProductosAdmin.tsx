'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, getDocs } from 'firebase/firestore';

interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  codigo: string;
  imagen?: string;
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
  const [codigo, setCodigo] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Abarrotes');
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [imagen, setImagen] = useState<string>('');
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

  // Función para generar un código único de 8 dígitos validando que no exista en Firestore
  const generarCodigoUnico = async () => {
    const codigosExistentes = new Set(productos.map((p) => p.codigo));
    // También consultamos directo a firestore por seguridad
    const snapshot = await getDocs(collection(db, 'productos'));
    snapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.codigo) codigosExistentes.add(data.codigo);
    });

    let nuevoCodigo = '';
    let intentos = 0;
    do {
      // Generar número aleatorio de 8 dígitos
      nuevoCodigo = Math.floor(10000000 + Math.random() * 90000000).toString();
      intentos++;
      if (intentos > 50) break;
    } while (codigosExistentes.has(nuevoCodigo));

    setCodigo(nuevoCodigo);
  };

  // Manejar captura o carga de imagen desde el dispositivo (convertida a Base64)
  const handleImagenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagen(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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

    if (!nombre || !precio || !stock || !codigo) {
      alert('Por favor completa todos los campos obligatorios, incluyendo el código.');
      return;
    }

    // Validar duplicado exacto de código antes de guardar
    const codigoDuplicado = productos.some((p) => p.codigo === codigo);
    if (codigoDuplicado) {
      alert('¡El código ingresado ya pertenece a otro producto! Genera uno nuevo.');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'productos'), {
        nombre,
        codigo,
        categoria: categoriaFinal,
        precio: parseFloat(precio),
        stock: parseInt(stock),
        imagen: imagen || '',
        createdAt: new Date(),
      });
      setNombre('');
      setCodigo('');
      setPrecio('');
      setStock('');
      setImagen('');
      setNuevaCategoriaInput('');
      setCategoriaSeleccionada(categorias[0] || 'Abarrotes');
      alert('¡Producto registrado con éxito!');
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

      {/* Formulario de Registro Estilizado con Foto y Código */}
      <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '16px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span style={{ fontSize: '18px' }}>📦</span>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>Registrar Nuevo Producto</h3>
            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Control directo al inventario con código y foto</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Captura de Foto del Producto */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>Fotografía del producto</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '56px', height: '56px', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {imagen ? (
                  <img src={imagen} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '20px' }}>📷</span>
                )}
              </div>
              <label style={{ flex: 1, backgroundColor: '#1f2937', color: '#ffffff', textAlign: 'center', padding: '10px', borderRadius: '10px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', border: '1px solid #374151' }}>
                Tomar foto / Cargar archivo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImagenChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Nombre del producto */}
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

          {/* Código del producto con Generador Automático */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Código de producto / SKU</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                style={{ flex: 1, backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
                placeholder="Ej. 78492011"
                required
              />
              <button
                type="button"
                onClick={generarCodigoUnico}
                style={{ backgroundColor: '#374151', color: '#34d399', border: 'none', padding: '0 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ⚡ Generar
              </button>
            </div>
          </div>

          {/* Precio y Stock */}
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

          {/* Categoría */}
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

      {/* Lista de Productos Estilizada en Tarjetas con Foto y Código */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#d1d5db', margin: '0 4px' }}>Inventario Activo ({productos.length})</h3>
        
        {productos.length === 0 ? (
          <div style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '24px', textAlign: 'center', borderRadius: '16px', color: '#9ca3af', fontSize: '13px' }}>
            No hay productos registrados todavía.
          </div>
        ) : (
          productos.map((prod) => (
            <div key={prod.id} style={{ backgroundColor: '#111827', border: '1px solid #1f2937', padding: '12px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                {/* Miniatura de la foto */}
                <div style={{ width: '48px', height: '48px', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {prod.imagen ? (
                    <img src={prod.imagen} alt={prod.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '16px' }}>📦</span>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', backgroundColor: '#1f2937', color: '#d1d5db', padding: '1px 6px', borderRadius: '4px', fontWeight: '500' }}>
                      {prod.categoria}
                    </span>
                    {prod.codigo && (
                      <span style={{ fontSize: '9px', backgroundColor: '#064e3b', color: '#34d399', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        #{prod.codigo}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffffff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod.nombre}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>
                    Precio: <strong style={{ color: '#34d399' }}>${prod.precio.toFixed(2)}</strong> · Stock: <strong style={{ color: '#ffffff' }}>{prod.stock} un</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => eliminarProducto(prod.id, prod.nombre)}
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: 'none', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}
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

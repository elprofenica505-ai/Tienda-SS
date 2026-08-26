'use client';
import React, { useState, useRef } from 'react';
// Importa Firebase si lo requieres para guardar el producto real en Firestore
// import { db } from '../lib/firebase';
// import { collection, addDoc } from 'firebase/firestore';

interface ProductoBodega {
  id: string;
  codigo: string;
  modelo: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  imagen: string; // Aquí guardaremos la imagen en Base64 o la URL de Firebase Storage
}

export default function BodegaReal() {
  const [productos, setProductos] = useState<ProductoBodega[]>([
    {
      id: '1',
      codigo: 'TV-SON-55',
      modelo: 'Bravia XR-55X90L',
      nombre: 'Smart TV Sony 55"',
      precio: 450,
      stock: 12,
      categoria: 'Electrodomésticos',
      imagen: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=300&q=80'
    }
  ]);

  // Estados del formulario de nuevo producto
  const [codigo, setCodigo] = useState('');
  const [modelo, setModelo] = useState('');
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [categoria, setCategoria] = useState('Electrodomésticos');
  
  // Estado para la imagen capturada por la cámara
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  
  // Referencia para activar el input de cámara nativo oculto
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Función para capturar la foto desde la cámara del dispositivo
  const handleCapturarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // El resultado es un string Base64 que se puede mostrar y guardar directamente
        setImagenPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const guardarProductoEnBodega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !codigo || !precio || !stock) {
      alert('⚠️ Por favor completa los campos obligatorios.');
      return;
    }

    setGuardando(true);

    try {
      const nuevoProducto: ProductoBodega = {
        id: Date.now().toString(),
        codigo,
        modelo,
        nombre,
        precio: parseFloat(precio),
        stock: parseInt(stock, 10),
        categoria,
        imagen: imagenPreview || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=300&q=80' // Imagen por defecto si no toma foto
      };

      // ── AQUÍ PUEDES CONECTAR CON FIREBASE FIRESTORE ──
      // await addDoc(collection(db, "productos_bodega"), nuevoProducto);

      setProductos(prev => [nuevoProducto, ...prev]);
      
      // Limpiar formulario
      setCodigo('');
      setModelo('');
      setNombre('');
      setPrecio('');
      setStock('');
      setImagenPreview(null);
      
      alert('✅ ¡Producto registrado exitosamente en la bodega!');
    } catch (error) {
      console.error("Error al guardar:", error);
      alert('❌ Hubo un error al guardar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#030712',
      color: '#f3f4f6',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Cabecera */}
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '16px',
        }}>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: '0 0 4px 0' }}>📦 Control de Bodega - Registro con Cámara</h1>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Toma fotos reales de la mercancía directo desde la cámara de tu dispositivo.</p>
        </div>

        {/* Formulario de Alta de Producto */}
        <form onSubmit={guardarProductoEnBodega} style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '20px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Agregar Nuevo Artículo</h2>

          {/* Captura de Imagen por Cámara Nativa */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>Fotografía del Producto:</label>
            
            {/* Input oculto configurado para abrir la cámara trasera del celular o webcam en PC */}
            <input
              type="file"
              accept="image/*"
              capture="environment" 
              ref={fileInputRef}
              onChange={handleCapturarFoto}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '70px',
                height: '70px',
                borderRadius: '12px',
                border: '1px dashed #4b5563',
                backgroundColor: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0
              }}>
                {imagenPreview ? (
                  <img src={imagenPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '20px' }}>📷</span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    backgroundColor: '#4f46e5',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  📸 Abrir Cámara / Tomar Foto
                </button>
                <span style={{ fontSize: '10px', color: '#6b7280' }}>* En celulares abrirá la cámara principal automáticamente.</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Código *</label>
              <input
                type="text"
                placeholder="Ej. TV-SON-55"
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Modelo</label>
              <input
                type="text"
                placeholder="Ej. Bravia XR"
                value={modelo}
                onChange={e => setModelo(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Nombre del Producto *</label>
            <input
              type="text"
              placeholder="Ej. Smart TV Sony 55 pulgadas"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Precio Unitario ($USD) *</label>
              <input
                type="number"
                placeholder="0.00"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Stock Inicial *</label>
              <input
                type="number"
                placeholder="0"
                value={stock}
                onChange={e => setStock(e.target.value)}
                style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Categoría</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              style={{ width: '100%', backgroundColor: '#030712', border: '1px solid #374151', borderRadius: '10px', padding: '10px', fontSize: '12px', color: '#fff', outline: 'none' }}
            >
              <option value="Electrodomésticos">Electrodomésticos</option>
              <option value="Muebles/Hogar">Muebles/Hogar</option>
              <option value="Celulares">Celulares</option>
              <option value="Herramientas">Herramientas</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={guardando}
            style={{
              marginTop: '8px',
              backgroundColor: guardando ? '#374151' : '#10b981',
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: guardando ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            {guardando ? 'Guardando en Base de Datos...' : 'Guardar Producto en Bodega 🚀'}
          </button>
        </form>

        {/* Listado Rápido de Inventario en Bodega */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', margin: 0 }}>📋 Inventario Registrado</h2>
          
          {productos.map(prod => (
            <div key={prod.id} style={{
              backgroundColor: '#111827',
              border: '1px solid #1f2937',
              borderRadius: '16px',
              padding: '12px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center'
            }}>
              <img
                src={prod.imagen}
                alt={prod.nombre}
                style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '10px', backgroundColor: '#1f2937' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700 }}>{prod.codigo}</span>
                <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#fff', margin: '2px 0' }}>{prod.nombre}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
                  <span>Stock: <strong style={{ color: '#34d399' }}>{prod.stock}</strong></span>
                  <span>Precio: <strong style={{ color: '#38bdf8' }}>${prod.precio}</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

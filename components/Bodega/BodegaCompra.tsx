'use client';

import React, { useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Producto, Compra, CompraItem } from '@/components/shared/types';
import type { Usuario } from '@/lib/auth';

interface Props {
  user: Usuario;
  productos: Producto[];
  setProductos: (p: Producto[]) => void;
  compras: Compra[];
  setCompras: (c: Compra[]) => void;
  volver: () => void;
  onCerrar: () => void;
}

/** Comprime la imagen para que pese poco y quepa en Firestore (sin Storage). */
function comprimirImagen(file: File, maxAncho = 800, calidad = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxAncho) {
          height = Math.round((height * maxAncho) / width);
          width = maxAncho;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas no disponible'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', calidad);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function BodegaCompra({
  user, productos, setProductos, compras, setCompras, volver, onCerrar
}: Props) {
  const [proveedorInput, setProveedorInput] = useState('');
  const [modo, setModo] = useState<'existente' | 'nuevo'>('existente');

  const [compraItems, setCompraItems] = useState<CompraItem[]>([]);
  const [prodSeleccionadoId, setProdSeleccionadoId] = useState('');
  const [cantCompraInput, setCantCompraInput] = useState('');
  const [costoCompraInput, setCostoCompraInput] = useState('');

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [stockNuevo, setStockNuevo] = useState('');
  const [costoNuevo, setCostoNuevo] = useState('');
  const [precioNuevo, setPrecioNuevo] = useState('');

  const [fotoBase64, setFotoBase64] = useState('');
  const [fotoPreview, setFotoPreview] = useState('');
  const [comprimiendo, setComprimiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const totalCompra = compraItems.reduce((s, it) => s + it.subtotal, 0);

  const onElegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setComprimiendo(true);
    try {
      const dataUrl = await comprimirImagen(f, 800, 0.55);
      // \~1 MB en base64 es el límite práctico de un documento de Firestore
      if (dataUrl.length > 900000) {
        alert('La foto sigue pesando mucho. Toma otra más simple o de más lejos.');
        setComprimiendo(false);
        return;
      }
      setFotoBase64(dataUrl);
      setFotoPreview(dataUrl);
    } catch {
      alert('No se pudo procesar la foto');
    } finally {
      setComprimiendo(false);
    }
  };

  const quitarFoto = () => {
    setFotoBase64('');
    setFotoPreview('');
  };

  const agregarItemExistente = () => {
    const p = productos.find(x => x.id === prodSeleccionadoId);
    if (!p || !cantCompraInput || !costoCompraInput) {
      alert('Selecciona producto, cantidad y costo');
      return;
    }
    const cant = parseInt(cantCompraInput) || 0;
    const costo = parseFloat(costoCompraInput) || 0;
    setCompraItems([...compraItems, {
      productoId: p.id,
      nombre: p.nombre,
      cantidad: cant,
      costoUnitario: costo,
      subtotal: cant * costo,
    }]);
    setProdSeleccionadoId('');
    setCantCompraInput('');
    setCostoCompraInput('');
  };

  const quitarItem = (idx: number) => {
    setCompraItems(compraItems.filter((_, i) => i !== idx));
  };

  const registrarCompra = async () => {
    if (!proveedorInput.trim()) {
      alert('Ingresa el nombre del proveedor');
      return;
    }

    setGuardando(true);
    try {
      let itemsFinal = [...compraItems];
      let total = totalCompra;
      let listaProductos = [...productos];

      if (modo === 'nuevo') {
        if (!nombreNuevo.trim() || !stockNuevo || !costoNuevo) {
          alert('Completa nombre, cantidad y costo del producto nuevo');
          setGuardando(false);
          return;
        }
        const cant = parseInt(stockNuevo) || 0;
        const costo = parseFloat(costoNuevo) || 0;
        const precio = parseFloat(precioNuevo) || 0;

        const dataProd = {
          nombre: nombreNuevo.trim(),
          codigo: Math.floor(10000000 + Math.random() * 90000000).toString(),
          stock: cant,
          stockMinimo: 5,
          precio,
          costo,
          imagen: fotoBase64 || '',
          categoria: 'Otros',
          createdAt: serverTimestamp(),
        };
        const refProd = await addDoc(collection(db, 'productos'), dataProd);
        const nuevoProd = { id: refProd.id, ...dataProd } as Producto;
        listaProductos = [...listaProductos, nuevoProd];
        setProductos(listaProductos);

        itemsFinal = [{
          productoId: refProd.id,
          nombre: dataProd.nombre,
          cantidad: cant,
          costoUnitario: costo,
          subtotal: cant * costo,
        }];
        total = cant * costo;
      } else {
        if (itemsFinal.length === 0) {
          alert('Agrega al menos un producto a la compra');
          setGuardando(false);
          return;
        }
        for (const it of itemsFinal) {
          const p = listaProductos.find(x => x.id === it.productoId);
          if (p) {
            const nuevoStock = p.stock + it.cantidad;
            await updateDoc(doc(db, 'productos', it.productoId), {
              stock: nuevoStock,
              costo: it.costoUnitario,
            });
            listaProductos = listaProductos.map(x =>
              x.id === it.productoId ? { ...x, stock: nuevoStock, costo: it.costoUnitario } : x
            );
          }
        }
        setProductos(listaProductos);
      }

      const dataCompra = {
        proveedor: proveedorInput.trim(),
        fecha: serverTimestamp(),
        items: itemsFinal,
        total,
        creadoPor: user.nombre,
        fotoUrl: fotoBase64 || '',
        tipo: modo,
      };
      const refCompra = await addDoc(collection(db, 'compras'), dataCompra);
      setCompras([...compras, { id: refCompra.id, ...dataCompra, fecha: new Date() } as Compra]);

      setProveedorInput('');
      setCompraItems([]);
      setNombreNuevo('');
      setStockNuevo('');
      setCostoNuevo('');
      setPrecioNuevo('');
      quitarFoto();
      alert('Compra registrada' + (fotoBase64 ? ' (con foto)' : ''));
      volver();
    } catch (e) {
      console.error(e);
      alert('Error al registrar compra');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={volver} style={{ background: '#1f2937', color: '#fff', border: 'none', width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>←</button>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: '#5eead4', margin: 0 }}>Nueva compra</h1>
          </div>
          <button onClick={onCerrar} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salir</button>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Proveedor *</p>
          <input
            placeholder="Nombre del proveedor"
            value={proveedorInput}
            onChange={e => setProveedorInput(e.target.value)}
            style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" onClick={() => setModo('existente')}
            style={{ padding: 12, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: modo === 'existente' ? '#4f46e5' : '#1f2937', color: '#fff' }}>
            Producto existente
          </button>
          <button type="button" onClick={() => setModo('nuevo')}
            style={{ padding: 12, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: modo === 'nuevo' ? '#0d9488' : '#1f2937', color: '#fff' }}>
            Producto nuevo
          </button>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>Foto (opcional)</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 10px' }}>
            Cámara o galería. Se comprime sola (sin plan de pago).
          </p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onElegirFoto}
            disabled={comprimiendo}
            style={{ width: '100%', fontSize: 13, color: '#e5e7eb' }}
          />
          {comprimiendo && <p style={{ fontSize: 12, color: '#9ca3af', margin: '8px 0 0' }}>Comprimiendo foto...</p>}
          {fotoPreview && (
            <div style={{ marginTop: 10 }}>
              <img src={fotoPreview} alt="Vista previa" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12 }} />
              <button type="button" onClick={quitarFoto} style={{ marginTop: 8, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                Quitar foto
              </button>
            </div>
          )}
        </div>

        {modo === 'existente' ? (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>Producto existente</p>
            <select value={prodSeleccionadoId} onChange={e => setProdSeleccionadoId(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}>
              <option value="">Selecciona un producto...</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock})</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Cantidad" value={cantCompraInput} onChange={e => setCantCompraInput(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
              <input type="number" placeholder="Costo unitario" value={costoCompraInput} onChange={e => setCostoCompraInput(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
            </div>
            <button type="button" onClick={agregarItemExistente} style={{ background: '#0d9488', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              Agregar a la compra
            </button>
            {compraItems.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {compraItems.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                    <span>{it.nombre} x{it.cantidad}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>${it.subtotal.toFixed(0)}</span>
                      <button type="button" onClick={() => quitarItem(idx)} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>X</button>
                    </div>
                  </div>
                ))}
                <p style={{ fontWeight: 800, margin: '8px 0 0' }}>Total: ${totalCompra.toFixed(0)}</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#5eead4', margin: 0 }}>Producto nuevo</p>
            <input placeholder="Nombre *" value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Cantidad *" value={stockNuevo} onChange={e => setStockNuevo(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
              <input type="number" placeholder="Costo *" value={costoNuevo} onChange={e => setCostoNuevo(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
              <input type="number" placeholder="Precio venta" value={precioNuevo} onChange={e => setPrecioNuevo(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
        )}

        <button type="button" onClick={registrarCompra} disabled={guardando || comprimiendo}
          style={{ background: '#10b981', color: '#030712', border: 'none', padding: 14, borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
          {guardando ? 'Guardando...' : 'Registrar compra'}
        </button>
      </div>
    </div>
  );
}

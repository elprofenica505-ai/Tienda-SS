'use client';

import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Usuario, login as loginFirebase, cerrarSesion, escucharSesion } from '@/lib/auth';
import type {
  Vista, Producto, Venta, Turno, Compra, UsuarioSistema, Entrega, Permisos
} from '@/components/shared/types';
import { PERMISOS_DEFAULT } from '@/components/shared/types';

import dynamic from 'next/dynamic';

const Login = dynamic(() => import('@/components/Login'), { ssr: false });
const JefePanel = dynamic(() => import('@/components/Jefe/JefePanel'), { ssr: false });
const VendedorHome = dynamic(() => import('@/components/Vendedor/VendedorHome'), { ssr: false });
const Ticket = dynamic(() => import('@/components/Vendedor/Ticket'), { ssr: false });
const BodegaHome = dynamic(() => import('@/components/Bodega/BodegaHome'), { ssr: false });
const BodegaCompra = dynamic(() => import('@/components/Bodega/BodegaCompra'), { ssr: false });
const BodegaHistorial = dynamic(() => import('@/components/Bodega/BodegaHistorial'), { ssr: false });
const ChoferHome = dynamic(() => import('@/components/Chofer/ChoferHome'), { ssr: false });
const CajeroHome = dynamic(() => import('@/components/Cajero/CajeroHome'), { ssr: false });

export default function TiendaSS() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [vista, setVista] = useState<Vista>('login');
  const [historial, setHistorial] = useState<Vista[]>([]);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [productosCargados, setProductosCargados] = useState(false);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [usuariosSistema, setUsuariosSistema] = useState<UsuarioSistema[]>([]);
  const [permisos, setPermisos] = useState<Permisos>(PERMISOS_DEFAULT);
  const [entregas, setEntregas] = useState<Entrega[]>([
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick', productos: 'TV Samsung 55"', estado: 'Pendiente', choferId: 'u5' },
    { id: 2, cliente: 'Ana López', direccion: 'Villa El Carmen', productos: 'Cama King', estado: 'En Ruta', choferId: 'u5' },
    { id: 3, cliente: 'Luis Mora', direccion: 'Centroamérica', productos: 'Celular Infinix', estado: 'Entregado', choferId: 'u5' },
  ]);

  const [carrito, setCarrito] = useState<any[]>([]);
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null);

  const cargarProductosBodega = async () => {
    if (productosCargados || loadingProductos) return;
    setLoadingProductos(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'productos'), limit(25)));
      setProductos(snapshot.docs.map((item) => {
        const x = item.data();
        return { id: item.id, codigo: String(x.codigo || ''), nombre: String(x.nombre || ''), stock: Number(x.stock || 0), stockMinimo: Number(x.stockMinimo ?? 5), precio: Number(x.precio || 0), costo: Number(x.costo || 0), imagen: String(x.imagen || ''), categoria: String(x.categoria || 'Otros') } as Producto;
      }));
      setProductosCargados(true);
    } finally {
      setLoadingProductos(false);
    }
  };

  const irA = (v: Vista) => {
    setHistorial(h => [...h, vista]);
    setVista(v);
  };

  const volver = () => {
    if (historial.length === 0) {
      if (user?.rol === 'jefe') setVista('jefe_home');
      else if (user?.rol === 'vendedor') setVista('vendedor_home');
      else if (user?.rol === 'bodega') setVista('bodega_home');
      else if (user?.rol === 'chofer') setVista('chofer_home');
      else if (user?.rol === 'cajero') setVista('cajero_home');
      else setVista('login');
      return;
    }
    const prev = historial[historial.length - 1];
    setHistorial(h => h.slice(0, -1));
    setVista(prev);
  };

  useEffect(() => {
    const unsub = escucharSesion((u) => {
      setUser(u);
      setCargandoSesion(false);
      setHistorial([]);
      if (u) {
        if (u.rol === 'jefe') setVista('jefe_home');
        else if (u.rol === 'vendedor') setVista('vendedor_home');
        else if (u.rol === 'bodega') setVista('bodega_home');
        else if (u.rol === 'chofer') setVista('chofer_home');
        else if (u.rol === 'cajero') setVista('cajero_home');
      } else {
        setVista('login');
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const readLimited = async <T,>(name: string): Promise<T[]> => {
      const snapshot = await getDocs(query(collection(db, name), limit(25)));
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as unknown as T));
    };
    async function loadVisibleData() {
      try {
        const permissionsSnapshot = await getDoc(doc(db, 'config', 'permisos'));
        if (!cancelled) {
          if (permissionsSnapshot.exists()) {
            const x = permissionsSnapshot.data();
            setPermisos({
              bodegaCrearProductos: x.bodegaCrearProductos !== false,
              bodegaAjustarStock: x.bodegaAjustarStock !== false,
              bodegaRegistrarCompras: x.bodegaRegistrarCompras !== false,
              choferRegistrarCompras: x.choferRegistrarCompras === true,
              cajaAbrirCerrar: x.cajaAbrirCerrar !== false,
              cajaCobrarPreventas: x.cajaCobrarPreventas !== false,
              cajaGestionarCreditos: x.cajaGestionarCreditos === true,
            });
          } else setPermisos(PERMISOS_DEFAULT);
        }
        if (vista === 'bodega_home') return;
        if (['jefe_home', 'bodega_compra', 'bodega_historial', 'vendedor_home', 'cajero_home'].includes(vista)) {
          const rows = await readLimited<Producto>('productos');
          if (!cancelled) setProductos(rows.map((x) => ({ id: String(x.id), codigo: String(x.codigo || ''), nombre: String(x.nombre || ''), stock: Number(x.stock || 0), stockMinimo: Number(x.stockMinimo ?? 5), precio: Number(x.precio || 0), costo: Number(x.costo || 0), imagen: String(x.imagen || ''), categoria: String(x.categoria || 'Otros') })));
        }
        if (['jefe_home', 'vendedor_home', 'cajero_home'].includes(vista)) {
          const rows = await readLimited<Venta>('ventas');
          if (!cancelled) setVentas(rows);
        }
        if (vista === 'jefe_home' || vista === 'cajero_home') {
          const rows = await readLimited<Turno>('turnos');
          if (!cancelled) setTurnos(rows);
        }
        if (vista === 'jefe_home') {
          const [purchaseRows, userRows] = await Promise.all([readLimited<Compra>('compras'), readLimited<UsuarioSistema>('usuarios')]);
          if (!cancelled) { setCompras(purchaseRows); setUsuariosSistema(userRows); }
        }
      } catch (error) {
        console.error('No se pudieron cargar los datos de la vista actual', error);
      }
    }
    void loadVisibleData();
    return () => { cancelled = true; };
  }, [user, vista]);

  const cerrar = async () => {
    await cerrarSesion();
    setCarrito([]);
    setUltimaVenta(null);
  };

  if (cargandoSesion) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Cargando...
      </div>
    );
  }

  if (vista === 'login' || !user) {
    return <Login onLogin={loginFirebase} />;
  }

  if (vista === 'jefe_home') {
    return (
      <JefePanel
        user={user}
        productos={productos}
        setProductos={setProductos}
        ventas={ventas}
        turnos={turnos}
        compras={compras}
        usuariosSistema={usuariosSistema}
        setUsuariosSistema={setUsuariosSistema}
        permisos={permisos}
        onCerrar={cerrar}
      />
    );
  }

  if (vista === 'vendedor_ticket' && ultimaVenta) {
    return (
      <Ticket
        venta={ultimaVenta}
        onNuevaVenta={() => {
          setUltimaVenta(null);
          setVista('vendedor_home');
          setHistorial([]);
        }}
      />
    );
  }

  if (vista === 'vendedor_home') {
    return (
      <VendedorHome
        user={user}
        productos={productos}
        setProductos={setProductos}
        ventas={ventas}
        setVentas={setVentas}
        turnos={turnos}
        carrito={carrito}
        setCarrito={setCarrito}
        ultimaVenta={ultimaVenta}
        setUltimaVenta={setUltimaVenta}
        irA={irA}
        onCerrar={cerrar}
        onCerrarCaja={() => {}}
      />
    );
  }

  if (vista === 'bodega_home') {
    return (
      <BodegaHome
        user={user}
        productos={productos}
        setProductos={setProductos}
        irA={irA}
        onCerrar={cerrar}
        permisos={permisos}
        onRequestProducts={cargarProductosBodega}
        productosCargados={productosCargados}
        loadingProductos={loadingProductos}
      />
    );
  }

  if (vista === 'bodega_compra') {
    return (
      <BodegaCompra
        user={user}
      />
    );
  }

  if (vista === 'bodega_historial_compras') {
    return (
      <BodegaHistorial compras={compras} volver={volver} onCerrar={cerrar} />
    );
  }

  if (vista === 'chofer_home') {
    return (
      <ChoferHome
        user={user}
        entregas={entregas}
        setEntregas={setEntregas}
        historial={historial}
        onCerrar={cerrar}
        permisos={permisos}
        irA={irA}
      />
    );
  }

  if (vista === 'cajero_home') {
    return (
      <CajeroHome
        user={user}
        onCerrar={cerrar}
      />
    );
  }

  return null;
}

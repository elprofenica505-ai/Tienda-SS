'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Usuario, login as loginFirebase, cerrarSesion, escucharSesion } from '@/lib/auth';
import type {
  Vista, Producto, Venta, Turno, Compra, UsuarioSistema, Entrega, Permisos
} from '@/components/shared/types';
import { PERMISOS_DEFAULT } from '@/components/shared/types';

import dynamic from 'next/dynamic';

const PanelGenerico = dynamic(() => import('@/components/Generico/PanelGenerico'), { ssr: false });
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
else setVista('generico_home'); // 👈 mismo cambio aquí
return;
    }
    const prev = historial[historial.length - 1];
    setHistorial(h => h.slice(0, -1));
    setVista(prev);
  };

  // Escuchar solo el cambio de sesión (esto sí es necesario)
  useEffect(() => {
    const unsub = escucharSesion((u) => {
      setUser(u);
      setCargandoSesion(false);
      setHistorial([]);
      if (u.rol === 'jefe') setVista('jefe_home');
else if (u.rol === 'vendedor') setVista('vendedor_home');
else if (u.rol === 'bodega') setVista('bodega_home');
else if (u.rol === 'chofer') setVista('chofer_home');
else if (u.rol === 'cajero') setVista('cajero_home');
else setVista('generico_home'); // 👈 cualquier rol personalizado (gerente, mecánico, etc.)
    });
    return () => unsub();
  }, []);

  // Cargar datos UNA SOLA VEZ (sin tiempo real) → más barato / gratis
  useEffect(() => {
    if (!user) return;

    const cargarDatos = async () => {
      try {
        // Productos
        const ps = await getDocs(collection(db, 'productos'));
        const listaProductos: Producto[] = [];
        ps.forEach(d => {
          const x = d.data();
          listaProductos.push({
            id: d.id,
            codigo: x.codigo || '',
            nombre: x.nombre || '',
            stock: x.stock || 0,
            stockMinimo: x.stockMinimo ?? 5,
            precio: x.precio || 0,
            costo: x.costo || 0,
            imagen: x.imagen || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=300',
            categoria: x.categoria || 'Otros',
          });
        });
        setProductos(listaProductos);

        // Ventas
        const vs = await getDocs(collection(db, 'ventas'));
        const listaVentas: Venta[] = [];
        vs.forEach(d => listaVentas.push({ id: d.id, ...d.data() } as Venta));
        setVentas(listaVentas);

        // Turnos
        const ts = await getDocs(collection(db, 'turnos'));
        const listaTurnos: Turno[] = [];
        ts.forEach(d => listaTurnos.push({ id: d.id, ...d.data() } as Turno));
        setTurnos(listaTurnos);

        // Compras
        const cs = await getDocs(collection(db, 'compras'));
        const listaCompras: Compra[] = [];
        cs.forEach(d => listaCompras.push({ id: d.id, ...d.data() } as Compra));
        setCompras(listaCompras);

        // Usuarios
        const us = await getDocs(collection(db, 'usuarios'));
        const listaUsuarios: UsuarioSistema[] = [];
        us.forEach(d => listaUsuarios.push({ id: d.id, ...d.data() } as UsuarioSistema));
        setUsuariosSistema(listaUsuarios);

        // Permisos
        const permSnap = await getDoc(doc(db, 'config', 'permisos'));
        if (permSnap.exists()) {
          const x = permSnap.data();
          setPermisos({
            bodegaCrearProductos: x.bodegaCrearProductos !== false,
            bodegaAjustarStock: x.bodegaAjustarStock !== false,
            bodegaRegistrarCompras: x.bodegaRegistrarCompras !== false,
            choferRegistrarCompras: x.choferRegistrarCompras === true,
            cajaAbrirCerrar: x.cajaAbrirCerrar !== false,
            cajaCobrarPreventas: x.cajaCobrarPreventas !== false,
            cajaGestionarCreditos: x.cajaGestionarCreditos === true,
          });
        } else {
          setPermisos(PERMISOS_DEFAULT);
        }
      } catch (error) {
        console.error('Error cargando datos:', error);
      }
    };

    cargarDatos();
  }, [user]);

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

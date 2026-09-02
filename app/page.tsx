'use client';

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
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
const AbrirCaja = dynamic(() => import('@/components/Vendedor/AbrirCaja'), { ssr: false });
const CerrarCaja = dynamic(() => import('@/components/Vendedor/CerrarCaja'), { ssr: false });
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

    const unsubProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const lista: Producto[] = [];
      snapshot.forEach(d => {
        const x = d.data();
        lista.push({
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
      setProductos(lista);
    });

    const unsubVentas = onSnapshot(collection(db, 'ventas'), (snapshot) => {
      const lv: Venta[] = [];
      snapshot.forEach(d => lv.push({ id: d.id, ...d.data() } as Venta));
      setVentas(lv);
    });

    const unsubTurnos = onSnapshot(collection(db, 'turnos'), (snapshot) => {
      const lt: Turno[] = [];
      snapshot.forEach(d => lt.push({ id: d.id, ...d.data() } as Turno));
      setTurnos(lt);
    });

    const unsubCompras = onSnapshot(collection(db, 'compras'), (snapshot) => {
      const lc: Compra[] = [];
      snapshot.forEach(d => lc.push({ id: d.id, ...d.data() } as Compra));
      setCompras(lc);
    });

    const unsubUsuarios = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      const listaUs: UsuarioSistema[] = [];
      snapshot.forEach(d => listaUs.push({ id: d.id, ...d.data() } as UsuarioSistema));
      setUsuariosSistema(listaUs);
    });

    const unsubPermisos = onSnapshot(doc(db, 'config', 'permisos'), (snap) => {
      if (snap.exists()) {
        const x = snap.data();
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
    });

    return () => {
      unsubProductos();
      unsubVentas();
      unsubTurnos();
      unsubCompras();
      unsubUsuarios();
      unsubPermisos();
    };
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
        productos={productos}
        setProductos={setProductos}
        compras={compras}
        setCompras={setCompras}
        volver={volver}
        onCerrar={cerrar}
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

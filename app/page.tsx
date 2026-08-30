'use client';
import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, setDoc, deleteDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { Usuario, login as loginFirebase, cerrarSesion, escucharSesion } from '@/lib/auth';

type Vista =
  | 'login' | 'jefe_home'
  | 'vendedor_home' | 'vendedor_ticket' | 'vendedor_cerrar_caja'
  | 'bodega_home' | 'bodega_ajuste' | 'bodega_compra' | 'bodega_historial_compras'
  | 'chofer_home';

type JefeSeccion = 'inicio' | 'ventas' | 'inventario' | 'compras' | 'cajas' | 'usuarios' | 'proximamente';

interface Producto {
  id: string; codigo: string; nombre: string; stock: number; stockMinimo: number;
  precio: number; costo: number; imagen: string; categoria: string;
}
interface CarritoItem extends Producto { cantidad: number; }
interface Venta {
  id: string; total: number; items: any[]; fecha: any; estado: string;
  medioPago: string; vendedorId: string; vendedorNombre: string;
  recibido?: number; vuelto?: number; turnoId?: string;
}
interface Entrega {
  id: number; cliente: string; direccion: string; productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado'; choferId: string;
}
interface Turno {
  id: string;
  vendedorId: string;
  vendedorNombre: string;
  montoInicial: number;
  fechaApertura: any;
  estado: 'abierto' | 'cerrado';
  montoContado?: number;
  totalVentasEfectivo?: number;
  totalEsperado?: number;
  diferencia?: number;
  fechaCierre?: any;
}
interface CompraItem {
  productoId: string; nombre: string; cantidad: number; costoUnitario: number; subtotal: number;
}
interface Compra {
  id: string; proveedor: string; fecha: any; items: CompraItem[]; total: number; creadoPor: string;
}
interface UsuarioSistema {
  id: string;
  email: string;
  nombre?: string;
  rol: string;
  activo?: boolean;
}

const MENU_ITEMS: { key: JefeSeccion | string; label: string; icon: string; proximamente?: boolean }[] = [
  { key: 'inicio', label: 'Inicio', icon: '🏠' },
  { key: 'ventas', label: 'Ventas', icon: '🧾' },
  { key: 'inventario', label: 'Inventario', icon: '📦' },
  { key: 'compras', label: 'Compras', icon: '🚚' },
  { key: 'clientes', label: 'Clientes', icon: '👤', proximamente: true },
  { key: 'proveedores', label: 'Proveedores', icon: '🏭', proximamente: true },
  { key: 'creditos', label: 'Créditos / fiados', icon: '💳', proximamente: true },
  { key: 'cajas', label: 'Cierres de caja', icon: '💰' },
  { key: 'gastos', label: 'Gastos', icon: '📉', proximamente: true },
  { key: 'reportes', label: 'Reportes', icon: '📊', proximamente: true },
  { key: 'usuarios', label: 'Usuarios', icon: '🧑‍💼' },
  { key: 'configuracion', label: 'Configuración', icon: '⚙️', proximamente: true },
];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function TiendaSS() {
  const [user, setUser] = useState<Usuario | null>(null);
  const [vista, setVista] = useState<Vista>('login');
  const [historial, setHistorial] = useState<Vista[]>([]);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [cargandoLogin, setCargandoLogin] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [usuariosSistema, setUsuariosSistema] = useState<UsuarioSistema[]>([]);

  // Estados para la gestión de usuarios en el Panel del Jefe
  const [nuevoEmailUsuario, setNuevoEmailUsuario] = useState('');
  const [nuevoPassUsuario, setNuevoPassUsuario] = useState('');
  const [nuevoNombreUsuario, setNuevoNombreUsuario] = useState('');
  const [nuevoRolUsuario, setNuevoRolUsuario] = useState('vendedor');

  // Jefe: panel nuevo
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [jefeSeccion, setJefeSeccion] = useState<JefeSeccion>('inicio');
  const [proximamenteNombre, setProximamenteNombre] = useState('');

  // Vendedor
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [medioPago, setMedioPago] = useState<'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Mixto'>('Efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null);
  const [montoAperturaInput, setMontoAperturaInput] = useState('');
  const [montoContadoInput, setMontoContadoInput] = useState('');

  // Bodega - productos
  const [nombreProd, setNombreProd] = useState('');
  const [stockIni, setStockIni] = useState('');
  const [precioProd, setPrecioProd] = useState('');
  const [stockMin, setStockMin] = useState('5');
  const [busquedaBod, setBusquedaBod] = useState('');
  const [ajusteId, setAjusteId] = useState<string | null>(null);
  const [ajusteCant, setAjusteCant] = useState('');
  const [ajusteTipo, setAjusteTipo] = useState<'entrada' | 'salida' | 'merma'>('entrada');

  // Compras (usado por Bodega y por Jefe)
  const [proveedorInput, setProveedorInput] = useState('');
  const [compraItems, setCompraItems] = useState<CompraItem[]>([]);
  const [prodSeleccionadoId, setProdSeleccionadoId] = useState('');
  const [cantCompraInput, setCantCompraInput] = useState('');
  const [costoCompraInput, setCostoCompraInput] = useState('');

  const [entregas, setEntregas] = useState<Entrega[]>([
    { id: 1, cliente: 'Juan Pérez', direccion: 'Reparto Schick', productos: 'TV Samsung 55"', estado: 'Pendiente', choferId: 'u5' },
    { id: 2, cliente: 'Ana López', direccion: 'Villa El Carmen', productos: 'Cama King', estado: 'En Ruta', choferId: 'u5' },
    { id: 3, cliente: 'Luis Mora', direccion: 'Centroamérica', productos: 'Celular Infinix', estado: 'Entregado', choferId: 'u5' },
  ]);

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
        else setVista('chofer_home');
      } else {
        setVista('login');
      }
    });
    return () => unsub();
  }, []);

  const cargarUsuariosSistema = async () => {
    try {
      const usSnapshot = await getDocs(collection(db, 'usuarios'));
      const listaUs: UsuarioSistema[] = [];
      usSnapshot.forEach(d => {
        listaUs.push({ id: d.id, ...d.data() } as UsuarioSistema);
      });
      setUsuariosSistema(listaUs);
    } catch (e) {
      console.error("Error al cargar usuarios:", e);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const ps = await getDocs(collection(db, 'productos'));
        const lista: Producto[] = [];
        ps.forEach(d => {
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

        const vs = await getDocs(collection(db, 'ventas'));
        const lv: Venta[] = [];
        vs.forEach(d => lv.push({ id: d.id, ...d.data() } as Venta));
        setVentas(lv);

        const ts = await getDocs(collection(db, 'turnos'));
        const lt: Turno[] = [];
        ts.forEach(d => lt.push({ id: d.id, ...d.data() } as Turno));
        setTurnos(lt);

        const cs = await getDocs(collection(db, 'compras'));
        const lc: Compra[] = [];
        cs.forEach(d => lc.push({ id: d.id, ...d.data() } as Compra));
        setCompras(lc);

        await cargarUsuariosSistema();
      } catch (e) {
        console.error(e);
      }
    })();
  }, [user]);

  const registrarNuevoUsuarioSistema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEmailUsuario || !nuevoPassUsuario || !nuevoNombreUsuario.trim()) {
      alert('Ingresa nombre, correo y contraseña');
      return;
    }
    try {
      // 1. Crear usuario en Firebase Authentication
      const cred = await createUserWithEmailAndPassword(
        auth,
        nuevoEmailUsuario.trim().toLowerCase(),
        nuevoPassUsuario
      );
      const uid = cred.user.uid;

      // 2. Crear perfil en Firestore usando el UID como ID del documento
      await setDoc(doc(db, 'usuarios', uid), {
        email: nuevoEmailUsuario.trim().toLowerCase(),
        nombre: nuevoNombreUsuario.trim(),
        rol: nuevoRolUsuario,
        activo: true,
      });

      setNuevoEmailUsuario('');
      setNuevoPassUsuario('');
      setNuevoNombreUsuario('');
      setNuevoRolUsuario('vendedor');
      alert('¡Usuario registrado correctamente!');
      await cargarUsuariosSistema();
    } catch (error: any) {
      console.error("Error al registrar usuario:", error);
      if (error.code === 'auth/email-already-in-use') {
        alert('Ese correo ya está registrado');
      } else if (error.code === 'auth/weak-password') {
        alert('La contraseña debe tener al menos 6 caracteres');
      } else {
        alert('Error al registrar el usuario: ' + (error.message || ''));
      }
    }
  };

  const cambiarEstadoUsuario = async (id: string, estadoActual: boolean) => {
    try {
      const usuarioRef = doc(db, 'usuarios', id);
      await updateDoc(usuarioRef, { activo: !estadoActual });
      await cargarUsuariosSistema();
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      alert('No se pudo actualizar el estado');
    }
  };

  const eliminarUsuario = async (id: string, email: string) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente a ${email}?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }
    try {
      // Borra el perfil de Firestore (el usuario ya no podrá iniciar sesión)
      await deleteDoc(doc(db, 'usuarios', id));
      await cargarUsuariosSistema();
      alert('Usuario eliminado correctamente');
    } catch (error) {
      console.error("Error al eliminar usuario:", error);
      alert('No se pudo eliminar el usuario');
    }
  };

  const hoy = new Date();
  const esHoy = (f: any) => {
    if (!f) return false;
    const d = f.toDate ? f.toDate() : new Date(f);
    return d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
  };
  const ventasHoy = ventas.filter(v => esHoy(v.fecha));
  const totalHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
  const ticketsHoy = ventasHoy.length;
  const stockBajo = productos.filter(p => p.stock <= p.stockMinimo);

  const utilidadHoy = ventasHoy.reduce((s, v) => {
    const u = (v.items || []).reduce((s2: number, it: any) => {
      const p = productos.find(pp => pp.id === it.id);
      const costo = p ? p.costo : 0;
      return s2 + (it.precio - costo) * it.cantidad;
    }, 0);
    return s + u;
  }, 0);

  const porPago: Record<string, number> = {};
  ventasHoy.forEach(v => {
    const m = v.medioPago || 'Otros';
    porPago[m] = (porPago[m] || 0) + (v.total || 0);
  });

  const ventasPorMes = (() => {
    const arr: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const total = ventas.filter(v => {
        const f = v.fecha?.toDate ? v.fecha.toDate() : new Date(v.fecha || 0);
        return f.getFullYear() === d.getFullYear() && f.getMonth() === d.getMonth();
      }).reduce((s, v) => s + (v.total || 0), 0);
      arr.push({ label: MESES[d.getMonth()], total });
    }
    return arr;
  })();
  const maxMes = Math.max(1, ...ventasPorMes.map(d => d.total));

  const turnoAbierto = user?.rol === 'vendedor'
    ? turnos.find(t => t.vendedorId === user.id && t.estado === 'abierto')
    : undefined;

  const ventasEfectivoTurno = turnoAbierto
    ? ventas.filter(v => v.turnoId === turnoAbierto.id && v.medioPago === 'Efectivo')
        .reduce((s, v) => s + (v.total || 0), 0)
    : 0;

  const turnosAbiertosAhora = turnos.filter(t => t.estado === 'abierto');
  const cierresConDiferencia = turnos.filter(t => t.estado === 'cerrado' && t.diferencia !== 0);

  const manejarLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorLogin('');
    setCargandoLogin(true);
    try {
      await loginFirebase(emailInput.trim(), passInput);
      setEmailInput('');
      setPassInput('');
    } catch (err: any) {
      setErrorLogin(
        err?.message?.includes('desactivado')
          ? err.message
          : 'Correo o contraseña incorrectos'
      );
    } finally {
      setCargandoLogin(false);
    }
  };

  const cerrar = async () => {
    await cerrarSesion();
    setCarrito([]);
    setUltimaVenta(null);
    setMenuAbierto(false);
  };

  const agregarCarrito = (p: Producto) => {
    if (p.stock <= 0) { alert('Sin stock'); return; }
    const ex = carrito.find(c => c.id === p.id);
    if (ex) {
      if (ex.cantidad >= p.stock) { alert('Stock máximo'); return; }
      setCarrito(carrito.map(c => c.id === p.id ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else setCarrito([...carrito, { ...p, cantidad: 1 }]);
  };

  const cantCarrito = (id: string, d: number) => {
    const base = productos.find(p => p.id === id);
    setCarrito(carrito.map(c => {
      if (c.id !== id) return c;
      const n = c.cantidad + d;
      if (n <= 0) return null as any;
      if (base && n > base.stock) { alert('Stock máximo'); return c; }
      return { ...c, cantidad: n };
    }).filter(Boolean));
  };

  const totalCarrito = carrito.reduce((s, c) => s + c.precio * c.cantidad, 0);
  const vuelto = medioPago === 'Efectivo' && montoRecibido
    ? Math.max(0, parseFloat(montoRecibido) - totalCarrito) : 0;

  const cobrar = async () => {
    if (!user || carrito.length === 0) return;
    if (user.rol === 'vendedor' && !turnoAbierto) {
      alert('Debes abrir caja antes de vender');
      return;
    }
    if (medioPago === 'Efectivo' && (!montoRecibido || parseFloat(montoRecibido) < totalCarrito)) {
      alert('El monto recibido debe ser mayor o igual al total');
      return;
    }
    try {
      const data = {
        items: carrito.map(c => ({
          id: c.id, codigo: c.codigo, nombre: c.nombre,
          cantidad: c.cantidad, precio: c.precio, subtotal: c.precio * c.cantidad
        })),
        total: totalCarrito,
        fecha: serverTimestamp(),
        estado: 'Completada',
        medioPago,
        vendedorId: user.id,
        vendedorNombre: user.nombre,
        recibido: medioPago === 'Efectivo' ? parseFloat(montoRecibido) : totalCarrito,
        vuelto: medioPago === 'Efectivo' ? vuelto : 0,
        turnoId: turnoAbierto ? turnoAbierto.id : null,
      };
      const ref = await addDoc(collection(db, 'ventas'), data);

      for (const c of carrito) {
        await updateDoc(doc(db, 'productos', c.id), {
          stock: Math.max(0, c.stock - c.cantidad)
        });
      }
      setProductos(productos.map(p => {
        const c = carrito.find(x => x.id === p.id);
        return c ? { ...p, stock: Math.max(0, p.stock - c.cantidad) } : p;
      }));

      const vs = await getDocs(collection(db, 'ventas'));
      const lv: Venta[] = [];
      vs.forEach(d => lv.push({ id: d.id, ...d.data() } as Venta));
      setVentas(lv);

      const ticket: Venta = { id: ref.id, ...data, fecha: new Date() } as any;
      setUltimaVenta(ticket);
      setCarrito([]);
      setMontoRecibido('');
      irA('vendedor_ticket');
    } catch (e) {
      console.error(e);
      alert('Error al cobrar');
    }
  };

  const abrirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (montoAperturaInput === '') { alert('Ingresa el monto con el que abres caja'); return; }
    try {
      const data = {
        vendedorId: user.id,
        vendedorNombre: user.nombre,
        montoInicial: parseFloat(montoAperturaInput) || 0,
        fechaApertura: serverTimestamp(),
        estado: 'abierto' as const,
      };
      const ref = await addDoc(collection(db, 'turnos'), data);
      setTurnos([...turnos, { id: ref.id, ...data, fechaApertura: new Date() } as Turno]);
      setMontoAperturaInput('');
    } catch (e) {
      console.error(e);
      alert('Error al abrir caja');
    }
  };

  const cerrarCaja = async () => {
    if (!turnoAbierto) return;
    if (montoContadoInput === '') { alert('Ingresa el monto contado en caja'); return; }
    const contado = parseFloat(montoContadoInput) || 0;
    const totalEsperado = turnoAbierto.montoInicial + ventasEfectivoTurno;
    const diferencia = contado - totalEsperado;
    try {
      await updateDoc(doc(db, 'turnos', turnoAbierto.id), {
        estado: 'cerrado',
        montoContado: contado,
        totalVentasEfectivo: ventasEfectivoTurno,
        totalEsperado,
        diferencia,
        fechaCierre: serverTimestamp(),
      });
      setTurnos(turnos.map(t => t.id === turnoAbierto.id ? {
        ...t, estado: 'cerrado', montoContado: contado,
        totalVentasEfectivo: ventasEfectivoTurno, totalEsperado, diferencia
      } : t));
      setMontoContadoInput('');
      alert(diferencia === 0 ? 'Caja cuadrada perfectamente ✅' : `Caja cerrada. Diferencia: $${diferencia.toFixed(0)}`);
      setVista('vendedor_home');
      setHistorial([]);
    } catch (e) {
      console.error(e);
      alert('Error al cerrar caja');
    }
  };

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProd || !stockIni) { alert('Nombre y stock obligatorios'); return; }
    try {
      const data = {
        codigo: `PROD-${Math.floor(1000 + Math.random() * 9000)}`,
        nombre: nombreProd.trim(),
        stock: parseInt(stockIni) || 0,
        stockMinimo: parseInt(stockMin) || 5,
        precio: parseFloat(precioProd) || 0,
        costo: 0,
        categoria: 'Otros',
        imagen: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=300',
        creadoPor: user?.nombre,
        creadoEn: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'productos'), data);
      setProductos([{ id: ref.id, ...data } as Producto, ...productos]);
      setNombreProd(''); setStockIni(''); setPrecioProd(''); setStockMin('5');
      alert('Producto agregado');
    } catch (e) {
      console.error(e);
      alert('Error');
    }
  };

  const aplicarAjuste = async () => {
    if (!ajusteId || !ajusteCant) return;
    const p = productos.find(x => x.id === ajusteId);
    if (!p) return;
    const cant = parseInt(ajusteCant);
    if (isNaN(cant) || cant <= 0) { alert('Cantidad inválida'); return; }
    let ns = p.stock;
    if (ajusteTipo === 'entrada') ns += cant;
    else ns = Math.max(0, p.stock - cant);
    try {
      await updateDoc(doc(db, 'productos', ajusteId), {
        stock: ns,
        actualizadoPor: user?.nombre,
        actualizadoEn: serverTimestamp(),
      });
      setProductos(productos.map(x => x.id === ajusteId ? { ...x, stock: ns } : x));
      setAjusteId(null); setAjusteCant('');
      alert('Stock actualizado');
    } catch (e) {
      console.error(e);
      alert('Error');
    }
  };

  const agregarItemCompra = () => {
    const p = productos.find(x => x.id === prodSeleccionadoId);
    if (!p) { alert('Elige un producto'); return; }
    const cant = parseInt(cantCompraInput);
    const costo = parseFloat(costoCompraInput);
    if (!cant || cant <= 0) { alert('Cantidad inválida'); return; }
    if (isNaN(costo) || costo < 0) { alert('Costo inválido'); return; }
    setCompraItems([...compraItems, {
      productoId: p.id, nombre: p.nombre, cantidad: cant, costoUnitario: costo, subtotal: cant * costo
    }]);
    setProdSeleccionadoId(''); setCantCompraInput(''); setCostoCompraInput('');
  };

  const quitarItemCompra = (idx: number) => {
    setCompraItems(compraItems.filter((_, i) => i !== idx));
  };

  const totalCompra = compraItems.reduce((s, i) => s + i.subtotal, 0);

  const registrarCompra = async () => {
    if (compraItems.length === 0) { alert('Agrega al menos un producto'); return; }
    try {
      const data = {
        proveedor: proveedorInput.trim() || 'Proveedor sin nombre',
        fecha: serverTimestamp(),
        items: compraItems,
        total: totalCompra,
        creadoPor: user?.nombre || '',
      };
      await addDoc(collection(db, 'compras'), data);

      for (const item of compraItems) {
        const p = productos.find(x => x.id === item.productoId);
        if (!p) continue;
        const nuevoStock = p.stock + item.cantidad;
        const nuevoCosto = p.stock > 0
          ? ((p.costo * p.stock) + (item.costoUnitario * item.cantidad)) / nuevoStock
          : item.costoUnitario;
        await updateDoc(doc(db, 'productos', item.productoId), {
          stock: nuevoStock,
          costo: nuevoCosto,
        });
      }

      const ps = await getDocs(collection(db, 'productos'));
      const lista: Producto[] = [];
      ps.forEach(d => {
        const x = d.data();
        lista.push({
          id: d.id, codigo: x.codigo || '', nombre: x.nombre || '', stock: x.stock || 0,
          stockMinimo: x.stockMinimo ?? 5, precio: x.precio || 0, costo: x.costo || 0,
          imagen: x.imagen || 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=300',
          categoria: x.categoria || 'Otros',
        });
      });
      setProductos(lista);

      const cs = await getDocs(collection(db, 'compras'));
      const lc: Compra[] = [];
      cs.forEach(d => lc.push({ id: d.id, ...d.data() } as Compra));
      setCompras(lc);

      setProveedorInput('');
      setCompraItems([]);
      alert('Compra registrada. Stock y costo actualizados.');
    } catch (e) {
      console.error(e);
      alert('Error al registrar la compra');
    }
  };

  const btnVolver = (
    <button onClick={volver} style={{
      background: '#1f2937', border: '1px solid #374151', borderRadius: 10,
      padding: '8px 12px', color: '#d1d5db', fontWeight: 600, fontSize: 12, cursor: 'pointer'
    }}>← Volver</button>
  );

  const btnCerrar = (
    <button onClick={() => cerrar()} style={{
      background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
      padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer'
    }}>Cerrar</button>
  );

  if (cargandoSesion) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div><p>Cargando Tienda-SS...</p></div>
      </div>
    );
  }

  // ========== LOGIN ==========
  if (vista === 'login' || !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#111827', border: '1px solid #1f2937', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 50, height: 50, background: '#1f2937', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#facc15', fontSize: 24, border: '1px solid #374151', margin: '0 auto 8px' }}>⚡</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Tienda-SS</h1>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Sistema de control</p>
          </div>
          <form onSubmit={manejarLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Correo" type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }} />
            <input type="password" placeholder="Contraseña" value={passInput} onChange={e => setPassInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }} />
            {errorLogin && (
              <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{errorLogin}</p>
            )}
            <button type="submit" disabled={cargandoLogin} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: cargandoLogin ? 'not-allowed' : 'pointer', opacity: cargandoLogin ? 0.7 : 1 }}>
              {cargandoLogin ? 'Entrando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ========== PANEL DEL JEFE (nuevo, con menú tipo sidebar) ==========
  if (vista === 'jefe_home') {
    const seleccionar = (item: typeof MENU_ITEMS[number]) => {
      if (item.proximamente) {
        setProximamenteNombre(item.label);
        setJefeSeccion('proximamente');
      } else {
        setJefeSeccion(item.key as JefeSeccion);
      }
      setMenuAbierto(false);
    };

    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', fontFamily: 'sans-serif' }}>
        {/* Encabezado */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setMenuAbierto(true)} style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 10, width: 36, height: 36, color: '#fff', fontSize: 16, cursor: 'pointer' }}>☰</button>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#f87171', margin: 0 }}>⚡ Panel del Jefe</p>
              <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 9, color: '#9ca3af', margin: 0 }}>Hoy</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#34d399', margin: 0 }}>${totalHoy.toLocaleString()}</p>
            </div>
            {btnCerrar}
          </div>
        </div>

        {/* Menú deslizable */}
        {menuAbierto && (
          <div onClick={() => setMenuAbierto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 260, background: '#111827', borderRight: '1px solid #1f2937', height: '100%', padding: 16, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>Tienda-SS</p>
                <button onClick={() => setMenuAbierto(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              {MENU_ITEMS.map(item => (
                <button key={item.key} onClick={() => seleccionar(item)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                    background: jefeSeccion === item.key ? '#1e1b4b' : 'transparent',
                    border: 'none', borderRadius: 10, padding: '10px 12px', marginBottom: 4,
                    color: item.proximamente ? '#6b7280' : '#f3f4f6', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                  }}>
                  <span>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.proximamente && <span style={{ fontSize: 9, color: '#6b7280' }}>Próx.</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contenido */}
        <div style={{ padding: 12, maxWidth: 600, margin: '0 auto' }}>

          {jefeSeccion === 'inicio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Ventas hoy</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: '#34d399', margin: '4px 0 0' }}>${totalHoy.toLocaleString()}</p>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Utilidad hoy</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: '#818cf8', margin: '4px 0 0' }}>${utilidadHoy.toFixed(0)}</p>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Stock bajo</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: stockBajo.length ? '#f87171' : '#34d399', margin: '4px 0 0' }}>{stockBajo.length}</p>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Cobros pendientes</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', margin: '4px 0 0' }}>Próximamente</p>
                </div>
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>📊 Ventas de los últimos 6 meses</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                  {ventasPorMes.map((m, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', height: `${Math.max(4, (m.total / maxMes) * 90)}px`, background: '#4f46e5', borderRadius: 4 }} />
                      <span style={{ fontSize: 9, color: '#9ca3af' }}>{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>⚠️ Alertas</p>
                {stockBajo.length === 0 && cierresConDiferencia.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>Sin alertas por ahora.</p>
                ) : (
                  <>
                    {stockBajo.slice(0, 4).map(p => (
                      <p key={p.id} style={{ fontSize: 12, color: '#f87171', margin: '4px 0' }}>📦 {p.nombre}: quedan {p.stock} (mín. {p.stockMinimo})</p>
                    ))}
                    {cierresConDiferencia.slice(0, 3).map(t => (
                      <p key={t.id} style={{ fontSize: 12, color: '#f87171', margin: '4px 0' }}>💰 Caja de {t.vendedorNombre} no cuadró: ${t.diferencia?.toFixed(0)}</p>
                    ))}
                  </>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => setJefeSeccion('ventas')} style={{ background: '#0c4a6e', border: '1px solid #0ea5e9', borderRadius: 12, padding: 14, color: '#7dd3fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🧾 Ver ventas</button>
                <button onClick={() => setJefeSeccion('inventario')} style={{ background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: 12, padding: 14, color: '#a5b4fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📦 Inventario</button>
                <button onClick={() => setJefeSeccion('compras')} style={{ background: '#052e2b', border: '1px solid #0d9488', borderRadius: 12, padding: 14, color: '#5eead4', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🚚 Nueva compra</button>
                <button onClick={() => setJefeSeccion('cajas')} style={{ background: '#3f1d0f', border: '1px solid #ea580c', borderRadius: 12, padding: 14, color: '#fdba74', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>💰 Cierres de caja</button>
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>🕒 Movimientos recientes</p>
                {ventas.slice().reverse().slice(0, 5).map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1f2937', fontSize: 12 }}>
                    <span>{v.vendedorNombre} · {v.medioPago}</span>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>${(v.total || 0).toLocaleString()}</span>
                  </div>
                ))}
                {ventas.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Sin movimientos todavía.</p>}
              </div>

              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>🗄️ Cajas abiertas ahora</p>
                {turnosAbiertosAhora.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>Ninguna caja abierta.</p>
                ) : turnosAbiertosAhora.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                    <span>{t.vendedorNombre}</span>
                    <span>Inicial: ${t.montoInicial.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jefeSeccion === 'ventas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🧾 Ventas del día</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{ticketsHoy} tickets · ${totalHoy.toLocaleString()}</p>
              {Object.keys(porPago).length > 0 && (
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>💳 Por forma de pago</p>
                  {Object.entries(porPago).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                      <span>{k}</span><span style={{ fontWeight: 700, color: '#818cf8' }}>${v.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {ventasHoy.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>No hay ventas hoy</p>
              ) : ventasHoy.slice().reverse().map(v => (
                <div key={v.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{v.vendedorNombre || '—'}</span>
                    <span style={{ fontWeight: 800, color: '#34d399' }}>${(v.total || 0).toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{v.medioPago} · {(v.items || []).length} producto(s)</p>
                </div>
              ))}
            </div>
          )}

          {jefeSeccion === 'inventario' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📦 Inventario</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Valor a costo</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#fbbf24', margin: '4px 0 0' }}>${productos.reduce((s, p) => s + p.costo * p.stock, 0).toLocaleString()}</p>
                </div>
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Valor a venta</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#34d399', margin: '4px 0 0' }}>${productos.reduce((s, p) => s + p.precio * p.stock, 0).toLocaleString()}</p>
                </div>
              </div>
              {productos.map(p => (
                <div key={p.id} style={{ background: '#111827', border: `1px solid ${p.stock <= p.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0 }}>{p.nombre}</p>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Venta ${p.precio} · Costo ${p.costo.toFixed(2)} · Mín {p.stockMinimo}</p>
                    <p style={{ fontSize: 11, color: '#818cf8', margin: '2px 0 0' }}>Margen: ${(p.precio - p.costo).toFixed(2)}/u</p>
                  </div>
                  <span style={{ fontWeight: 800, color: p.stock <= p.stockMinimo ? '#f87171' : '#34d399' }}>{p.stock} un</span>
                </div>
              ))}
            </div>
          )}

          {jefeSeccion === 'compras' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🚚 Registrar compra</p>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Proveedor</p>
                <input placeholder="Nombre del proveedor" value={proveedorInput} onChange={e => setProveedorInput(e.target.value)}
                  style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
              </div>
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>Agregar producto</p>
                <select value={prodSeleccionadoId} onChange={e => setProdSeleccionadoId(e.target.value)}
                  style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}>
                  <option value="">Selecciona un producto...</option>
                  {productos.map(p => (<option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock})</option>))}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="number" placeholder="Cantidad" value={cantCompraInput} onChange={e => setCantCompraInput(e.target.value)}
                    style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
                  <input type="number" placeholder="Costo unitario" value={costoCompraInput} onChange={e => setCostoCompraInput(e.target.value)}
                    style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
                </div>
                <button onClick={agregarItemCompra} style={{ background: '#0d9488', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Agregar a la compra</button>
              </div>
              {compraItems.length > 0 && (
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
                  {compraItems.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                      <span>{it.nombre} x{it.cantidad} (${it.costoUnitario} c/u)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#34d399', fontWeight: 700 }}>${it.subtotal.toFixed(0)}</span>
                        <button onClick={() => quitarItemCompra(idx)} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                    <span>Total</span><span>${totalCompra.toFixed(0)}</span>
                  </div>
                  <button onClick={registrarCompra} style={{ width: '100%', marginTop: 10, background: '#10b981', color: '#030712', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                    ✅ Registrar compra
                  </button>
                </div>
              )}
              {compras.length > 0 && (
                <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc', margin: '0 0 10px' }}>Historial de compras</p>
                  {compras.slice().reverse().slice(0, 10).map(c => (
                    <div key={c.id} style={{ borderBottom: '1px solid #1f2937', paddingBottom: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{c.proveedor}</span>
                        <span style={{ color: '#34d399', fontWeight: 700 }}>${(c.total || 0).toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Por {c.creadoPor}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {jefeSeccion === 'cajas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>💰 Cierres de caja</p>
              {turnos.slice().sort((a, b) => {
                const fa = a.fechaApertura?.toDate ? a.fechaApertura.toDate() : new Date(a.fechaApertura || 0);
                const fb = b.fechaApertura?.toDate ? b.fechaApertura.toDate() : new Date(b.fechaApertura || 0);
                return fb.getTime() - fa.getTime();
              }).map(t => (
                <div key={t.id} style={{ background: '#111827', border: `1px solid ${t.estado === 'cerrado' && t.diferencia !== 0 ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700 }}>{t.vendedorNombre}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: t.estado === 'abierto' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)', color: t.estado === 'abierto' ? '#60a5fa' : '#34d399' }}>
                      {t.estado === 'abierto' ? 'Abierta' : 'Cerrada'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>Inicial: ${t.montoInicial?.toLocaleString()}</p>
                  {t.estado === 'cerrado' && (
                    <p style={{ fontSize: 13, fontWeight: 800, margin: '6px 0 0', color: t.diferencia === 0 ? '#34d399' : '#f87171' }}>
                      Diferencia: ${t.diferencia?.toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
              {turnos.length === 0 && <p style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>Aún no hay turnos registrados</p>}
            </div>
          )}

          {jefeSeccion === 'usuarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🧑‍💼 Gestión de Usuarios</p>
              
              {/* Formulario para registrar un nuevo usuario */}
              <form onSubmit={registrarNuevoUsuarioSistema} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Registrar nuevo empleado</p>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Nombre completo</label>
                  <input type="text" value={nuevoNombreUsuario} onChange={e => setNuevoNombreUsuario(e.target.value)} required
                    placeholder="Ej: Carlos Pérez"
                    style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Correo electrónico</label>
                  <input type="email" value={nuevoEmailUsuario} onChange={e => setNuevoEmailUsuario(e.target.value)} required
                    style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Contraseña</label>
                  <input type="password" value={nuevoPassUsuario} onChange={e => setNuevoPassUsuario(e.target.value)} required
                    style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Rol asignado</label>
                  <select value={nuevoRolUsuario} onChange={e => setNuevoRolUsuario(e.target.value)}
                    style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="vendedor">Vendedor</option>
                    <option value="bodega">Bodega</option>
                    <option value="chofer">Chofer</option>
                    <option value="jefe">Jefe</option>
                  </select>
                </div>
                <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
                  Guardar Empleado
                </button>
              </form>

              {/* Lista de usuarios registrados */}
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc', margin: '0 0 10px' }}>Empleados Registrados</p>
                {usuariosSistema.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', padding: 10 }}>No hay usuarios en la base de datos</p>
                ) : (
                  usuariosSistema.map(u => {
                    const estaActivo = u.activo !== false;
                    return (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: 10, marginBottom: 10, gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{u.nombre || u.email}</p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                            {u.email}
                          </p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                            Rol: <span style={{ textTransform: 'uppercase', color: '#facc15' }}>{u.rol}</span> · Estado: <span style={{ color: estaActivo ? '#34d399' : '#f87171', fontWeight: 700 }}>{estaActivo ? 'Activo' : 'Inactivo'}</span>
                          </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button onClick={() => cambiarEstadoUsuario(u.id, estaActivo)}
                            style={{
                              background: estaActivo ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                              color: estaActivo ? '#f87171' : '#34d399',
                              border: `1px solid ${estaActivo ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                              padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                            }}>
                            {estaActivo ? 'Desactivar' : 'Activar'}
                          </button>
                          <button onClick={() => eliminarUsuario(u.id, u.email)}
                            style={{
                              background: 'rgba(239,68,68,0.25)',
                              color: '#fca5a5',
                              border: '1px solid rgba(239,68,68,0.5)',
                              padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                            }}>
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {jefeSeccion === 'proximamente' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>🚧</p>
              <p style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>{proximamenteNombre}</p>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Este módulo está en construcción. Lo vamos a agregar en un próximo paso.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== VENDEDOR: ABRIR CAJA ==========
  if (vista === 'vendedor_home' && !turnoAbierto) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 400, background: '#111827', border: '1px solid #1f2937', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: '#facc15', margin: 0 }}>🔓 Abrir caja</h1>
            {btnCerrar}
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
            {user.nombre}, antes de vender, cuenta el efectivo que tienes en caja ahora mismo e ingrésalo.
          </p>
          <form onSubmit={abrirCaja} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="number" placeholder="Monto inicial en efectivo" value={montoAperturaInput} onChange={e => setMontoAperturaInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, outline: 'none' }} />
            <button type="submit" style={{ background: '#10b981', color: '#030712', border: 'none', padding: 12, borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              Abrir caja y empezar a vender
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ========== VENDEDOR: CERRAR CAJA ==========
  if (vista === 'vendedor_cerrar_caja' && turnoAbierto) {
    const totalEsperado = turnoAbierto.montoInicial + ventasEfectivoTurno;
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {btnVolver}
            {btnCerrar}
          </div>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16 }}>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: '#facc15', margin: '0 0 12px' }}>🔒 Cerrar caja</h1>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>Monto inicial</span><span>${turnoAbierto.montoInicial.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>Ventas en efectivo</span><span>${ventasEfectivoTurno.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, borderTop: '1px solid #374151', paddingTop: 8, marginTop: 4 }}>
              <span>Esperado en caja</span><span>${totalEsperado.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, margin: 0 }}>Cuenta el efectivo físico y escribe cuánto contaste:</p>
            <input type="number" placeholder="Monto contado" value={montoContadoInput} onChange={e => setMontoContadoInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, outline: 'none' }} />
            <button onClick={cerrarCaja} style={{ background: '#f59e0b', color: '#030712', border: 'none', padding: 12, borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              Confirmar cierre de caja
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== VENDEDOR HOME ==========
  if (vista === 'vendedor_home') {
    const cat = productos.filter(p =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busqueda.toLowerCase())
    );
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif', paddingBottom: 40 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', margin: 0 }}>🛒 Punto de venta</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => irA('vendedor_cerrar_caja')} style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                🔒 Cerrar caja
              </button>
              {btnCerrar}
            </div>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: '8px 12px', fontSize: 11, color: '#9ca3af' }}>
            Caja abierta con ${turnoAbierto?.montoInicial.toLocaleString()} · Efectivo vendido: ${ventasEfectivoTurno.toLocaleString()}
          </div>

          {carrito.length > 0 && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>🧾 Carrito</p>
              {carrito.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span>{c.nombre}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => cantCarrito(c.id, -1)} style={{ background: '#374151', color: '#fff', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>−</button>
                    <span style={{ fontWeight: 700 }}>{c.cantidad}</span>
                    <button onClick={() => cantCarrito(c.id, 1)} style={{ background: '#4f46e5', color: '#fff', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>+</button>
                    <span style={{ color: '#34d399', minWidth: 50, textAlign: 'right' }}>${(c.precio * c.cantidad).toFixed(0)}</span>
                  </div>
                </div>
              ))}

              <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10 }}>
                <p style={{ fontWeight: 800, fontSize: 16, margin: '0 0 10px' }}>Total: ${totalCarrito.toFixed(0)}</p>

                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>Forma de pago</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {(['Efectivo', 'Tarjeta', 'Transferencia', 'Mixto'] as const).map(m => (
                    <button key={m} onClick={() => setMedioPago(m)}
                      style={{
                        padding: 8, borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: medioPago === m ? '#4f46e5' : '#1f2937', color: '#fff'
                      }}>{m}</button>
                  ))}
                </div>

                {medioPago === 'Efectivo' && (
                  <div style={{ marginBottom: 10 }}>
                    <input type="number" placeholder="Monto recibido" value={montoRecibido} onChange={e => setMontoRecibido(e.target.value)}
                      style={{ width: '100%', background: '#030712', border: '1px solid #374151', borderRadius: 8, padding: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                    {montoRecibido && parseFloat(montoRecibido) >= totalCarrito && (
                      <p style={{ fontSize: 13, color: '#34d399', margin: '6px 0 0' }}>Vuelto: ${vuelto.toFixed(0)}</p>
                    )}
                  </div>
                )}

                <button onClick={cobrar} style={{ width: '100%', background: '#10b981', color: '#030712', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                  💳 Cobrar
                </button>
              </div>
            </div>
          )}

          <input placeholder="🔍 Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }} />

          {cat.map(p => (
            <div key={p.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 13 }}>{p.nombre}</p>
                <p style={{ fontSize: 12, color: '#34d399', margin: '2px 0 0' }}>${p.precio} · Stock {p.stock}</p>
              </div>
              <button onClick={() => agregarCarrito(p)} disabled={p.stock <= 0}
                style={{ background: p.stock <= 0 ? '#374151' : '#4f46e5', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: p.stock <= 0 ? 'not-allowed' : 'pointer' }}>
                ➕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== TICKET ==========
  if (vista === 'vendedor_ticket' && ultimaVenta) {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {btnVolver}
            {btnCerrar}
          </div>
          <div style={{ background: '#fff', color: '#111', borderRadius: 16, padding: 20 }}>
            <p style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, margin: '0 0 4px' }}>Tienda-SS</p>
            <p style={{ textAlign: 'center', fontSize: 11, color: '#666', margin: '0 0 14px' }}>Comprobante de venta</p>
            <p style={{ fontSize: 12, margin: '0 0 4px' }}>Vendedor: <b>{ultimaVenta.vendedorNombre}</b></p>
            <p style={{ fontSize: 12, margin: '0 0 12px' }}>Pago: <b>{ultimaVenta.medioPago}</b></p>
            <div style={{ borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '10px 0', marginBottom: 10 }}>
              {(ultimaVenta.items || []).map((it: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>{it.nombre} x{it.cantidad}</span>
                  <span>${it.subtotal}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
              <span>TOTAL</span>
              <span>${ultimaVenta.total}</span>
            </div>
            {ultimaVenta.medioPago === 'Efectivo' && (
              <>
                <p style={{ fontSize: 12, margin: '8px 0 0' }}>Recibido: ${ultimaVenta.recibido}</p>
                <p style={{ fontSize: 12, margin: 0 }}>Vuelto: ${ultimaVenta.vuelto}</p>
              </>
            )}
            <p style={{ textAlign: 'center', fontSize: 10, color: '#999', marginTop: 16 }}>¡Gracias por su compra!</p>
          </div>
          <button onClick={() => { setUltimaVenta(null); setVista('vendedor_home'); setHistorial([]); }}
            style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 14, borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>
            Nueva venta
          </button>
        </div>
      </div>
    );
  }

  // ========== BODEGA HOME ==========
  if (vista === 'bodega_home') {
    const filtrados = productos.filter(p =>
      p.nombre.toLowerCase().includes(busquedaBod.toLowerCase())
    );
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📦 Bodega</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            {btnCerrar}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => irA('bodega_compra')} style={{ background: '#052e2b', border: '1px solid #0d9488', borderRadius: 12, padding: 14, color: '#5eead4', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🚚 Nueva compra
            </button>
            <button onClick={() => irA('bodega_historial_compras')} style={{ background: '#1e1b4b', border: '1px solid #4f46e5', borderRadius: 12, padding: 14, color: '#a5b4fc', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📋 Historial compras
            </button>
          </div>

          <form onSubmit={guardarProducto} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>➕ Nuevo producto</p>
            <input placeholder="Nombre *" value={nombreProd} onChange={e => setNombreProd(e.target.value)} required
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Stock *" value={stockIni} onChange={e => setStockIni(e.target.value)} required
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
              <input type="number" placeholder="Mín" value={stockMin} onChange={e => setStockMin(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
              <input type="number" placeholder="Precio" value={precioProd} onChange={e => setPrecioProd(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 12, outline: 'none' }} />
            </div>
            <button type="submit" style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: 11, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Agregar</button>
          </form>

          <input placeholder="🔍 Buscar..." value={busquedaBod} onChange={e => setBusquedaBod(e.target.value)}
            style={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />

          {filtrados.map(p => (
            <div key={p.id} style={{ background: '#111827', border: `1px solid ${p.stock <= p.stockMinimo ? 'rgba(239,68,68,0.4)' : '#1f2937'}`, borderRadius: 14, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 700, margin: 0 }}>{p.nombre}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>Venta ${p.precio} · Costo ${p.costo.toFixed(2)} · Mín {p.stockMinimo}</p>
                </div>
                <span style={{ fontWeight: 800, color: p.stock <= p.stockMinimo ? '#f87171' : '#34d399' }}>{p.stock}</span>
              </div>
              <button onClick={() => { setAjusteId(p.id); setAjusteCant(''); }}
                style={{ marginTop: 8, width: '100%', background: '#064e3b', color: '#6ee7b7', border: 'none', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Ajustar stock
              </button>
              {ajusteId === p.id && (
                <div style={{ marginTop: 8, padding: 10, background: '#030712', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['entrada', 'salida', 'merma'] as const).map(t => (
                      <button key={t} onClick={() => setAjusteTipo(t)}
                        style={{ flex: 1, padding: 6, borderRadius: 6, border: 'none', fontSize: 11, cursor: 'pointer', background: ajusteTipo === t ? '#4f46e5' : '#1f2937', color: '#fff' }}>
                        {t === 'entrada' ? 'Entrada' : t === 'salida' ? 'Salida' : 'Merma'}
                      </button>
                    ))}
                  </div>
                  <input type="number" placeholder="Cantidad" value={ajusteCant} onChange={e => setAjusteCant(e.target.value)}
                    style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 8, color: '#fff', fontSize: 13, outline: 'none' }} />
                  <button onClick={aplicarAjuste} style={{ background: '#059669', color: '#fff', border: 'none', padding: 8, borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Aplicar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== BODEGA: NUEVA COMPRA ==========
  if (vista === 'bodega_compra') {
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {btnVolver}
              <h1 style={{ fontSize: 15, fontWeight: 800, color: '#5eead4', margin: 0 }}>🚚 Nueva compra</h1>
            </div>
            {btnCerrar}
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Proveedor</p>
            <input placeholder="Nombre del proveedor" value={proveedorInput} onChange={e => setProveedorInput(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
          </div>

          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: 0 }}>Agregar producto a la compra</p>
            <select value={prodSeleccionadoId} onChange={e => setProdSeleccionadoId(e.target.value)}
              style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }}>
              <option value="">Selecciona un producto...</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} (stock actual: {p.stock})</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Cantidad comprada" value={cantCompraInput} onChange={e => setCantCompraInput(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
              <input type="number" placeholder="Costo unitario" value={costoCompraInput} onChange={e => setCostoCompraInput(e.target.value)}
                style={{ background: '#030712', border: '1px solid #374151', borderRadius: 10, padding: 10, color: '#fff', fontSize: 13, outline: 'none' }} />
            </div>
            <button onClick={agregarItemCompra} style={{ background: '#0d9488', color: '#fff', border: 'none', padding: 10, borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
              Agregar a la compra
            </button>
          </div>

          {compraItems.length > 0 && (
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#facc15', margin: '0 0 10px' }}>Productos en esta compra</p>
              {compraItems.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
                  <span>{it.nombre} x{it.cantidad} (${it.costoUnitario} c/u)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>${it.subtotal.toFixed(0)}</span>
                    <button onClick={() => quitarItemCompra(idx)} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', width: 24, height: 24, borderRadius: 4, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}>
                <span>Total compra</span><span>${totalCompra.toFixed(0)}</span>
              </div>
              <button onClick={registrarCompra} style={{ width: '100%', marginTop: 10, background: '#10b981', color: '#030712', border: 'none', padding: 12, borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                ✅ Registrar compra y actualizar stock/costo
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== BODEGA: HISTORIAL COMPRAS ==========
  if (vista === 'bodega_historial_compras') {
    const comprasOrdenadas = compras.slice().sort((a, b) => {
      const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha || 0);
      const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha || 0);
      return fb.getTime() - fa.getTime();
    });
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {btnVolver}
              <h1 style={{ fontSize: 15, fontWeight: 800, color: '#a5b4fc', margin: 0 }}>📋 Historial de compras</h1>
            </div>
            {btnCerrar}
          </div>
          {comprasOrdenadas.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: 20 }}>Aún no hay compras registradas</p>
          ) : comprasOrdenadas.map(c => (
            <div key={c.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>{c.proveedor}</span>
                <span style={{ fontWeight: 800, color: '#34d399' }}>${(c.total || 0).toLocaleString()}</span>
              </div>
              {(c.items || []).map((it, i) => (
                <p key={i} style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>
                  {it.nombre} x{it.cantidad} · ${it.costoUnitario}/u
                </p>
              ))}
              <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 0' }}>Registrado por: {c.creadoPor}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ========== CHOFER ==========
  if (vista === 'chofer_home') {
    const mis = entregas.filter(e => e.choferId === user.id);
    return (
      <div style={{ minHeight: '100vh', background: '#030712', color: '#f3f4f6', padding: 12, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {historial.length > 0 && btnVolver}
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 800, color: '#facc15', margin: 0 }}>🚚 Mis entregas</h1>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{user.nombre}</p>
              </div>
            </div>
            {btnCerrar}
          </div>
          {mis.map(e => (
            <div key={e.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontWeight: 700, margin: 0 }}>{e.cliente}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0' }}>{e.direccion}</p>
                  <p style={{ fontSize: 12, margin: 0 }}>{e.productos}</p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, height: 'fit-content',
                  background: e.estado === 'Pendiente' ? 'rgba(245,158,11,0.15)' : e.estado === 'En Ruta' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                  color: e.estado === 'Pendiente' ? '#fbbf24' : e.estado === 'En Ruta' ? '#60a5fa' : '#34d399'
                }}>{e.estado}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEntregas(entregas.map(x => x.id === e.id ? { ...x, estado: 'En Ruta' } : x))}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>En Ruta</button>
                <button onClick={() => setEntregas(entregas.map(x => x.id === e.id ? { ...x, estado: 'Entregado' } : x))}
                  style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Entregado</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export type Vista =
  | 'login' | 'jefe_home'
  | 'vendedor_home' | 'vendedor_ticket' | 'vendedor_cerrar_caja'
  | 'bodega_home' | 'bodega_ajuste' | 'bodega_compra' | 'bodega_historial_compras'
  | 'chofer_home' | 'cajero_home';

export type JefeSeccion =
  | 'inicio' | 'ventas' | 'inventario' | 'compras' | 'cajas' | 'usuarios' | 'permisos' | 'proximamente';

export interface Permisos {
  bodegaCrearProductos: boolean;
  bodegaAjustarStock: boolean;
  bodegaRegistrarCompras: boolean;
  choferRegistrarCompras: boolean;
  cajaAbrirCerrar: boolean;
  cajaCobrarPreventas: boolean;
  cajaGestionarCreditos: boolean;
}

export const PERMISOS_DEFAULT: Permisos = {
  bodegaCrearProductos: true,
  bodegaAjustarStock: true,
  bodegaRegistrarCompras: true,
  choferRegistrarCompras: false,
  cajaAbrirCerrar: true,
  cajaCobrarPreventas: true,
  cajaGestionarCreditos: false,
};

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  stock: number;
  stockMinimo: number;
  precio: number;
  costo: number;
  imagen: string;
  categoria: string;
}

export interface CarritoItem extends Producto {
  cantidad: number;
}

export interface Venta {
  id: string;
  total: number;
  items: any[];
  fecha: any;
  estado: string;
  medioPago: string;
  vendedorId: string;
  vendedorNombre: string;
  recibido?: number;
  vuelto?: number;
  turnoId?: string;
}

export interface Turno {
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

export interface CompraItem {
  productoId: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface Compra {
  id: string;
  proveedor: string;
  fecha: any;
  items: CompraItem[];
  total: number;
  creadoPor: string;
}

export interface UsuarioSistema {
  id: string;
  email: string;
  nombre?: string;
  rol: string;
  activo?: boolean;
}

export interface Entrega {
  id: number;
  cliente: string;
  direccion: string;
  productos: string;
  estado: 'Pendiente' | 'En Ruta' | 'Entregado';
  choferId: string;
}

export interface OrdenItem {
  id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export interface Orden {
  id?: string;
  items: OrdenItem[];
  total: number;
  fecha: any;
  estado: 'pending' | 'completed';
  medioPago: string;
  vendedorId: string;
  vendedorNombre: string;
  turnoId: string | null;
  guaranteePhotoUrl?: string;
}

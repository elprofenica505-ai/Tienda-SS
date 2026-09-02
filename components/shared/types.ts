// ====================== TIPOS BASE ======================

export type Vista =
  | 'login' | 'jefe_home'
  | 'vendedor_home' | 'vendedor_ticket' | 'vendedor_cerrar_caja'
  | 'bodega_home' | 'bodega_ajuste' | 'bodega_compra' | 'bodega_historial_compras'
  | 'chofer_home' | 'cajero_home';

export type JefeSeccion =
  | 'inicio' | 'ventas' | 'inventario' | 'compras' | 'cajas' | 'usuarios' | 'permisos' | 'roles' | 'proximamente';

// ====================== PERMISOS (RBAC) ======================

export type Permission =
  // Inventario
  | 'inventario.ver' | 'inventario.crear' | 'inventario.editar' | 'inventario.eliminar' | 'inventario.ajustar'
  // Ventas / POS
  | 'ventas.ver' | 'ventas.crear' | 'ventas.anular' | 'ventas.ver_todas'
  // Caja
  | 'caja.abrir' | 'caja.cerrar' | 'caja.ver_cierres'
  // Compras
  | 'compras.ver' | 'compras.crear' | 'compras.aprobar'
  // Entregas
  | 'entregas.ver' | 'entregas.actualizar_estado' | 'entregas.asignar'
  // Créditos
  | 'creditos.ver' | 'creditos.crear' | 'creditos.cobrar' | 'creditos.editar'
  // Usuarios y Roles
  | 'usuarios.ver' | 'usuarios.crear' | 'usuarios.editar' | 'usuarios.eliminar'
  | 'roles.ver' | 'roles.crear' | 'roles.editar' | 'roles.eliminar'
  // Reportes y Config
  | 'reportes.ver' | 'configuracion.ver' | 'configuracion.editar'
  // Super
  | 'organizacion.administrar';

// ====================== MULTI-TENANT ======================

export interface Organizacion {
  id: string;
  nombre: string;
  slug: string;
  plan: 'gratis' | 'basico' | 'pro' | 'enterprise';
  activo: boolean;
  creadoEn: any;
  creadoPor: string;
}

export interface Rol {
  id: string;
  organizacionId: string;
  nombre: string;
  descripcion?: string;
  permisos: Permission[];
  esSistema: boolean; // true = no se puede eliminar (roles por defecto)
  creadoEn?: any;
}

export interface Membresia {
  rolId: string;
  permisosExtra?: Permission[];
  activo: boolean;
  unidoEn?: any;
}

// ====================== USUARIO (compatible con lo actual + multi-tenant) ======================

export type RolAntiguo = 'jefe' | 'vendedor' | 'bodega' | 'chofer' | 'cajero';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  // Sistema actual (lo mantenemos para que no se rompa nada)
  rol: RolAntiguo;
  // Nuevo sistema multi-tenant (lo usaremos después)
  orgActualId?: string;
  organizaciones?: Record<string, Membresia>;
}

// ====================== PERMISOS ANTIGUOS (compatibilidad) ======================

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

// ====================== ROLES POR DEFECTO (se crean al registrar una organización) ======================

export const ROLES_SISTEMA: Omit<Rol, 'id' | 'organizacionId'>[] = [
  {
    nombre: 'Jefe / Owner',
    descripcion: 'Acceso total a la organización',
    permisos: [
      'organizacion.administrar',
      'usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar',
      'roles.ver', 'roles.crear', 'roles.editar', 'roles.eliminar',
      'inventario.ver', 'inventario.crear', 'inventario.editar', 'inventario.eliminar', 'inventario.ajustar',
      'ventas.ver', 'ventas.crear', 'ventas.anular', 'ventas.ver_todas',
      'caja.abrir', 'caja.cerrar', 'caja.ver_cierres',
      'compras.ver', 'compras.crear', 'compras.aprobar',
      'entregas.ver', 'entregas.actualizar_estado', 'entregas.asignar',
      'creditos.ver', 'creditos.crear', 'creditos.cobrar', 'creditos.editar',
      'reportes.ver', 'configuracion.ver', 'configuracion.editar',
    ],
    esSistema: true,
  },
  {
    nombre: 'Vendedor',
    descripcion: 'Punto de venta y atención al cliente',
    permisos: ['ventas.ver', 'ventas.crear', 'caja.abrir', 'caja.cerrar', 'inventario.ver'],
    esSistema: true,
  },
  {
    nombre: 'Bodega',
    descripcion: 'Control de inventario y compras',
    permisos: ['inventario.ver', 'inventario.crear', 'inventario.editar', 'inventario.ajustar', 'compras.ver', 'compras.crear'],
    esSistema: true,
  },
  {
    nombre: 'Chofer',
    descripcion: 'Gestión de entregas',
    permisos: ['entregas.ver', 'entregas.actualizar_estado'],
    esSistema: true,
  },
  {
    nombre: 'Cajero',
    descripcion: 'Cobro de ventas y créditos',
    permisos: ['ventas.ver', 'caja.abrir', 'caja.cerrar', 'creditos.ver', 'creditos.cobrar'],
    esSistema: true,
  },
];

// ====================== RESTO DE TIPOS (igual que antes) ======================

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

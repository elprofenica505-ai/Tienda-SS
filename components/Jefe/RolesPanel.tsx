'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Rol, Permission } from '@/components/shared/types';

// Lista de todos los permisos disponibles (para que el Jefe los seleccione)
const TODOS_LOS_PERMISOS: { valor: Permission; etiqueta: string; grupo: string }[] = [
  // Inventario
  { valor: 'inventario.ver', etiqueta: 'Ver inventario', grupo: 'Inventario' },
  { valor: 'inventario.crear', etiqueta: 'Crear productos', grupo: 'Inventario' },
  { valor: 'inventario.editar', etiqueta: 'Editar productos', grupo: 'Inventario' },
  { valor: 'inventario.eliminar', etiqueta: 'Eliminar productos', grupo: 'Inventario' },
  { valor: 'inventario.ajustar', etiqueta: 'Ajustar stock', grupo: 'Inventario' },
  // Ventas
  { valor: 'ventas.ver', etiqueta: 'Ver ventas', grupo: 'Ventas' },
  { valor: 'ventas.crear', etiqueta: 'Crear ventas', grupo: 'Ventas' },
  { valor: 'ventas.anular', etiqueta: 'Anular ventas', grupo: 'Ventas' },
  { valor: 'ventas.ver_todas', etiqueta: 'Ver todas las ventas', grupo: 'Ventas' },
  // Caja
  { valor: 'caja.abrir', etiqueta: 'Abrir caja', grupo: 'Caja' },
  { valor: 'caja.cerrar', etiqueta: 'Cerrar caja', grupo: 'Caja' },
  { valor: 'caja.ver_cierres', etiqueta: 'Ver cierres de caja', grupo: 'Caja' },
  // Compras
  { valor: 'compras.ver', etiqueta: 'Ver compras', grupo: 'Compras' },
  { valor: 'compras.crear', etiqueta: 'Registrar compras', grupo: 'Compras' },
  { valor: 'compras.aprobar', etiqueta: 'Aprobar compras', grupo: 'Compras' },
  // Entregas
  { valor: 'entregas.ver', etiqueta: 'Ver entregas', grupo: 'Entregas' },
  { valor: 'entregas.actualizar_estado', etiqueta: 'Actualizar estado de entrega', grupo: 'Entregas' },
  { valor: 'entregas.asignar', etiqueta: 'Asignar entregas', grupo: 'Entregas' },
  // Créditos
  { valor: 'creditos.ver', etiqueta: 'Ver créditos', grupo: 'Créditos' },
  { valor: 'creditos.crear', etiqueta: 'Crear créditos', grupo: 'Créditos' },
  { valor: 'creditos.cobrar', etiqueta: 'Cobrar créditos', grupo: 'Créditos' },
  { valor: 'creditos.editar', etiqueta: 'Editar créditos', grupo: 'Créditos' },
  // Usuarios y Roles
  { valor: 'usuarios.ver', etiqueta: 'Ver usuarios', grupo: 'Usuarios' },
  { valor: 'usuarios.crear', etiqueta: 'Crear usuarios', grupo: 'Usuarios' },
  { valor: 'usuarios.editar', etiqueta: 'Editar usuarios', grupo: 'Usuarios' },
  { valor: 'usuarios.eliminar', etiqueta: 'Eliminar usuarios', grupo: 'Usuarios' },
  { valor: 'roles.ver', etiqueta: 'Ver roles', grupo: 'Roles' },
  { valor: 'roles.crear', etiqueta: 'Crear roles', grupo: 'Roles' },
  { valor: 'roles.editar', etiqueta: 'Editar roles', grupo: 'Roles' },
  { valor: 'roles.eliminar', etiqueta: 'Eliminar roles', grupo: 'Roles' },
  // Otros
  { valor: 'reportes.ver', etiqueta: 'Ver reportes', grupo: 'Reportes' },
  { valor: 'configuracion.ver', etiqueta: 'Ver configuración', grupo: 'Configuración' },
  { valor: 'configuracion.editar', etiqueta: 'Editar configuración', grupo: 'Configuración' },
  { valor: 'organizacion.administrar', etiqueta: 'Administrar organización', grupo: 'Super' },
];

interface Props {
  organizacionId?: string; // Por ahora opcional (después será obligatorio)
  onCerrar?: () => void;
}

export default function RolesPanel({ organizacionId }: Props) {
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);

  // Formulario de nuevo rol
  const [nombreRol, setNombreRol] = useState('');
  const [descripcionRol, setDescripcionRol] = useState('');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<Permission[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Cargar roles (por ahora usamos una colección temporal "roles_personalizados")
  const cargarRoles = async () => {
    setCargando(true);
    try {
      // Por ahora guardamos los roles personalizados en una colección simple
      // Más adelante los moveremos dentro de cada organización
      const snap = await getDocs(collection(db, 'roles_personalizados'));
      const lista: Rol[] = [];
      snap.forEach((d) => {
        lista.push({ id: d.id, ...d.data() } as Rol);
      });
      setRoles(lista);
    } catch (error) {
      console.error('Error cargando roles:', error);
      alert('Error al cargar los roles');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarRoles();
  }, []);

  const togglePermiso = (permiso: Permission) => {
    setPermisosSeleccionados((prev) =>
      prev.includes(permiso)
        ? prev.filter((p) => p !== permiso)
        : [...prev, permiso]
    );
  };

  const guardarNuevoRol = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nombreRol.trim()) {
      alert('Escribe el nombre del rol');
      return;
    }

    if (permisosSeleccionados.length === 0) {
      alert('Selecciona al menos un permiso');
      return;
    }

    setGuardando(true);
    try {
      await addDoc(collection(db, 'roles_personalizados'), {
        nombre: nombreRol.trim(),
        descripcion: descripcionRol.trim(),
        permisos: permisosSeleccionados,
        esSistema: false,
        organizacionId: organizacionId || 'temporal',
        creadoEn: serverTimestamp(),
      });

      alert('¡Rol creado correctamente!');
      setNombreRol('');
      setDescripcionRol('');
      setPermisosSeleccionados([]);
      setMostrandoFormulario(false);
      cargarRoles();
    } catch (error: any) {
      console.error(error);
      alert('Error al crear el rol: ' + (error.message || ''));
    } finally {
      setGuardando(false);
    }
  };

  const eliminarRol = async (rolId: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar el rol "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'roles_personalizados', rolId));
      alert('Rol eliminado');
      cargarRoles();
    } catch (error: any) {
      alert('Error al eliminar: ' + (error.message || ''));
    }
  };

  // Agrupar permisos por categoría
  const grupos = Array.from(new Set(TODOS_LOS_PERMISOS.map((p) => p.grupo)));

  return (
    <div style={{ padding: 16, color: '#f3f4f6', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Roles Personalizados</h2>
          <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>
            Crea roles como Mecánico, Limpieza, Secretario, etc.
          </p>
        </div>
        <button
          onClick={() => setMostrandoFormulario(!mostrandoFormulario)}
          style={{
            background: mostrandoFormulario ? '#374151' : '#4f46e5',
            color: '#fff',
            border: 'none',
            padding: '10px 16px',
            borderRadius: 10,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {mostrandoFormulario ? 'Cancelar' : '+ Nuevo Rol'}
        </button>
      </div>

      {/* Formulario para crear rol */}
      {mostrandoFormulario && (
        <form
          onSubmit={guardarNuevoRol}
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#d1d5db' }}>
              Nombre del rol *
            </label>
            <input
              type="text"
              value={nombreRol}
              onChange={(e) => setNombreRol(e.target.value)}
              placeholder="Ej: Mecánico, Limpieza, Secretario..."
              required
              style={{
                width: '100%',
                background: '#030712',
                border: '1px solid #374151',
                borderRadius: 10,
                padding: 12,
                color: '#fff',
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#d1d5db' }}>
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={descripcionRol}
              onChange={(e) => setDescripcionRol(e.target.value)}
              placeholder="¿Qué hace este rol?"
              style={{
                width: '100%',
                background: '#030712',
                border: '1px solid #374151',
                borderRadius: 10,
                padding: 12,
                color: '#fff',
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 13, color: '#d1d5db' }}>
              Permisos que tendrá este rol *
            </label>

            {grupos.map((grupo) => (
              <div key={grupo} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', marginBottom: 8 }}>
                  {grupo}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TODOS_LOS_PERMISOS.filter((p) => p.grupo === grupo).map((permiso) => (
                    <label
                      key={permiso.valor}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: permisosSeleccionados.includes(permiso.valor)
                          ? 'rgba(79, 70, 229, 0.25)'
                          : '#1f2937',
                        border: permisosSeleccionados.includes(permiso.valor)
                          ? '1px solid #4f46e5'
                          : '1px solid #374151',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={permisosSeleccionados.includes(permiso.valor)}
                        onChange={() => togglePermiso(permiso.valor)}
                      />
                      {permiso.etiqueta}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={guardando}
            style={{
              width: '100%',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              padding: 14,
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            {guardando ? 'Guardando...' : 'Crear Rol'}
          </button>
        </form>
      )}

      {/* Lista de roles creados */}
      {cargando ? (
        <p style={{ textAlign: 'center', color: '#9ca3af' }}>Cargando roles...</p>
      ) : roles.length === 0 ? (
        <div
          style={{
            background: '#111827',
            border: '1px dashed #374151',
            borderRadius: 16,
            padding: 40,
            textAlign: 'center',
            color: '#9ca3af',
          }}
        >
          <p style={{ fontSize: 15, margin: 0 }}>Aún no has creado roles personalizados</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Haz clic en “+ Nuevo Rol” para crear el primero
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {roles.map((rol) => (
            <div
              key={rol.id}
              style={{
                background: '#111827',
                border: '1px solid #1f2937',
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{rol.nombre}</h3>
                  {rol.descripcion && (
                    <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>
                      {rol.descripcion}
                    </p>
                  )}
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
                    {rol.permisos?.length || 0} permisos asignados
                  </p>
                </div>
                <button
                  onClick={() => eliminarRol(rol.id, rol.nombre)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

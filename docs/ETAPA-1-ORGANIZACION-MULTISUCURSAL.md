# Etapa 1 — Organización multi-sucursal

**Rama:** `SaaS-MultiTenant-Profesional`  
**Estado:** núcleo implementado; stock separado por almacén y cajas por turno quedan para las etapas 2 y 4.

## Capacidades implementadas

- Cada tenant nuevo recibe una sucursal principal, un almacén principal y una caja principal.
- La API `/api/organization` permite consultar la organización visible y crear o editar sucursales, almacenes y cajas.
- La creación de sucursales respeta el límite de sucursales del plan Starter, Growth o Scale.
- Los miembros conservan `branchIds` para representar su alcance operativo.
- Los tenants legacy reciben `branch-main` de forma compatible cuando se consulta su organización.
- Existe el script seguro `npm run migrate:organization` para revisar o aplicar la migración masiva.
- El contexto frontend conserva una sucursal activa por tenant en `localStorage`.
- El POS envía `x-branch-id` y persiste `branchId` en las ventas.
- Las consultas de ventas de usuarios operativos pueden filtrarse por sucursal.
- La API permite asignar sucursales a miembros mediante `PUT /api/organization`.
- La navegación incluye la pantalla de sucursales y cajas.
- Firestore contiene reglas básicas para las nuevas colecciones.

## Migración

Primero ejecutar un dry-run:

```bash
npm run migrate:organization -- --tenant-id=TENANT_ID
```

Para aplicar los cambios se requiere una confirmación explícita:

```bash
npm run migrate:organization -- --apply --confirm=MIGRATE_ORGANIZATION
```

La migración crea únicamente documentos ausentes y asigna `branch-main` a miembros que no tienen `branchIds`. No reemplaza asignaciones existentes.

## Límites conocidos

La Etapa 1 no afirma todavía que el inventario esté físicamente separado por almacén. El modelo actual conserva stock legacy por producto. La separación de existencias, transferencias y costo por almacén pertenece a la Etapa 4.

La Etapa 1 tampoco implementa apertura, arqueo o cierre de turnos. La entidad de caja queda creada para que la Etapa 2 pueda añadir sesiones de caja sin cambiar la organización base.

Las rutas que aún no envían `x-branch-id` continuarán operando con el modelo legacy hasta que cada módulo se migre. No se debe declarar aislamiento completo por sucursal hasta cerrar las pruebas cross-branch de la Etapa 9.

## Criterios verificables

- El owner puede crear una sucursal respetando el límite del plan.
- Un almacén y una caja requieren una sucursal activa válida.
- Un usuario operativo puede ser asignado a una o más sucursales.
- El POS registra la sucursal activa en la venta.
- Un usuario operativo no puede crear una venta para una sucursal no asignada.
- La organización se puede consultar sin crear duplicados en tenants legacy.

## Resumen

Implementa Bloque 5 y Bloque 6 para reducir lecturas costosas de Firestore en el flujo SaaS multi-tenant.

## Cambios

- `app/api/catalog/route.ts`: máximo 25 productos por solicitud, cursor `nextCursor`, máximo 100 categorías, enforcement de productos por plan y conteo con `count()`.
- `app/api/invitations/route.ts`: conteo agregado de miembros activos e invitaciones pendientes y rechazo cuando el plan no tiene capacidad.
- `app/api/invitations/accept/route.ts`: revalidación transaccional del límite de miembros antes de activar el usuario.
- `app/api/receivables/route.ts`: ventana fija de 25 ventas y pagos e indicador `pagination.hasMoreSales`.
- `docs/BLOQUE-5-6-CIERRE.md`: archivos tocados, listeners y prueba T13 en cinco pasos.

## Verificación

- `npm run typecheck` ✅
- `npm run test` ✅
- `npm run lint` ✅ (solo warning preexistente en `components/ProductosAdmin.tsx`)
- Se conserva el rate limit de `requireTenantMember`.
- No se modificó el proveedor de login ni el flujo de tenant vacío.

## Prueba T13

Consultar `docs/BLOQUE-5-6-CIERRE.md`, sección “T13 — Prueba de costo en Firebase Console”.

# Cierre Bloque 5 y Bloque 6

## T11 — Entitlements

Los planes se centralizan en `lib/entitlements.ts`. La API de catálogo rechaza la creación y reactivación de productos cuando el tenant alcanza el límite de productos activos. La API de invitaciones contabiliza miembros activos e invitaciones pendientes mediante `count()` y rechaza nuevas invitaciones al superar el límite del plan. La aceptación de una invitación vuelve a verificar el cupo dentro de una transacción antes de crear el miembro activo, por lo que el alta de usuario también queda protegida.

El rate limit de `requireTenantMember` permanece activo y no fue deshabilitado.

## T12 — Listados pesados

Los flujos del workspace usan rutas API con Admin SDK y `x-tenant-id`; el navegador no consulta libremente las colecciones multi-tenant. `/api/catalog` devuelve como máximo 25 productos y 100 categorías por solicitud, con cursor y `nextCursor`. `/api/inventory` ya limita sus páginas a 25. `/api/sales` limita el historial a 50 y `/api/receivables` limita ventas y pagos a una ventana fija de 25 registros, informando si hay más ventas.

La pantalla `/workspace/catalog` consume el cursor y ofrece “Cargar más productos”; cada interacción solicita otra página acotada, sin volver a descargar el catálogo completo.

## Listeners y lecturas eliminados o justificados

No se agregaron listeners `onSnapshot`. La carga de productos del rol bodega es diferida: el home no solicita productos hasta abrir “Productos y stock”; al desmontar o cambiar de pantalla no queda un listener activo. En el workspace activo las consultas se realizan con `fetch` a endpoints paginados y no con queries libres del navegador. El componente legacy conserva compatibilidad histórica, pero no es la entrada del flujo SaaS multi-tenant.

## T13 — Prueba de costo en Firebase Console

1. Inicia sesión con un tenant de prueba y entra como bodega; abre Network y la pestaña de métricas de Firestore.
2. Permanece en el home sin pulsar “Productos y stock”; verifica que no aparezca una lectura de la colección de productos por la pantalla inicial.
3. Pulsa “Productos y stock” una sola vez; verifica que la lectura del listado sea de como máximo 25 documentos de productos, más la lectura acotada de categorías si corresponde.
4. Cambia de pantalla o cierra sesión; verifica en Network que no queden requests repetitivos y que no haya listeners Firestore activos.
5. Repite la prueba en `/workspace/catalog` y confirma que cada request incluya `x-tenant-id`, pase por `/api/catalog` y respete `pagination.pageSize <= 25`.

Para ejecutar esta verificación con instrucciones detalladas, criterios de aprobación, interpretación de métricas y hoja de registro, consulta `docs/MANUAL-T13-FIREBASE-CONSOLE.md`.

## T14 — Archivos tocados

- `app/api/catalog/route.ts`
- `app/api/invitations/route.ts`
- `app/api/invitations/accept/route.ts`
- `app/api/receivables/route.ts`
- `app/workspace/catalog/page.tsx`
- `docs/BLOQUE-5-6-CIERRE.md`

El cambio no altera el proveedor de sesión, la selección de tenant, el login multi-tenant ni el flujo de alta de un tenant vacío.

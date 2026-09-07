# Resultados de la matriz de autorización API

**Tarea:** P0.2 — Crear matriz de pruebas de autorización API  
**Rama:** `SaaS-MultiTenant-Profesional`  
**Estado:** Completada  
**Fecha:** 6 de septiembre de 2026

## Cobertura

La suite `tests/api-authorization-matrix.test.ts` recorre las 19 rutas API identificadas en la rama y valida la barrera global del middleware, el mapa central de políticas y las excepciones documentadas.

| Grupo | Rutas/casos | Resultado |
|---|---:|---|
| Rutas protegidas con tenant | 13 rutas | Sin Authorization → 401; sin `x-tenant-id` → 400 |
| Rutas de superadministración | 3 rutas | Sin token → 401; con token → middleware 200 sin tenant previo |
| Descubrimiento de tenant | 1 ruta | Permite Bearer sin `x-tenant-id` |
| Rutas públicas | 3 excepciones | Health, alta inicial y webhook solo en sus métodos públicos |
| Ruta no registrada | 1 caso | Con token y tenant → 403 |
| Acciones por método | GET/POST/PATCH/DELETE | Mapean a view/create/edit/delete |
| Compatibilidad legacy | `/api/usuarios` | Comparte handlers con `/api/members` |

## Resultados ejecutados

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto |
| `npm run test` | Correcto; 39 casos de la matriz nueva pasan, además de las suites existentes |
| `npm run test:all` | Correcto; 15 casos adicionales de reglas Firestore pasan |
| `NODE_ENV=production npm run build` | Correcto; 41 páginas estáticas generadas |

La salida agregada de `npm run test:all` terminó con **0 fallos**. El conjunto de autorización cubre autenticación ausente, tenant ausente, superadmin, descubrimiento, rutas públicas, rutas no registradas y resolución de permisos por método.

## Archivos incorporados o modificados

- `tests/api-authorization-matrix.test.ts`: suite data-driven de autorización global.
- `package.json`: inclusión de la matriz en `npm test`.
- `todo.md`: tarea 2 y sus escenarios marcados como completados.
- `docs/AUTHORIZATION-MATRIX-RESULTS.md`: este reporte.

## Alcance pendiente explícito

Esta matriz valida el perímetro global y la política de entrada. La validación profunda de cada handler —payload malformado, membresía inactiva dentro de cada endpoint, documento inexistente, error de Firebase y prevención de escrituras parciales— requiere pruebas de integración con Firebase Emulator y corresponde a una ampliación posterior del backlog de calidad. La matriz no se presenta como sustituto de E2E.

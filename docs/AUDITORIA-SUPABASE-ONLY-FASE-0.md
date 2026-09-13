# Auditoría de Fase 0: migración Supabase-only

## Referencias

| Campo | Valor |
|---|---|
| Proyecto | Tienda-SS / ConexiaX |
| Vercel | `tienda-ss-ozkq` |
| Repositorio | `elprofenica505-ai/Tienda-SS` |
| Rama de migración | `migration/supabase-only` |
| Rama de respaldo | `migration/supabase-foundation` |
| Commit de partida | `fb09056` |
| Objetivo | Supabase Auth + PostgreSQL + Storage + RLS, sin Firebase |

## Resultado de la auditoría

La auditoría confirma que la rama de partida todavía no es Supabase-only. Es una etapa de compatibilidad: algunos endpoints de organización usan Supabase, pero la autenticación, los módulos operativos y varias funciones transversales todavía dependen de Firebase.

El inventario reproducible se ejecuta con:

```bash
node scripts/audit-firebase-dependencies.mjs
```

El script no accede a credenciales ni a servicios externos. Solo analiza los archivos versionados en la rama actual.

| Área | Archivos con referencias | Coincidencias aproximadas |
|---|---:|---:|
| Firebase Auth | 36 | 77 |
| Importaciones Firebase/Firebase Admin | 28 | 32 |
| Firebase Admin/Firestore | 51 | 141 |
| APIs Firestore | 36 | 158 |
| Firebase Storage | 1 | 10 |

## Colecciones Firestore identificadas

Las colecciones observadas en el código son:

```text
apiKeys
 auditLogs
 billingEvents
 branches
 cashMovements
 cashRegisters
 cashSessions
 categories
 creditMovements
 creditNotes
 customers
 days
 deliveries
 entitlementUsage
 expenses
 idempotencyKeys
 integrationEvents
 inventoryCounts
 inventoryMovements
 inventoryStocks
 inventoryTransfers
 members
 notifications
 platformAudit
 presales
 products
 purchases
 receivablePayments
 sales
 salesReturns
 settings
 stats
 stockReservations
 system
 systemRateLimits
 tenantInvitations
 tenants
 usuarios
 warehouses
```

Estas colecciones no deben copiarse como datos de prueba. Se usan como mapa de comportamiento para diseñar tablas, relaciones, índices, funciones SQL, RLS y pruebas equivalentes.

## Módulos que deben conservarse

El repositorio contiene rutas y pantallas para organización, miembros, catálogo, inventario, ventas, preventas, compras, caja, finanzas, crédito, reportes, fiscalidad, billing, notificaciones, entregas, auditoría, API pública y administración. La migración debe reemplazar la persistencia sin retirar botones ni reducir el comportamiento de esos módulos.

## Brechas principales

| Brecha | Situación actual | Trabajo requerido |
|---|---|---|
| Auth | Firebase Auth | Sustituir por Supabase Auth y sesiones Supabase |
| Perfil y tenancy | Adaptación parcial por UID Firebase | Crear onboarding limpio con `auth.users.id` |
| Organización | Repositorios Supabase parciales | Completar y eliminar guardias Firebase |
| Catálogo | Firestore | Tablas de productos, categorías, precios e importaciones |
| Inventario | Firestore y transacciones | Stock, movimientos, reservas y transferencias atómicas |
| Ventas | Firestore y transacciones | Ventas, pagos, devoluciones y anulaciones en PostgreSQL |
| Compras | Firestore | Compras, recepción y costos |
| Caja | Firestore | Sesiones, movimientos y cierres atómicos |
| Crédito | Firestore | Clientes, saldos, pagos y notas de crédito |
| Fiscal | Configuración Firestore | Configuración, secuencias y documentos fiscales en PostgreSQL |
| Archivos | Firebase Storage | Buckets privados y metadatos en Supabase |
| Autorización | Firebase Auth + reglas Firestore | RLS + guardias backend + políticas de rol |
| Pruebas | Varias pruebas Firebase/emulador | Pruebas SQL/RLS y pruebas de integración Supabase |

## Decisiones de continuidad

1. La rama `migration/supabase-foundation` se conserva como respaldo.
2. La rama `migration/supabase-only` es la rama activa de migración.
3. Las variables de Vercel pertenecen al proyecto y al entorno, no a la rama Git; cambiar de rama no obliga a reingresarlas.
4. No se migran empresas, ventas, inventario, créditos ni archivos de prueba de Firebase.
5. No se eliminan dependencias Firebase hasta que exista un reemplazo probado para cada módulo.
6. No se toca Production durante la implementación.
7. Cada fase debe producir un commit verificable y un Preview.

## Próxima fase

La siguiente fase debe diseñar y aplicar el esquema PostgreSQL completo del ERP antes de retirar Firebase Auth. El esquema debe cubrir identidad, organización, catálogo, inventario, ventas, preventas, compras, caja, crédito, fiscalidad, auditoría, notificaciones, integraciones y archivos. Cada tabla de negocio debe tener `tenant_id`, claves foráneas, índices y políticas RLS.

Después se migrará Supabase Auth y el onboarding limpio. El usuario nuevo deberá poder registrarse, crear su empresa y recibir sucursal, almacén y caja principales sin que exista ningún dato previo en Firebase.

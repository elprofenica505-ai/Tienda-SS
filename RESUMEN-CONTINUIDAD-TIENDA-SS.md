# Resumen maestro de continuidad — Tienda-SS / Supabase-only

**Fecha de corte:** 2026-09-13 03:37 (-06:00)  
**Autor:** Manus AI

## 1. Objetivo definitivo

El objetivo es convertir `Tienda-SS` en un SaaS ERP multi-tenant que utilice exclusivamente Supabase como plataforma de datos y autenticación. El resultado final debe utilizar **Supabase Auth, Supabase PostgreSQL, Supabase RLS y Supabase Storage**. Firebase Auth, Firestore, Firebase Storage y Firebase Admin deben desaparecer del flujo operativo final. No se migran datos de prueba antiguos de Firebase; se conserva la lógica funcional del ERP y se comienza con datos limpios en Supabase.

## 2. Referencias principales

| Referencia | Valor |
|---|---|
| Proyecto Vercel | `tienda-ss-ozkq` |
| Proyecto Vercel ID | `prj_XGrDLY4t9QaxohXZP1FoKtgii1iT` |
| Equipo Vercel ID | `team_QZTtBeRtGCQyt1tlYPysuulk` |
| Repositorio | `elprofenica505-ai/Tienda-SS` |
| URL Git | `https://github.com/elprofenica505-ai/Tienda-SS` |
| Rama de trabajo | `migration/supabase-only` |
| Rama base original | `SaaS-MultiTenant-Profesional` |
| Rama de respaldo anterior | `migration/supabase-foundation` |
| Proyecto Supabase | `conexiax-dev` |
| Supabase project ref | `mlymquyvrgnrsqhicbdo` |
| Región Supabase | `us-west-1` |
| Estado Supabase | `ACTIVE_HEALTHY` |
| Firebase | Se conserva solamente hasta terminar la migración de todos los módulos; no debe usarse en el resultado final |
| Production Vercel | No se ha modificado intencionalmente |

## 3. Último estado Git confirmado

La rama local y remota están sincronizadas:

```text
migration/supabase-only...origin/migration/supabase-only
```

Último commit:

```text
c78f95a fix: lock down RLS helper RPC functions
```

Commits relevantes, del más reciente al más antiguo:

| Commit | Descripción |
|---|---|
| `c78f95a` | Cierra el acceso RPC público de funciones auxiliares RLS |
| `b45d281` | Hace repetibles las migraciones RLS y Storage |
| `e05397e` | Migra el endpoint de inventario a Supabase y añade `adjust_inventory` |
| `9c592b7` | Añade la guía móvil para ejecutar tareas Supabase con Gemini |
| `013dbd5` | Migra el endpoint de catálogo a Supabase |
| `6aab807` | Cambia la guardia central de autorización a Supabase |
| `969e50b` | Añade Storage foundation y recuperación de contraseña |
| `c797ba2` | Cambia onboarding y sesión del workspace a Supabase Auth |
| `ce48ac3` | Añade fundación ERP y adaptador de autenticación Supabase |
| `466dd44` | Añade auditoría inicial Supabase-only |

Los únicos archivos sin seguimiento en el checkout local son dos informes históricos creados antes de esta fase; no son cambios de código pendientes:

```text
ANALISIS-MIGRACION-100-SUPABASE.md
INFORME-MIGRACION-SUPABASE.md
```

## 4. Archivos SQL del repositorio

| Archivo | Propósito | Estado |
|---|---|---|
| `supabase/migrations/0001_foundation.sql` | Tenants, perfiles, miembros, sucursales, almacenes y cajas | Existente y aplicado previamente por el usuario |
| `supabase/migrations/0002_erp_foundation.sql` | Modelo ERP, RLS, onboarding, configuración, función de inventario | Aplicado mediante reconciliación directa; el archivo actual es repetible |
| `supabase/migrations/0003_storage_foundation.sql` | Bucket privado `tenant-files` y políticas Storage | Aplicado/reconciliado directamente |
| `supabase/migrations/0004_security_lockdown.sql` | Revoca RPC público de funciones auxiliares RLS | Aplicado directamente y registrado en Git |

El proyecto registra formalmente en Supabase la migración técnica:

```text
20260913093512 — reconcile_erp_rls_storage_inventory
```

Las migraciones iniciales no aparecen en la lista de migraciones de Supabase porque algunas fueron ejecutadas manualmente antes de utilizar el conector. Esto no significa que falten las tablas. La estructura fue comprobada directamente en el catálogo PostgreSQL.

## 5. Verificación directa de Supabase

Se comprobó directamente mediante el conector autorizado:

- Existen las tablas de organización: `tenants`, `profiles`, `members`, `member_branches`, `branches`, `warehouses` y `cash_registers`.
- Existen las tablas ERP de catálogo, inventario, ventas, compras, caja, crédito, fiscalidad, auditoría y archivos.
- Hay **24 tablas públicas con RLS activo**.
- Existen políticas RLS para miembros y administradores por tenant.
- Existen políticas Storage para lectura, inserción, actualización y eliminación administrativa.
- Existe la función `create_initial_tenant`.
- Existe la función `adjust_inventory`.
- Existe el bucket `tenant-files`.
- El bucket `tenant-files` es privado: `public = false`.
- El asesor de seguridad de Supabase terminó sin advertencias después del bloqueo RPC:

```text
lints: []
```

## 6. Implementación de aplicación completada

### Autenticación y sesión

El frontend tiene un adaptador Supabase Auth para registro, login, recuperación de contraseña, cierre de sesión y sesión persistente. El backend valida el token Supabase y localiza la membresía por `auth.users.id`. Firebase Auth no debe volver a introducirse en los nuevos módulos.

### Onboarding

El endpoint `/api/tenants` crea el usuario y ejecuta la función `create_initial_tenant`. El flujo crea una empresa nueva, perfil, miembro owner, sucursal principal, almacén principal y caja principal.

### Organización

Los endpoints de organización utilizan repositorios Supabase para tenants, miembros, sucursales, almacenes y cajas. Las respuestas conservan compatibilidad de nombres para que la interfaz existente pueda continuar funcionando durante la transición.

### Catálogo

El endpoint `/api/catalog` ya utiliza Supabase PostgreSQL. Incluye categorías, productos, SKU, precios, costos, stock inicial, paginación, archivado y límites por plan.

### Inventario

El endpoint `/api/inventory` ya utiliza Supabase. La función `adjust_inventory` actualiza el stock y registra el movimiento dentro de una operación transaccional. La función bloquea cantidades inválidas, productos inexistentes, almacenes inexistentes e inventario negativo.

### Storage y recuperación

Existe la ruta `/reset-password` para completar la recuperación de contraseña con Supabase Auth. El bucket privado `tenant-files` está protegido por políticas de tenant.

## 7. Validaciones realizadas

La validación local más reciente fue correcta:

```text
npm run typecheck ✅
```

También pasaron las validaciones específicas de catálogo, inventario y guardia de tenant con ESLint. El proyecto tenía dos advertencias previas por uso de `<img>` en pantallas de caja y fiscalidad; no fueron errores de compilación.

## 8. Vercel y Preview

El proyecto correcto es `tienda-ss-ozkq`. El Preview de la rama `migration/supabase-only` se genera automáticamente desde GitHub.

Último deployment registrado:

```text
Commit: c78f95a
Deployment: dpl_5KTxsAt8MWua34LALJTcfEnK5eTY
URL: https://tienda-ss-ozkq-k167qnrat-el-profe-nica-505.vercel.app
Estado en la última consulta: QUEUED
```

El Preview anterior de `b45d281` estaba en estado `READY`:

```text
https://tienda-ss-ozkq-i8xawd0dt-el-profe-nica-505.vercel.app
```

No se ha promovido la rama a Production.

## 9. Variables de entorno esperadas

En Vercel, el proyecto correcto debe conservar estas variables para Preview y, cuando corresponda, Production:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

La `SUPABASE_SERVICE_ROLE_KEY` solo debe existir en el servidor. No debe exponerse al navegador, a Gemini, a GitHub ni al chat.

No eliminar todavía las variables Firebase porque algunos módulos aún dependen del código antiguo. La limpieza final ocurrirá después de migrar todos los endpoints.

## 10. Próximas fases

El trabajo pendiente es migrar los módulos en este orden:

| Fase | Módulo | Estado |
|---|---|---|
| 1 | Auth, tenants y organización | Parcialmente completado |
| 2 | Catálogo | Migrado |
| 3 | Inventario | Migrado |
| 4 | Compras y recepción | Pendiente |
| 5 | Caja y sesiones | Pendiente |
| 6 | Ventas y pagos | Pendiente |
| 7 | Crédito y cuentas por cobrar | Pendiente |
| 8 | Facturación electrónica y configuración fiscal | Pendiente |
| 9 | Storage y archivos usados por módulos | Fundación lista; integración pendiente |
| 10 | Reportes, auditoría y notificaciones | Pendiente |
| 11 | Eliminación de Firebase y Firestore | Última fase, no iniciar todavía |

Cada módulo debe conservar sus validaciones de negocio, aislamiento por tenant, permisos por rol, control de sucursal, idempotencia y transacciones PostgreSQL.

## 11. Reglas para continuar desde otra cuenta de Manus

La nueva cuenta debe continuar desde:

```text
Repositorio: elprofenica505-ai/Tienda-SS
Rama: migration/supabase-only
Último commit: c78f95a
Proyecto Vercel: tienda-ss-ozkq
Supabase project ref: mlymquyvrgnrsqhicbdo
```

Antes de modificar código, debe revisar el estado de la rama y leer este archivo. Debe trabajar únicamente en `migration/supabase-only`, no tocar `SaaS-MultiTenant-Profesional` y no desplegar a Production. Debe usar el conector Supabase ya habilitado para verificar el proyecto `conexiax-dev` y aplicar DDL mediante migraciones, no mediante datos de prueba.

La cuenta nueva debe evitar migrar datos antiguos de Firebase. Debe continuar migrando la logística del ERP, no reconstruir el negocio con empresas de prueba existentes.

## 12. Prompt para pegar en otra cuenta de Manus

> Continúa el proyecto `Tienda-SS` desde el archivo `RESUMEN-CONTINUIDAD-TIENDA-SS.md`. Repositorio: `elprofenica505-ai/Tienda-SS`. Rama autorizada: `migration/supabase-only`. Último commit: `c78f95a`. Proyecto Vercel: `tienda-ss-ozkq`. Proyecto Supabase: `conexiax-dev`, ref `mlymquyvrgnrsqhicbdo`. El objetivo final es Supabase-only: Supabase Auth, PostgreSQL, RLS y Storage; no Firebase en el resultado final. Ya están migrados onboarding, sesión, organización, catálogo e inventario. Las tablas tienen RLS, el bucket `tenant-files` es privado y los asesores de seguridad están limpios. Continúa con compras, caja, ventas, crédito y facturación electrónica. No toques Production, no borres datos y no elimines Firebase hasta el final. Verifica primero el estado del repositorio, el Preview y el proyecto Supabase.

## 13. Documentos relacionados

- [Auditoría de Fase 0](docs/AUDITORIA-SUPABASE-ONLY-FASE-0.md)
- [Análisis maestro de migración](ANALISIS-MIGRACION-100-SUPABASE.md)
- [Informe técnico inicial](INFORME-MIGRACION-SUPABASE.md)
- [Guía móvil para ejecutar tareas Supabase](GUIA-MOVIL-TAREAS-SUPABASE-GEMINI.md)

## References

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"
[2]: https://supabase.com/docs/guides/auth "Supabase Auth documentation"
[3]: https://supabase.com/docs/guides/storage "Supabase Storage documentation"

# Continuidad de migración Supabase-only — Tienda-SS

## 1. Identidad exacta del trabajo

| Elemento | Valor |
|---|---|
| Repositorio | `elprofenica505-ai/Tienda-SS` |
| URL del repositorio | `https://github.com/elprofenica505-ai/Tienda-SS` |
| Rama autorizada | `migration/supabase-only` |
| Proyecto Vercel | `tienda-ss-ozkq` |
| Equipo Vercel | `el-profe-nica-505` |
| Proyecto Supabase | `conexiax-dev` |
| Supabase project ref | `mlymquyvrgnrsqhicbdo` |
| Último commit al preparar este documento | `e5673cf` — `refactor: migrate billing superadmin and v1 to supabase` |
| Production | **No tocar.** Todo cambio debe quedarse en la Preview de `migration/supabase-only`. |

El objetivo es completar el corte **Supabase-only**: Supabase Auth, PostgreSQL, RLS, Storage y RPCs transaccionales. No se deben migrar datos de prueba de Firestore ni borrar datos remotos durante esta fase.

> **Importante:** el archivo histórico `RESUMEN-CONTINUIDAD-TIENDA-SS.md` contiene referencias y commits anteriores. Antes de trabajar, usar el estado Git real y este documento como fuente de continuidad actualizada. El commit actual es `e5673cf`, no el commit antiguo que aparezca en el resumen histórico.

## 2. Qué se está haciendo

Tienda-SS es un ERP multi-tenant con Workspace, marca, logo, PWA y módulos de inventario, ventas, caja, crédito, compras, entregas, catálogo, facturación e integraciones públicas. La migración reemplaza progresivamente Firebase/Firestore/Firebase Auth por:

- **Supabase Auth** para sesiones y administración de usuarios.
- **PostgreSQL/Supabase** para tenants, members, productos, inventario, ventas, caja, crédito, entregas, notificaciones, API keys y eventos.
- **RLS y validación tenant-scoped** para aislamiento multi-tenant.
- **RPCs PostgreSQL** para reservas, ventas, notas de crédito, importaciones y operaciones transaccionales.
- **Supabase Storage** para archivos privados cuando corresponda.

La prioridad funcional es que el usuario pueda entrar al Workspace y operar stock, venta y caja sin que las rutas operativas dependan de Firebase.

## 3. Trabajo ya completado

### Bloques funcionales migrados

- Onboarding, sesión, organización y members a Supabase Auth/PostgreSQL.
- Contacts, permissions y audit a Supabase.
- Reservas de inventario mediante tabla/RPC Supabase.
- Invitaciones y aceptación mediante Supabase Auth, tabla de invitaciones y RPC.
- Crédito, notas de crédito y returns mediante Supabase/RPC.
- Entregas mediante Supabase.
- Catálogo import/export mediante Supabase y RPCs de límites.
- Notifications mediante `public.notifications`.
- Stats daily calculadas desde `public.sales`.
- Health readiness comprobando Supabase.
- Billing y Stripe webhook mediante campos de `tenants` y `public.billing_events`.
- Superadmin metrics, audit y tenants mediante Supabase.
- API pública v1: keys, catalog, sales y preview webhooks mediante Supabase.

### Migraciones Supabase relevantes

- `0011_inventory_reservations.sql`
- `0012_tenant_invitations.sql`
- `0013_credit_notes.sql`
- `0014_deliveries.sql`
- `0015_catalog_import.sql`
- `0016_notifications.sql`
- `0017_platform_billing_api.sql`

### Commits principales recientes

| Commit | Bloque |
|---|---|
| `b326334` | Contacts, permissions y audit |
| `89078ca` | Reservas de inventario |
| `5639f2e` | Invitaciones y members |
| `627210f` | Credit notes |
| `4ec5d75` | Deliveries |
| `1195f32` | Catalog import/export |
| `d671836` | Notifications, stats/daily y health |
| `e5673cf` | Billing, superadmin y v1 |

### Validaciones ya ejecutadas

- `npm run typecheck` en verde.
- Matriz global de autorización en verde.
- Tests de integridad de negocio en verde.
- Tests de entitlements en verde.
- Auditoría sin referencias Firebase en los paths migrados:
  - `app/api/billing`
  - `app/api/superadmin`
  - `app/api/v1`
  - `app/api/notifications`
  - `app/api/stats/daily`
  - `app/api/health`
  - `lib/public-api.ts`
  - `lib/superadmin.ts`

## 4. Lo que falta por hacer — orden obligatorio

### Fase A — Confirmar Preview del último commit

1. Revisar el deployment del commit `e5673cf` en Vercel.
2. No promover a Production.
3. Si el build falla, corregir únicamente en `migration/supabase-only`.
4. Confirmar Preview `READY` y guardar la URL exacta.
5. Probar billing, superadmin y v1 con una sesión/API key de prueba.

### Fase B — Auditoría global de Firebase operativo

Ejecutar desde la raíz:

```bash
rg -n -i --glob '!node_modules/**' --glob '!.next/**' \
  'firebase|getAdminDb|getAdminAuth|firebaseAdmin|Firestore|firestore' \
  app components lib scripts tests
```

Clasificar cada coincidencia como:

1. **Path operativo del Workspace:** debe migrarse o eliminarse antes de quitar dependencias.
2. **Pantalla legacy no alcanzable:** redirigir o eliminar después de comprobar que no está importada.
3. **Script/test/herramienta histórica:** actualizar a Supabase o retirar del pipeline si ya no forma parte del producto.
4. **Texto/documentación:** actualizar para que no sugiera que Firebase sigue siendo la fuente de verdad.

No considerar terminado el corte por una auditoría limitada solamente a `app/api`.

### Fase C — Migrar autenticación cliente restante

Archivos que se deben revisar especialmente:

- `lib/auth.ts`
- `lib/firebase.ts`
- `lib/firebaseAdmin.ts`
- `lib/auth-policy.ts`
- `app/superadmin/page.tsx`
- `app/superadmin/testing/page.tsx`
- cualquier Provider o componente que use `onAuthStateChanged`, `getIdToken`, `signInWithEmailAndPassword` o `firebase/auth`.

Acciones:

1. Usar el cliente Supabase browser de `lib/supabase/client.ts`.
2. Reemplazar login, logout, refresh de sesión y verificación por Supabase Auth.
3. Mantener roles, multi-tenant, MFA/políticas y expiración de sesión.
4. Mantener marca, logo, PWA y navegación Workspace.
5. Verificar que ningún componente cliente envíe tokens Firebase a una ruta Supabase.

### Fase D — Retirar o redirigir LegacyApp y componentes Firebase

Componentes identificados para revisión:

- `components/legacy/LegacyApp.tsx`
- `components/Bodega/BodegaHome.tsx`
- `components/Bodega/BodegaCompra.tsx`
- `components/Bodega/BodegaHistorial.tsx`
- `components/Cajero/CajeroHome.tsx`
- `components/Jefe/JefePanel.tsx`
- `components/Vendedor/VendedorHome.tsx`
- `components/Vendedor/AbrirCaja.tsx`
- `components/Vendedor/CerrarCaja.tsx`
- `components/Vendedor/Ticket.tsx`
- `components/ProductosAdmin.tsx`

Procedimiento seguro:

1. Buscar todos los imports y rutas que los consumen.
2. Confirmar que el Workspace usa los módulos nuevos Supabase.
3. Si existe una pantalla equivalente nueva, redirigir la ruta antigua a la nueva.
4. Si no es alcanzable, eliminar el componente en un commit separado y claro.
5. No eliminar módulos que todavía sean parte del menú Workspace.
6. Conservar estilos de marca, logo, PWA, layouts y experiencia móvil.

### Fase E — Migrar o retirar scripts/tests Firebase

Revisar:

- `scripts/backup-firestore.sh`
- scripts `migrate:*` que aún lean/escriban Firestore.
- `tests/firestore.rules.test.mjs`.
- `tests/firestore-listeners.test.ts`.
- `test:rules` y `emulators:start` en `package.json`.
- documentación que indique que Firestore o Firebase Auth son fuente de verdad.

Opciones válidas:

- reemplazar por tests de RLS/RPC Supabase;
- conservar un script histórico únicamente si queda explícitamente fuera del producto y fuera del pipeline;
- eliminarlo si ya no tiene uso y documentar la decisión.

No dejar tests críticos verdes solamente porque sigan probando Firebase antiguo.

### Fase F — Limpieza de dependencias

Solo después de que el código operativo y los tests necesarios estén libres de Firebase:

1. Quitar `firebase` de `dependencies`.
2. Quitar `firebase-admin` de `dependencies`.
3. Quitar `@firebase/rules-unit-testing` si ya no se usa.
4. Quitar `firebase-tools` si ya no se usa.
5. Eliminar `firebase` y `firebase-admin` de `package-lock.json` mediante `npm install`.
6. Ejecutar `npm run typecheck`, `npm run build` y la suite relevante.
7. Confirmar con `npm ls firebase firebase-admin firebase-tools` que no quedan dependencias directas o transitivas inesperadas.

Este debe ser un commit separado, por ejemplo:

```text
chore: remove firebase dependencies after supabase cutover
```

### Fase G — Variables y configuración Vercel

No borrar variables de Vercel sin autorización explícita del propietario. Primero listar nombres y entornos:

```text
FIREBASE_*
NEXT_PUBLIC_FIREBASE_*
GOOGLE_APPLICATION_CREDENTIALS
```

La auditoría local ya encontró en `.env.local` estas variables antiguas:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Estas variables no deben copiarse a nuevos entornos Supabase. El resultado de la auditoría de Vercel debe entregarse como lista para que el propietario decida cuándo borrarlas.

### Fase H — Corte final y verificación

Criterios de terminado:

- `rg` no encuentra imports operativos Firebase en `app`, `components` ni `lib`.
- No existen llamadas `getAdminDb`, `getAdminAuth`, `firebase/firestore` ni `firebase/auth` en el path del producto.
- Login, logout, invitaciones, members, Workspace y superadmin funcionan con Supabase Auth.
- Catálogo, stock, reservas, ventas, caja, crédito, entregas, notifications y API v1 funcionan con Supabase.
- `package.json` y `package-lock.json` ya no tienen dependencias Firebase no utilizadas.
- `npm run typecheck` pasa.
- `npm run build` pasa.
- Tests de autorización, integridad, RLS/RPC y flujos principales pasan.
- Preview Vercel del commit final está `READY`.
- Production permanece sin tocar hasta una instrucción posterior.

## 5. Pruebas funcionales mínimas para cada Preview

1. Login y selección de tenant desde el celular.
2. Abrir Workspace y consultar catálogo/inventario.
3. Registrar una operación de stock o venta de prueba.
4. Revisar caja, notificaciones y estadísticas.
5. Probar una ruta pública v1 con una API key de prueba.
6. Verificar que una petición sin token, tenant o API key recibe rechazo correcto.
7. Probar una cuenta sin permisos para confirmar aislamiento multi-tenant.

## 6. Reglas de seguridad y operación

- Trabajar únicamente en `migration/supabase-only`.
- No tocar Production.
- No borrar datos Firestore de prueba ni datos Supabase.
- No borrar variables Vercel sin autorización del propietario.
- No cambiar el proyecto Vercel `tienda-ss-ozkq` por otro.
- No cambiar el repositorio ni crear una rama paralela.
- Cada bloque debe tener un commit descriptivo, tests, build cuando corresponda y Preview.
- Si una migración altera una ruta pública o de billing, conservar compatibilidad de respuesta.
- Toda mutación debe estar tenant-scoped y preferentemente protegida por RPC/RLS.

## 7. Prompt listo para pegar en la otra cuenta de Manus

```text
Continúa la migración Supabase-only de Tienda-SS.

Repositorio correcto: elprofenica505-ai/Tienda-SS
Rama autorizada: migration/supabase-only
Proyecto Vercel correcto: tienda-ss-ozkq
Equipo Vercel: el-profe-nica-505
Proyecto Supabase: conexiax-dev
Supabase ref: mlymquyvrgnrsqhicbdo
Último commit: e5673cf — refactor: migrate billing superadmin and v1 to supabase
Production: NO TOCAR.

Objetivo: eliminar por completo Firebase del producto operativo. Usar Supabase Auth, PostgreSQL, RLS, Storage y RPCs. No migrar datos Firestore de prueba y no borrar datos remotos.

Ya migrado:
- onboarding, sesión, organización y members;
- contacts, permissions y audit;
- reservas de inventario;
- invitaciones y aceptación;
- crédito, notas de crédito y returns;
- deliveries;
- catalog import/export;
- notifications, stats/daily y health;
- billing y Stripe webhook;
- superadmin metrics/audit/tenants;
- v1 keys/catalog/sales/preview webhook.

Último commit de migración: e5673cf. La migración 0017_platform_billing_api.sql ya está aplicada en Supabase.

Falta, en este orden:
1. Confirmar que el Preview de e5673cf llegue a READY y probarlo; no promover Production.
2. Auditar todo app/components/lib/scripts/tests, no solo app/api, buscando firebase, firebase-admin, Firestore, getAdminDb y getAdminAuth.
3. Migrar lib/auth.ts, lib/firebase.ts, auth-policy y las páginas superadmin cliente a Supabase Auth.
4. Redirigir o eliminar LegacyApp y los componentes Firebase Bodega/Cajero/Jefe/Vendedor/ProductosAdmin solo después de confirmar que no son usados por Workspace.
5. Migrar o retirar scripts/tests Firestore y actualizar package scripts.
6. Cuando no queden imports operativos, quitar firebase, firebase-admin, @firebase/rules-unit-testing y firebase-tools del package.json/package-lock.json.
7. Listar FIREBASE_*, NEXT_PUBLIC_FIREBASE_* y GOOGLE_APPLICATION_CREDENTIALS configuradas en Vercel para que el propietario las borre; no borrarlas sin autorización.
8. Ejecutar typecheck, build, tests de seguridad/RLS/RPC y crear Preview READY final.

Conservar siempre marca, logo, PWA, multi-tenant y todos los módulos del menú Workspace. Cada bloque debe terminar con commit claro, validaciones y URL Preview. Si encuentras una dependencia o flujo ambiguo, conserva la ruta hasta verificar su reemplazo Supabase.
```

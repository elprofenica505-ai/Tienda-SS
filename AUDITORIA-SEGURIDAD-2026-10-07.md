# Auditoría de seguridad y estado — Tienda-SS / ConexiaX
**Fecha:** 7 de octubre de 2026
**Alcance:** código completo (`app/`, `lib/`, `components/`, `middleware.ts`, 67 migraciones SQL de Supabase, dependencias)
**Commit auditado:** `d5af910` (rama `SaaS-MultiTenant-Profesional`)

---

## 1. Veredicto rápido

| Pregunta | Respuesta |
|---|---|
| ¿Funciona la aplicación? | **Sí.** Build de producción correcto, 360/360 pruebas en verde, TypeScript limpio. |
| ¿Está todo bien? | **No del todo.** Se encontró **1 fallo crítico**, **2 medios** y varios menores. |
| ¿Ya están reparados? | **Sí, en el código.** Falta que tú apliques **una migración SQL** en Supabase (ver §6). |
| ¿Es 100 % segura? | **Ninguna aplicación lo es.** Tras aplicar la corrección, tu postura de seguridad es **alta** (muy por encima del promedio). En §5 te explico qué falta. |
| ¿Es vulnerable a inyección SQL? | **No.** No existe SQL concatenado en todo el proyecto. El fallo crítico encontrado era de otra naturaleza (control de acceso, no inyección). |

---

## 2. Lo que está BIEN (y es mucho)

Es importante decirlo con evidencia, porque la base de esta aplicación es sólida:

**Inyección SQL: limpio.**
- Cero uso de `execute()`, `.sql()`, `query()` crudo o plantillas SQL con interpolación.
- Todo el acceso a datos pasa por `@supabase/supabase-js`, que genera consultas parametrizadas, o por funciones RPC con parámetros tipados (`uuid`, `numeric`, `jsonb`).
- Las 67 migraciones usan `security definer set search_path = public, pg_temp`, lo que evita el secuestro de `search_path` (un vector clásico de escalada en PostgreSQL).

**Autorización multiusuario bien hecha.**
- 41 rutas API usan `requireTenantPermission` / `requireTenantMember`, que verifica en el servidor: token válido → membresía activa en la empresa → rol válido → política de sesión → límite de peticiones → permiso del módulo.
- `lib/api-policy.ts` define la matriz módulo/acción y el middleware rechaza (403) cualquier ruta no declarada.
- `lib/data-scope.ts` aplica alcance por sucursal (`assertBranchAccess`) y **oculta campos sensibles** (costo, margen, utilidad, cuenta bancaria) a roles no administrativos.
- Hay pruebas que verifican que ninguna ruta crítica autoriza sólo con el encabezado `x-tenant-id`.

**Autenticación.**
- Supabase Auth con verificación de correo obligatoria, sesiones de máximo 12 horas, MFA disponible por teléfono y comparaciones de secretos con `timingSafeEqual` (evita ataques de temporización).

**Límite de peticiones (rate limiting).**
- Limitador distribuido respaldado en Supabase con conteo atómico (protege incluso con varias instancias en Vercel), con cubos por IP, usuario, empresa y endpoint.
- El intento de login usa hash SHA-256 del correo, así que un volcado del contador no expone direcciones de correo.

**Webhooks y tareas programadas.**
- Stripe: firma verificada + idempotencia + protección contra eventos fuera de orden.
- WhatsApp: firma HMAC + comparación en tiempo constante + límite de 1 MB de cuerpo.
- Los 4 cron usan `CRON_SECRET` con comparación en tiempo constante.
- Superadmin: se exige token válido + lista blanca de UIDs.

**Secretos.**
- La `service_role` key se usa **sólo en el servidor** (`lib/supabase/server.ts`). El cliente del navegador (`lib/supabase/client.ts`) se usa **únicamente para autenticación**.
- **No hay ningún secreto en el historial de Git** (verificado con búsqueda sobre todo el historial).

**XSS: limpio.** No hay `dangerouslySetInnerHTML`, `innerHTML`, `eval()` ni `new Function()` en el proyecto.

**Calidad.** 360 pruebas automatizadas en verde, TypeScript sin errores, ESLint sin errores, build correcto.

---

## 3. Hallazgos y reparaciones

### 🔴 CRÍTICO — C1. Diez tablas de negocio sin Row Level Security

**Qué pasó.** Las migraciones de las etapas 4, 7 y 8 crearon tablas en el esquema `public` y **nunca activaron Row Level Security (RLS)**:

| Etapa | Tablas afectadas |
|---|---|
| 4 — Reglas comerciales | `price_lists`, `price_list_items`, `customer_price_lists`, `branch_price_lists`, `commercial_rules`, `sales_commissions` |
| 7 — Cuentas por pagar | `payables`, `payable_payments`, `financial_outflows` |
| 8 — Arqueos de caja | `cash_reconciliations` |

**Por qué es grave.** En Supabase el esquema `public` se publica automáticamente como API REST (PostgREST). Cada tabla tiene su propio endpoint:
`https://<tu-proyecto>.supabase.co/rest/v1/<tabla>`

Y la *anon key* **no es un secreto**: viaja dentro del JavaScript que el navegador descarga, y Supabase la documenta como pública. La **única** capa que impide que cualquiera lea todas las filas es RLS. Con RLS desactivado, si los privilegios por defecto siguen concedidos a `anon`/`authenticated` (el comportamiento histórico de Supabase, y probablemente el de tu proyecto), una sola petición de este tipo devolvería **las cuentas por pagar de todos los clientes**:

```bash
curl "https://<proyecto>.supabase.co/rest/v1/payables?select=*" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

Esto es exactamente el fallo de la **CVE-2025-48757** (más de 170 aplicaciones con datos expuestos) y es lo que el *Security Advisor* de Supabase marca como error `rls_disabled_in_public`.

**Atenuante real.** Tu backend usa `service_role` (que ignora RLS) y el navegador **nunca** consulta tablas directamente: sólo lo usa para iniciar sesión. Por eso la aplicación nunca dejó de funcionar bien. Pero eso no elimina el fallo: la tabla seguía siendo alcanzable desde fuera.

**Reparación aplicada:** `supabase/migrations/20261008000001_close_rls_gap_exposed_business_tables.sql`
- Activa RLS en las 10 tablas (quedan "denegadas por defecto").
- Revoca privilegios de `anon` y `authenticated`.
- Añade políticas de denegación explícitas (`*_client_deny`), siguiendo la convención que ya usaba tu migración `20260915000001`.
- Endurece los privilegios por defecto para que **una tabla futura no nazca expuesta**.
- Revoca `TRUNCATE`, `REFERENCES` y `TRIGGER` (TRUNCATE no consulta RLS: un `grant truncate` permitiría vaciar una tabla incluso con RLS activa).
- Incluye consultas de verificación al final del archivo.

**No rompe nada.** `service_role` ignora RLS, y las funciones RPC son `security definer` propiedad del rol que aplica las migraciones (dueño de las tablas), con `grant execute` sólo a `service_role`. Se verificó explícitamente.

**Reparación adicional:** `tests/rls-coverage.test.ts` — prueba de regresión que recorre **todas** las migraciones y falla si cualquier tabla creada en `public` no tiene RLS. Comprobado: al quitar la corrección, la prueba nombra exactamente las 10 tablas expuestas.

---

### 🟠 MEDIO — M1. Validación de empresa distinta entre los dos guardianes

Existen dos guardianes de autorización y **sólo uno** validaba el formato del identificador de empresa que envía el cliente:

| Guardián | Usado por | Validaba `x-tenant-id`? |
|---|---|---|
| `requireTenantMember` (`lib/tenant.ts`) | 41 rutas | **Sí** (`TENANT_ID_PATTERN`) |
| `requireSupabaseTenantPermission` (`lib/supabase/tenant-access.ts`) | 4 rutas | **No** — sólo comprobaba que no estuviera vacío |

**Por qué importa.** `findMembership()` interpola ese valor en un filtro de PostgREST:
```js
.or(`id.eq.${tenantId},legacy_firestore_id.eq.${tenantId}`)
```
PostgREST compone filtros con una sintaxis propia que usa `,` `.` `(` `)` `!`. Sin validar, un usuario autenticado podía **inyectar sintaxis de filtro** (el equivalente a una inyección SQL en cuanto a efecto, aunque no lo sea técnicamente).

**Impacto real medido: limitado.** Se verificó el flujo completo: después de resolver la empresa, `findMembership` **exige que el usuario sea miembro activo**, y `toTenantContext` devolvía el valor crudo, así que las consultas posteriores no encontraban filas (falla segura). No se encontró una ruta de escalada entre empresas, pero sí una garantía inconsistente y respuestas 500 evitables.

**Reparación aplicada:**
- `TENANT_ID_PATTERN` e `isValidTenantId()` / `readTenantIdFromHeaders()` ahora se exportan desde `lib/tenant.ts` y **ambos** guardianes los usan.
- `toTenantContext()` ahora devuelve **siempre el UUID resuelto** de la empresa, nunca el valor que envió el cliente. Esto además corrige dos **errores latentes**: el RPC `create_branch_with_resources` y `.eq('id', context.tenantId)` esperaban un UUID y fallaban con identificadores heredados de Firestore.

---

### 🟠 MEDIO — M2. Faltaban cabeceras de seguridad en las páginas HTML

`middleware.ts` sólo se ejecuta en `/api/:path*` (matcher), así que `X-Frame-Options` **no se aplicaba a las páginas HTML**. Además faltaban por completo **CSP** y **HSTS**.

**Impacto.** Sin CSP y sin `frame-ancestors`/`X-Frame-Options`, un atacante podía incrustar tu aplicación en un iframe invisible y hacer *clickjacking* (engañar al usuario para que pulse botones reales: cobrar, anular ventas, cambiar permisos). Sin HSTS, un atacante en la misma red podía degradar la conexión a HTTP.

**Reparación aplicada** en `next.config.mjs`:
- `Content-Security-Policy` con `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` (producción) y `connect-src` incluyendo automáticamente tu proyecto de Supabase.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- `X-Frame-Options: DENY` y `X-DNS-Prefetch-Control: off`.
- Todo se activa **sólo cuando `VERCEL_ENV=production`**, para no romper la vista previa ni el recargado en caliente. Verificado: la aplicación responde 200 y las cabeceras llegan correctamente.

---

### 🟠 MEDIO — M3. Vulnerabilidades en dependencias de producción

`npm audit` reportaba **2 vulnerabilidades altas que sí llegan a producción**:

| Paquete | Problema | Corrección |
|---|---|---|
| `sharp` 0.35.4 | CVE-2026-96889 (librsvg) — lo usa la optimización de imágenes de Next.js | → 0.35.5 |
| `source-map-js` 1.2.1 | GHSA-68fv-2mgg-jv7q (denegación de servicio) | → 1.2.2 |

**Reparación aplicada:** `npm audit fix`. Resultado: **`npm audit --omit=dev` → 0 vulnerabilidades**. El build de producción sigue correcto.

---

### 🟡 BAJO / INFORMATIVO

| # | Hallazgo | Nota |
|---|---|---|
| L1 | Quedan **12 vulnerabilidades en dependencias de desarrollo** (`autocannon`, `eslint`, `tailwindcss`). | **No llegan a producción.** `npm audit fix --force` las resolvería instalando versiones con cambios incompatibles (tailwind 4, autocannon 2). No vale la pena ahora. |
| L2 | 9 avisos de ESLint por usar `<img>` en lugar de `next/image`. | Sólo rendimiento, no seguridad. |
| L3 | El host canónico de respaldo está fijo en el código (`middleware.ts`). | **Se intentó quitar y se revirtió a propósito:** la prueba `stage0-product-truth` exige ese respaldo explícitamente. Es comportamiento probado e intencional; se deja como está. |
| L4 | CI ejecutaba `npm audit --omit=dev --audit-level=critical`. | **Corregido:** ahora es `--audit-level=high`, así que habría detectado M3 automáticamente. |
| L5 | La política de MFA administrativo está desactivada por defecto. | Recomendado activarla (ver §5). Documentado en `.env.example`. |

### 🟢 Verificación adicional: capa de funciones RPC

> **Nota posterior:** al preparar el SQL para producción se detectó y corrigió un fallo **en la propia migración 2** de esta auditoría. Se documenta aquí por transparencia.
>
> La versión inicial usaba `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS ...`, que es un **NO-OP silencioso**. Según la documentación de PostgreSQL, los privilegios por defecto por esquema se **suman** a los globales y *"no se puede revocar un privilegio por esquema si fue otorgado globalmente; el REVOKE por esquema sólo revierte un GRANT previo por esquema"*. Como el `EXECUTE` a `PUBLIC` es un valor global incorporado de PostgreSQL, esa sentencia no habría hecho nada, dando una falsa sensación de seguridad.
>
> **Corregido:** se usa la forma global (sin `IN SCHEMA`), envuelta en un bloque que tolera `insufficient_privilege` para no romper la migración donde el rol no pueda alterar esos valores. Además, ahora se **otorga `EXECUTE` a `service_role` ANTES de revocar**, garantizando el acceso del backend.
>
> Se verificaron tres cosas antes de dar el visto bueno:
> 1. **11 funciones** no tenían `grant execute ... to service_role` (helpers de RLS, funciones de trigger y funciones internas). Se comprobó que **ninguna se invoca por RPC desde la aplicación** (0 llamadas), y el `GRANT` global las cubre.
> 2. **El propietario de una función conserva siempre `EXECUTE`**: el ACL por defecto es `{propietario=X/propietario, =X/propietario}`, así que revocar de `PUBLIC` no elimina su entrada. Las llamadas internas de funciones `security definer` (`erp_normalize_items`, `erp_server_price_items`) siguen funcionando.
> 3. **Las funciones de trigger son seguras**: PostgreSQL sólo comprueba `EXECUTE` al **crear** el trigger, no en tiempo de ejecución, así que los triggers existentes (`inventory_movement_immutable_guard`, `inventory_movement_kardex_guard`, `enforce_receivable_credit_limit`) no se ven afectados.
>
> Ambas lecciones quedaron blindadas con pruebas: una falla si reaparece el patrón `IN SCHEMA ... REVOKE EXECUTE ON FUNCTIONS`, y otra exige que el `GRANT` a `service_role` preceda al `REVOKE`.

Se auditaron las **66 funciones** del esquema `public` y se confirmó que **las 66** tienen su `revoke all on function ... from public, anon, authenticated`. Esto es importante porque en PostgreSQL `create function` concede `EXECUTE` a `PUBLIC` por defecto, y `anon`/`authenticated` heredan de `PUBLIC`: cualquier función `security definer` sin revocar sería invocable sin autenticación desde `POST /rest/v1/rpc/<funcion>`.

También se verificó:
- **Vistas:** existe una sola (`receivables_aging`) y ya declara `security_invoker = true`, así que no puede saltarse la RLS de las tablas subyacentes.
- **Secuencias:** no hay ninguna (todas las claves son `uuid`), así que no hay exposición por `serial`.
- **`security definer`:** todas fijan `set search_path = public, pg_temp`, lo que evita el secuestro de `search_path`.

**Reparación aplicada igualmente (defensa en profundidad):** `supabase/migrations/20261008000002_harden_function_default_privileges.sql` añade `alter default privileges ... revoke execute on functions from public, anon, authenticated`, para que una función **futura** no nazca expuesta por olvido.

---

## 4. Cómo evita la aplicación los ataques de inyección SQL

Respuesta directa a tu pregunta, con el mecanismo concreto:

1. **Nunca se construye SQL con texto del usuario.** El proyecto no usa `execute()`, `.sql()`, ni plantillas SQL con interpolación. Toda consulta se expresa con el cliente de Supabase, que envía los valores como **parámetros separados** de la sentencia. Un valor malicioso como `' OR 1=1--` se trata como un texto literal, nunca como código.

2. **Las operaciones sensibles son funciones RPC con parámetros tipados.** Por ejemplo `create_sale(...)`, `receive_purchase_with_payable(...)`, `cash_session_close_atomic(...)`. Los parámetros están declarados con tipos (`uuid`, `numeric`, `jsonb`), así que PostgreSQL **rechaza** cualquier valor que no encaje antes de ejecutar nada.

3. **Las funciones usan `security definer` con `search_path` fijo** (`set search_path = public, pg_temp`). Esto impide que un atacante cree objetos en un esquema propio para que una función privilegiada los ejecute por error.

4. **`security definer` está limitado con `grant execute ... to service_role`.** Ninguna función privilegiada es invocable por `anon` ni por `authenticated`; se verificó en las etapas 4, 7 y 8.

5. **RLS como última barrera.** Con RLS activo, incluso si alguien obtuviera la anon key, PostgreSQL filtra fila por fila según la política. Es defensa en profundidad: el fallo C1 fue precisamente un hueco en esta capa.

6. **Validación de entrada y autorización en el servidor.** Cada ruta vuelve a comprobar token, empresa, rol y permiso. El cliente no decide nada: no se confía en el `x-tenant-id` que envía el navegador (se valida contra la membresía real en base de datos).

**Otros ataques cubiertos:**

| Ataque | Cómo se defiende |
|---|---|
| **XSS** | Sin `dangerouslySetInnerHTML`/`eval`; React escapa por defecto; **ahora además** CSP con `object-src 'none'` y `base-uri 'self'`. |
| **Clickjacking** | `frame-ancestors 'none'` + `X-Frame-Options: DENY` en producción. |
| **Fuerza bruta / credential stuffing** | Límite distribuido por IP y por correo antes del login. |
| **Robo de sesión por downgrade** | HSTS obliga HTTPS durante un año. |
| **Falsificación de webhooks** | Firma criptográfica verificada (Stripe y WhatsApp). |
| **Repetición de webhooks** | Tabla de idempotencia + control de eventos fuera de orden. |
| **Reloj/temporización de secretos** | `timingSafeEqual` en todos los secretos. |
| **Fuga de secretos al cliente** | `service_role` sólo en servidor; verificado que ningún secreto está en el historial de Git. |
| **Escalada entre empresas** | Membresía activa obligatoria + validación del identificador + RLS. |
| **Acceso a sucursales ajenas** | `assertBranchAccess` + `resolveAuthorizedBranchId` en el servidor. |
| **Fuga de datos financieros** | `redactSensitiveFields` oculta costo/margen/utilidad a roles no administrativos. |

---

## 5. ¿Qué falta para estar "segura"? (honestidad total)

**No existe el 100 % en seguridad.** Cualquier aplicación puede ser comprometida por un fallo nuevo, una dependencia o un error humano. Lo alcanzable —y lo que ya casi tienes— es una postura **alta**: defensa en capas, mínimo privilegio, y pruebas que impidan retrocesos.

**Obligatorio ahora (bloqueante):**
1. Aplicar la migración `20261008000001` en Supabase (§6). **Hasta que lo hagas, el hueco crítico sigue abierto en producción**, aunque el archivo ya esté en el repositorio.
2. Verificar con la consulta de §6.2 y la prueba de penetración de §6.3.
3. Revisar los registros de la API de Supabase (Dashboard → Logs → API/PostgREST) buscando peticiones a `/rest/v1/` sobre esas 10 tablas. Si ves tráfico que no reconoces, considera los datos como expuestos y avisa según corresponda.

**Muy recomendado (próximos días):**
4. Activar `AUTH_REQUIRE_MFA_ADMIN=true` y enrolar MFA en las cuentas `owner`/`admin`.
5. Cambiar el CI a `npm audit --omit=dev --audit-level=high`.
6. Programar `supabase inspect db` o el *Security Advisor* como revisión periódica.
7. Copias de seguridad: confirmar que Supabase tiene *Point-in-Time Recovery* activo.
8. Añadir seguimiento de errores real (Sentry u similar): hoy `lib/error-reporting.ts` sólo escribe en consola.

**Deseable (madurez):**
9. Ejecutar las pruebas E2E de Playwright en CI (ya están escritas, hoy no se ejecutan).
10. Sustituir `<img>` por `next/image` (rendimiento móvil).
11. Reducir `'unsafe-inline'` en la CSP usando *nonces* (requiere infraestructura en middleware).
12. Rotar la anon key no es necesario —es pública por diseño—, pero **nunca** compartas ni subas la `service_role` key.

---

## 6. Cómo aplicar la corrección (paso a paso)

### 6.1 Aplicar la migración

**Opción A — con la CLI de Supabase (recomendado):**
```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

**Opción B — sin CLI:** abre el **SQL Editor** de tu proyecto en Supabase, copia el contenido completo de
`supabase/migrations/20261008000001_close_rls_gap_exposed_business_tables.sql` y ejecútalo.

> La migración está envuelta en `begin; ... commit;`: si algo falla, no se aplica nada.

### 6.2 Verificar (debe devolver **cero filas**)

```sql
select c.relname as tabla_expuesta
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 1;
```

### 6.3 Prueba de penetración (sustituye `<proyecto>` y `<ANON_KEY>`)

```bash
curl "https://<proyecto>.supabase.co/rest/v1/payables?select=*" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```
Resultado correcto: `[]` o un error de permisos. **Nunca** una lista de datos.

### 6.4 Confirmar que la aplicación sigue funcionando

Abre la aplicación y prueba: iniciar sesión, ver el catálogo, cobrar una venta, cerrar caja y ver reportes. Si algo falla, revisa que `SUPABASE_SERVICE_ROLE_KEY` esté configurada en Vercel.

---

## 7. Archivos modificados en esta auditoría

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261008000001_close_rls_gap_exposed_business_tables.sql` | **NUEVO** — cierra el fallo crítico C1 |
| `supabase/migrations/20261008000002_harden_function_default_privileges.sql` | **NUEVO** — red de seguridad para funciones futuras (corregido el NO-OP) |
| `MIGRACION-SEGURIDAD-SUPABASE.sql` | **NUEVO** — los 2 pasos consolidados, listo para pegar en el SQL Editor de Supabase |
| `tests/rls-coverage.test.ts` | **NUEVO** — 7 pruebas de regresión (RLS, privilegios, funciones, vistas, NO-OP) |
| `lib/tenant.ts` | Validación del identificador de empresa exportada y reutilizable (M1) |
| `lib/supabase/tenant-access.ts` | Usa la validación compartida (M1) |
| `lib/repositories/organization-repository.ts` | `toTenantContext` devuelve siempre el UUID resuelto (M1) |
| `next.config.mjs` | CSP, HSTS, X-Frame-Options, X-DNS-Prefetch-Control (M2) |
| `.github/workflows/ci.yml` | `npm audit --audit-level=critical` → `high` (L4) |
| `.env.example` | Documenta la recomendación de MFA administrativo (L5) |
| `package.json` / `package-lock.json` | `npm audit fix`; nueva prueba añadida a `npm test` (M3) |

**Estado final verificado:** `npm run typecheck` ✅ · `npm run lint` ✅ (0 errores) · `npm test` ✅ **364/364** · `npm run build` ✅ · `npm audit --omit=dev` ✅ **0 vulnerabilidades**

> **Nota sobre "sin dañar lo ya funcional":** durante la implementación se intentó eliminar el dominio fijo de `middleware.ts` (hallazgo L3). La suite de pruebas lo detectó inmediatamente (`stage0-product-truth` exige ese respaldo), así que **se revirtió** y se dejó el comportamiento original intacto. Todos los demás cambios se validaron con la suite completa.

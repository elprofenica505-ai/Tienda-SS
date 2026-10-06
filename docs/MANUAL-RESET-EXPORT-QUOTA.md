# Manual para aplicar la migración de cuota diaria compartida y resetear contador de prueba

**Fecha:** 2026-10-04
**Migración:** `supabase/migrations/20261004000004_daily_only_report_export_quota.sql`
**Rama:** `arena/db094158-tienda-ss` (seguimiento de `arena/01a10939-tienda-ss`, PR #16 mergeado en `fece7e8`)

## Objetivo

- Cuota compartida de **3 exportaciones por día, sin límite mensual**, para:
  - Reportes financieros (CSV/XLSX) → `/api/reports/export`
  - Excel maestro → `/api/reports/workbook`
  - Catálogo → `/api/catalog/export`
- Todas consumen la misma tabla `financial_report_export_daily_usage` y la misma función `consume_financial_report_export`.

## No ejecutar automáticamente

> No ejecutes esta migración con `supabase db push` ni desde el dashboard hasta que el dueño autorice.

### SQL para aplicar manualmente en Supabase SQL Editor

Copia el contenido íntegro de:

```
supabase/migrations/20261004000004_daily_only_report_export_quota.sql
```

Pégalo en el **SQL Editor** de Supabase (project ref de ConexiaX) y ejecútalo. Es idempotente y no borra datos.

La migración:

- Crea si no existe `financial_report_export_daily_usage` con check 0-3.
- Redefine `consume_financial_report_export(uuid, uuid)` para **solo** cuota diaria de 3, sin llamar a `consume_monthly_report_export`.
- Redefine `consume_catalog_export(uuid, uuid)` para delegar a la misma función diaria, manteniendo compatibilidad con claves antiguas (`current`, `next`, `limit`).

### Verificación post-migración

```sql
-- Debe devolver la función sin referencia mensual
select pg_get_functiondef(oid) from pg_proc where proname='consume_financial_report_export';

-- Debe mostrar 3 como límite diario
select * from public.financial_report_export_daily_usage order by local_date desc limit 10;
```

## Reset del contador de la cuenta de prueba (solo un tenant)

> No hacer reset global. Script completo: `supabase/manual/RESET_DAILY_QUOTA_FOR_TENANT.sql`.

### ⚠️ Error `22P02 invalid input syntax for type uuid`

Este error se produce al ejecutar el SQL **sin reemplazar el marcador** por un UUID real
(se dejó `<TU_TENANT_UUID>` / `<TENANT_UUID>` en la consulta). PostgreSQL intenta convertir
ese texto a `uuid` y aborta.

Un UUID válido tiene el formato 8-4-4-4-12 hexadecimal, por ejemplo
`3f2b1c7e-9a84-4d1f-b0c2-15e6a7d8e9f0`. Si el valor que vas a pegar contiene `<`, `>` o la
palabra `TENANT`, todavía es un marcador.

### Paso 0 — Obtener el UUID real del tenant

```sql
select id, name, slug, timezone, plan
from public.tenants
order by created_at desc
limit 50;

-- O filtrando por nombre/slug de la empresa de prueba:
-- select id, name, slug, timezone, plan
-- from public.tenants
-- where name ilike '%nombre parcial%' or slug ilike '%slug parcial%';
```

Copia el valor de la columna `id`.

### Paso 1 — Reset idempotente del día actual (recomendado)

Bloque autocontenido: cambia **únicamente** el valor de `v_tenant_text`. Valida el UUID
antes de tocar datos (mensaje claro en lugar de `22P02`), resuelve la zona horaria real del
tenant igual que `consume_financial_report_export`, y usa `INSERT ... ON CONFLICT DO UPDATE`,
por lo que puede ejecutarse tantas veces como se quiera con el mismo resultado: 0 usadas hoy.

```sql
do $$
declare
  -- 👇 PEGA AQUÍ EL UUID REAL OBTENIDO EN EL PASO 0
  v_tenant_text text := '00000000-0000-0000-0000-000000000000';
  v_tenant_id   uuid;
  v_local_date  date;
  v_timezone    text;
begin
  if v_tenant_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception
      'v_tenant_id no es un UUID válido: %. Ejecuta el PASO 0 y pega el id real del tenant (sin < >).',
      v_tenant_text;
  end if;

  v_tenant_id := v_tenant_text::uuid;

  select coalesce(nullif(t.timezone, ''), 'America/Managua')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not found then
    raise exception 'No existe ningún tenant con id %. Verifica el UUID en el PASO 0.', v_tenant_id;
  end if;

  v_local_date := (now() at time zone v_timezone)::date;

  insert into public.financial_report_export_daily_usage (tenant_id, local_date, export_count, updated_at)
  values (v_tenant_id, v_local_date, 0, now())
  on conflict (tenant_id, local_date)
  do update set export_count = 0, updated_at = now();

  raise notice 'Cuota diaria reseteada a 0 para tenant % en la fecha local % (zona %).',
    v_tenant_id, v_local_date, v_timezone;
end;
$$;
```

### Paso 2 — Verificación

```sql
select tenant_id, local_date, export_count, updated_at
from public.financial_report_export_daily_usage
where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid  -- UUID real
order by local_date desc
limit 5;
```

`export_count` debe ser `0` para la fecha local de hoy.

### Paso 3 — Limpiezas opcionales (solo entornos de prueba)

```sql
-- Histórico diario completo de ese tenant
delete from public.financial_report_export_daily_usage
where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Contadores mensuales antiguos (ya no se usan tras la migración daily-only)
delete from public.entitlement_usage
where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;
```

> Nunca ejecutes un `DELETE` sin la cláusula `where tenant_id = ...`: sería un reset global
> que afectaría a todas las empresas del SaaS.

## Fix 403 "Ruta API no autorizada." en Caja (`lib/api-policy.ts`)

**Síntoma:** en producción, `/api/cash-sessions` y `/api/cash-sessions/movements` devolvían
`403 {"error":"Ruta API no autorizada."}` y la pantalla de Caja no cargaba.

**Causa:** `routePolicies` sólo registraba raíces exactas (`/^\/api\/cash-sessions$/`). El
middleware llama a `getApiPolicy(pathname, method)` y, al no coincidir ninguna subruta,
recibía `null` y cortaba con 403 antes de llegar al handler.

**Corrección:** cada familia de rutas usa ahora el sufijo `(?:\/.*)?` para cubrir sus
subrutas (`cash-sessions`, `reports`, `payables`, `deliveries`, `purchases`, `fiscal`,
`daily-summaries`, `inventory`, `sales`, `presales`, `catalog`, `receivables`,
`organization`, `invitations`, `members`/`usuarios`, `stats`, `billing`, `finance`,
`contacts`, `notifications`, `permissions`).

El orden del array importa: las rutas con acción distinta a la de su familia se declaran
primero. `/api/reports/export` y `/api/reports/workbook` exigen `reports:export`, mientras
que el patrón general `/api/reports(?:/.*)?` sólo concede `reports:view`. Igual con
`/api/catalog/(import|export)` frente a `/api/catalog(?:/.*)?`.

También se registró `/api/payables`, que no tenía política alguna (`finance`).

Las rutas inexistentes siguen devolviendo 403: `tests/api-authorization-matrix.test.ts`
verifica tanto que las subrutas reales respondan 200 como que `/api/not-registered`,
`/api/cash-sessions-fake` y `/api/reportes` sigan rechazadas.

## Qué cambió en el código

- `app/api/catalog/export/route.ts` ahora usa `consume_financial_report_export` y `reportExportQuotaFailure`, compartiendo cuota con reportes.
- `lib/report-export-quota.ts` mensaje actualizado a: “3 exportaciones diarias compartidas (reportes, catálogo y Excel maestro)”.
- `tests/financial-reporting.test.ts` y `tests/financial-reports-api.test.ts` actualizados a lógica diaria sin límite mensual.
- `lib/api-policy.ts`: patrones por familia con `(?:/.*)?` y específicos primero (fix 403 en Caja).
- `supabase/manual/RESET_DAILY_QUOTA_FOR_TENANT.sql`: reset idempotente `INSERT ... ON CONFLICT DO UPDATE` con validación de UUID (fix 22P02).
- `tests/api-authorization-matrix.test.ts`: cobertura de subrutas y de rutas inexistentes.
- Páginas:
  - Ventas (`sales/page.tsx`): historial seleccionable con detalle e impresión, botón actualizar Excel maestro, filtros Todos/categoría, paginación 25.
  - Preventas (`presales/page.tsx`): detalle en tabla con `tfoot`, impresión ajustada, filtros Todos/categoría, paginación 25.
  - Inventario (`inventory/page.tsx`): fichas visuales con navegación anterior/siguiente, filtros Todos/categoría, 25 por página.
  - Catálogo (`catalog/page.tsx`): filtros Todos/categoría, búsqueda, 25 por página con anterior/siguiente.
  - Caja (`cashier/page.tsx`): opción confirmar manualmente (checkbox) o con escáner, con progreso visible.

## Validación local antes del PR

```bash
npm test               # 306 pruebas, 0 fallos (ajustado a daily-only)
npm run typecheck      # pasó
npm run build          # pasó
npm run lint           # 0 errores, 8 advertencias <img>
```

## Notas para el merge

- Este PR no hace merge automático. Revisa el diff y haz merge manual cuando autorices la migración SQL.
- Después del merge, aplica la migración manualmente en Supabase y luego ejecuta el reset solo para el tenant de prueba usando el SQL de la Opción A.

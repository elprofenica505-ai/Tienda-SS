# Manual para aplicar la migración de cuota diaria compartida y resetear contador de prueba

**Fecha:** 2026-10-04
**Migración:** `supabase/migrations/20261004000004_daily_only_report_export_quota.sql`
**Rama:** `arena/01a10939-tienda-ss`

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

> No hacer reset global.

Si el contador no se reinició para la cuenta de prueba, usa el tenant ID que indiques. Si aún no tienes el UUID, deja el marcador `<TENANT_UUID>` y reemplázalo.

### Opción A — Reset solo del día actual (recomendado)

```sql
-- Reemplaza <TENANT_UUID> por el UUID real del tenant de prueba
-- Usa la zona horaria de la empresa para calcular la fecha local si es necesario,
-- o simplemente borra el registro de hoy.

-- Ver fecha local de Managua (ajusta si tu empresa usa otra zona)
-- select (now() at time zone 'America/Managua')::date;

-- Reset del día actual para un tenant específico:
delete from public.financial_report_export_daily_usage
where tenant_id = '<TENANT_UUID>'::uuid
  and local_date = (now() at time zone 'America/Managua')::date;

-- Alternativa si quieres resetear a 0 en lugar de borrar:
-- update public.financial_report_export_daily_usage
-- set export_count = 0, updated_at = now()
-- where tenant_id = '<TENANT_UUID>'::uuid
--   and local_date = (now() at time zone 'America/Managua')::date;
```

### Opción B — Reset de todos los días para ese tenant (si quieres limpiar histórico de pruebas)

```sql
delete from public.financial_report_export_daily_usage
where tenant_id = '<TENANT_UUID>'::uuid;

-- Opcional: limpiar también el uso mensual antiguo (ya no se usa, pero por limpieza)
delete from public.entitlement_usage
where tenant_id = '<TENANT_UUID>'::uuid;
```

### Opción C — Ver estado actual antes de resetear

```sql
select tenant_id, local_date, export_count, last_exported_by, updated_at
from public.financial_report_export_daily_usage
where tenant_id = '<TENANT_UUID>'::uuid
order by local_date desc;

-- Ver tenant y zona horaria
select id, name, timezone, plan from public.tenants where id = '<TENANT_UUID>'::uuid;
```

## Qué cambió en el código

- `app/api/catalog/export/route.ts` ahora usa `consume_financial_report_export` y `reportExportQuotaFailure`, compartiendo cuota con reportes.
- `lib/report-export-quota.ts` mensaje actualizado a: “3 exportaciones diarias compartidas (reportes, catálogo y Excel maestro)”.
- `tests/financial-reporting.test.ts` y `tests/financial-reports-api.test.ts` actualizados a lógica diaria sin límite mensual.
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

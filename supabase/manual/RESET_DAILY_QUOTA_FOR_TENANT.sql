-- Reset de cuota diaria de exportaciones para un tenant específico
-- Uso: reemplaza <TENANT_UUID> por el UUID real del tenant de prueba.
-- No ejecutes un reset global.

-- 1. Ver estado actual
select tenant_id, local_date, export_count, updated_at
from public.financial_report_export_daily_usage
where tenant_id = '<TENANT_UUID>'::uuid
order by local_date desc;

-- 2. Reset solo del día actual (America/Managua)
delete from public.financial_report_export_daily_usage
where tenant_id = '<TENANT_UUID>'::uuid
  and local_date = (now() at time zone 'America/Managua')::date;

-- Si prefieres actualizar a 0 en lugar de borrar:
-- update public.financial_report_export_daily_usage
-- set export_count = 0, updated_at = now()
-- where tenant_id = '<TENANT_UUID>'::uuid
--   and local_date = (now() at time zone 'America/Managua')::date;

-- 3. Reset completo del histórico de ese tenant (opcional, solo pruebas)
-- delete from public.financial_report_export_daily_usage
-- where tenant_id = '<TENANT_UUID>'::uuid;

-- 4. Limpieza de contadores mensuales antiguos (ya no se usan, opcional)
-- delete from public.entitlement_usage
-- where tenant_id = '<TENANT_UUID>'::uuid;

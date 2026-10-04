-- Cuota compartida de 3 exportaciones por día, sin límite mensual,
-- para reportes, catálogo y Excel maestro.
-- Esta migración reemplaza la lógica diaria+mensual de
-- 20261004000003_atomic_financial_report_exports.sql por una cuota
-- exclusivamente diaria y compartida entre módulos.
-- No ejecutar automáticamente en Supabase hasta autorización del dueño.
begin;

-- Asegurar tabla diaria (idempotente, misma definición que 20261004000001)
create table if not exists public.financial_report_export_daily_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  local_date date not null,
  export_count integer not null default 0 check (export_count between 0 and 3),
  last_exported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, local_date)
);

create index if not exists financial_report_export_daily_usage_date_idx
  on public.financial_report_export_daily_usage (local_date desc);

alter table public.financial_report_export_daily_usage enable row level security;
revoke all on table public.financial_report_export_daily_usage from public, anon, authenticated;
grant select, insert, update on table public.financial_report_export_daily_usage to service_role;

-- Función principal: solo cuota diaria de 3, compartida por reportes, catálogo y Excel maestro.
create or replace function public.consume_financial_report_export(
  target_tenant_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tenant_timezone text;
  local_now timestamp without time zone;
  v_local_date date;
  daily_used integer;
  daily_limit constant integer := 3;
  reset_at timestamptz;
  current_instant timestamptz := clock_timestamp();
begin
  select coalesce(nullif(timezone, ''), 'America/Managua')
    into tenant_timezone
    from public.tenants
   where id = target_tenant_id
   for update;
  if not found then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  begin
    local_now := current_instant at time zone tenant_timezone;
  exception when invalid_parameter_value then
    tenant_timezone := 'America/Managua';
    local_now := current_instant at time zone tenant_timezone;
  end;
  v_local_date := local_now::date;
  reset_at := (v_local_date + 1)::timestamp without time zone at time zone tenant_timezone;

  insert into public.financial_report_export_daily_usage (tenant_id, local_date, export_count, updated_at)
  values (target_tenant_id, v_local_date, 0, current_instant)
  on conflict (tenant_id, local_date) do nothing;

  select usage.export_count
    into daily_used
    from public.financial_report_export_daily_usage as usage
   where usage.tenant_id = target_tenant_id
     and usage.local_date = v_local_date
   for update;
  daily_used := coalesce(daily_used, 0);

  if daily_used >= daily_limit then
    return jsonb_build_object(
      'allowed', false,
      'code', 'DAILY_EXPORT_LIMIT',
      'used', daily_used,
      'limit', daily_limit,
      'localDate', v_local_date,
      'resetAt', reset_at,
      'timezone', tenant_timezone
    );
  end if;

  daily_used := daily_used + 1;
  update public.financial_report_export_daily_usage
     set export_count = daily_used,
         last_exported_by = target_user_id,
         updated_at = current_instant
   where tenant_id = target_tenant_id
     and local_date = v_local_date;

  return jsonb_build_object(
    'allowed', true,
    'dailyUsed', daily_used,
    'dailyLimit', daily_limit,
    'used', daily_used,
    'limit', daily_limit,
    'localDate', v_local_date,
    'resetAt', reset_at,
    'timezone', tenant_timezone
  );
end;
$$;

revoke all on function public.consume_financial_report_export(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_financial_report_export(uuid, uuid) to service_role;

-- Catálogo: reutiliza la misma cuota diaria compartida.
-- Mantiene compatibilidad con la ruta /api/catalog/export que antes usaba
-- un contador mensual. Ahora todas las exportaciones (reportes CSV/XLSX,
-- Excel maestro y catálogo) consumen el mismo contador diario.
create or replace function public.consume_catalog_export(
  target_tenant_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  -- Delegar a la función diaria para garantizar cuota compartida.
  result := public.consume_financial_report_export(target_tenant_id, target_user_id);
  -- Mantener claves antiguas por compatibilidad, además de las nuevas.
  if coalesce((result->>'allowed')::boolean, false) then
    return result || jsonb_build_object(
      'current', coalesce((result->>'dailyUsed')::int, 1) - 1,
      'next', result->>'dailyUsed',
      'limit', result->>'dailyLimit'
    );
  end if;
  return result;
end;
$$;

revoke all on function public.consume_catalog_export(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_catalog_export(uuid, uuid) to service_role;

-- Limpieza opcional: la función mensual anterior ya no se usa para bloquear,
-- pero se conserva por si algún rollback la necesita. No se elimina para
-- evitar romper dependencias históricas.
-- Si se desea deshabilitar completamente el límite mensual, basta con no
-- invocar la función mensual desde el código de aplicación.

commit;

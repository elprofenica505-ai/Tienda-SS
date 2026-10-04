-- One atomic counter shared by financial report formats and workspace modules.
-- It enforces the daily limit first, then the plan's existing monthly limit.
-- The tenant row lock serializes simultaneous exports from different users.
-- Apply only after 20261003000002_atomic_report_exports.sql and
-- 20261004000001_daily_report_export_quota.sql have been reviewed and installed.
-- Do not run this migration against a project until the owner authorizes it.
begin;

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
  tenant_plan text;
  tenant_timezone text;
  local_now timestamp without time zone;
  v_local_date date;
  daily_used integer;
  daily_limit constant integer := 3;
  reset_at timestamptz;
  monthly_result jsonb;
  current_instant timestamptz := clock_timestamp();
begin
  select coalesce(plan, 'starter'), coalesce(nullif(timezone, ''), 'America/Managua')
    into tenant_plan, tenant_timezone
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

  monthly_result := public.consume_monthly_report_export(target_tenant_id, current_instant);
  if coalesce((monthly_result->>'allowed')::boolean, false) is not true then
    return monthly_result || jsonb_build_object('timezone', tenant_timezone);
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
    'monthlyUsed', (monthly_result->>'used')::integer,
    'monthlyLimit', (monthly_result->>'limit')::integer,
    'month', monthly_result->>'month',
    'localDate', v_local_date,
    'resetAt', reset_at,
    'timezone', tenant_timezone
  );
end;
$$;

revoke all on function public.consume_financial_report_export(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_financial_report_export(uuid, uuid) to service_role;

commit;

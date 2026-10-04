-- Atomic monthly quota for financial report exports.
-- The daily quota is applied by 20261004000002_atomic_financial_report_exports.sql.
-- Do not run this migration against a project until the owner authorizes it.
begin;

create or replace function public.consume_monthly_report_export(
  target_tenant_id uuid,
  target_at timestamptz default clock_timestamp()
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
  local_date date;
  month_key text;
  monthly_limit integer;
  monthly_used integer;
  next_monthly_used integer;
  current_instant timestamptz := target_at;
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
  local_date := local_now::date;
  month_key := to_char(local_date, 'YYYY-MM');
  monthly_limit := case tenant_plan
    when 'growth' then 100
    when 'scale' then 2147483647
    else 10
  end;

  insert into public.entitlement_usage (tenant_id, month, monthly_exports, updated_at)
  values (target_tenant_id, month_key, 0, current_instant)
  on conflict (tenant_id, month) do nothing;

  select monthly_exports
    into monthly_used
    from public.entitlement_usage
   where tenant_id = target_tenant_id
     and month = month_key
   for update;
  monthly_used := coalesce(monthly_used, 0);

  if monthly_used >= monthly_limit then
    return jsonb_build_object(
      'allowed', false,
      'code', 'MONTHLY_EXPORT_LIMIT',
      'used', monthly_used,
      'limit', monthly_limit,
      'month', month_key,
      'timezone', tenant_timezone
    );
  end if;

  next_monthly_used := monthly_used + 1;
  update public.entitlement_usage
     set monthly_exports = next_monthly_used,
         updated_at = current_instant
   where tenant_id = target_tenant_id
     and month = month_key;

  return jsonb_build_object(
    'allowed', true,
    'used', next_monthly_used,
    'previousUsed', monthly_used,
    'limit', monthly_limit,
    'month', month_key,
    'timezone', tenant_timezone
  );
end;
$$;

revoke all on function public.consume_monthly_report_export(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_monthly_report_export(uuid, timestamptz) to service_role;

commit;

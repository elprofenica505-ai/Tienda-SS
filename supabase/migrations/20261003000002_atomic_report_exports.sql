-- Serialize monthly report-export usage so concurrent requests cannot exceed a plan quota.
begin;

create or replace function public.increment_entitlement_monthly_exports(
  target_tenant_id uuid,
  target_month text,
  target_limit integer default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  incremented integer;
begin
  if target_tenant_id is null
    or target_month !~ '^\d{4}-\d{2}$'
    or (target_limit is not null and target_limit <= 0) then
    raise exception 'INVALID_EXPORT_USAGE';
  end if;

  insert into public.entitlement_usage (tenant_id, month, monthly_exports, updated_at)
  values (target_tenant_id, target_month, 1, now())
  on conflict (tenant_id, month) do update
    set monthly_exports = entitlement_usage.monthly_exports + 1,
        updated_at = now()
    where target_limit is null or entitlement_usage.monthly_exports < target_limit
  returning monthly_exports into incremented;

  if incremented is null then
    raise exception 'ENTITLEMENT_EXCEEDED:monthlyExports:%', target_limit using errcode = 'P0001';
  end if;

  return incremented;
end;
$$;

revoke all on function public.increment_entitlement_monthly_exports(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.increment_entitlement_monthly_exports(uuid, text, integer) to service_role;

commit;

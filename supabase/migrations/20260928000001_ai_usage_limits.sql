-- Fase 1: límites diarios de consultas de IA por empresa y plan.
-- Los límites se administran en ai_plan_limits; las operaciones de uso pasan
-- exclusivamente por RPCs server-side usando la clave service role.

begin;

create table if not exists public.ai_plan_limits (
  plan text primary key check (plan in ('starter', 'growth', 'scale')),
  daily_query_limit integer not null check (daily_query_limit >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.ai_plan_limits (plan, daily_query_limit, active)
values
  ('starter', 20, true),
  ('growth', 100, true),
  ('scale', 500, true)
on conflict (plan) do nothing;

create table if not exists public.ai_usage_daily (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  usage_date date not null,
  query_count integer not null default 0 check (query_count >= 0),
  last_reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, usage_date)
);

create index if not exists ai_usage_daily_date_idx
  on public.ai_usage_daily (usage_date desc);

alter table public.ai_plan_limits enable row level security;
alter table public.ai_usage_daily enable row level security;

revoke all on table public.ai_plan_limits from public, anon, authenticated;
revoke all on table public.ai_usage_daily from public, anon, authenticated;

create or replace function public.get_ai_usage_status(target_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tenant_plan text;
  tenant_status text;
  tenant_timezone text;
  plan_limit integer;
  local_now timestamp without time zone;
  current_usage_date date;
  next_reset timestamptz;
  used_count integer := 0;
  reset_time timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;

  select t.plan, t.status, t.timezone
    into tenant_plan, tenant_status, tenant_timezone
  from public.tenants t
  where t.id = target_tenant_id;

  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  if tenant_status <> 'active' then raise exception 'TENANT_INACTIVE'; end if;

  tenant_plan := lower(coalesce(nullif(trim(tenant_plan), ''), 'starter'));
  if tenant_plan not in ('starter', 'growth', 'scale') then tenant_plan := 'starter'; end if;

  select l.daily_query_limit into plan_limit
  from public.ai_plan_limits l
  where l.plan = tenant_plan and l.active;

  if not found then raise exception 'AI_LIMIT_CONFIGURATION_MISSING'; end if;

  if not exists (select 1 from pg_timezone_names z where z.name = tenant_timezone) then
    tenant_timezone := 'America/Managua';
  end if;

  local_now := clock_timestamp() at time zone tenant_timezone;
  current_usage_date := local_now::date;
  next_reset := ((current_usage_date + 1)::timestamp without time zone) at time zone tenant_timezone;

  select u.query_count, u.last_reset_at
    into used_count, reset_time
  from public.ai_usage_daily u
  where u.tenant_id = target_tenant_id and u.usage_date = current_usage_date;

  used_count := coalesce(used_count, 0);

  return jsonb_build_object(
    'tenantId', target_tenant_id,
    'plan', tenant_plan,
    'usageDate', current_usage_date,
    'dailyLimit', plan_limit,
    'used', used_count,
    'remaining', greatest(0, plan_limit - used_count),
    'lastResetAt', reset_time,
    'nextResetAt', next_reset
  );
end;
$$;

create or replace function public.consume_ai_query(target_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tenant_plan text;
  tenant_status text;
  tenant_timezone text;
  plan_limit integer;
  current_now timestamptz := clock_timestamp();
  local_now timestamp without time zone;
  current_usage_date date;
  next_reset timestamptz;
  used_count integer;
  reset_time timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;

  select t.plan, t.status, t.timezone
    into tenant_plan, tenant_status, tenant_timezone
  from public.tenants t
  where t.id = target_tenant_id;

  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  if tenant_status <> 'active' then raise exception 'TENANT_INACTIVE'; end if;

  tenant_plan := lower(coalesce(nullif(trim(tenant_plan), ''), 'starter'));
  if tenant_plan not in ('starter', 'growth', 'scale') then tenant_plan := 'starter'; end if;

  select l.daily_query_limit into plan_limit
  from public.ai_plan_limits l
  where l.plan = tenant_plan and l.active;

  if not found then raise exception 'AI_LIMIT_CONFIGURATION_MISSING'; end if;

  if not exists (select 1 from pg_timezone_names z where z.name = tenant_timezone) then
    tenant_timezone := 'America/Managua';
  end if;

  local_now := current_now at time zone tenant_timezone;
  current_usage_date := local_now::date;
  next_reset := ((current_usage_date + 1)::timestamp without time zone) at time zone tenant_timezone;

  -- El upsert más el bloqueo de fila hacen que dos llamadas simultáneas no
  -- puedan superar el límite diario de la empresa.
  insert into public.ai_usage_daily (tenant_id, usage_date, query_count, last_reset_at, updated_at)
  values (target_tenant_id, current_usage_date, 0, current_now, current_now)
  on conflict (tenant_id, usage_date) do nothing;

  select u.query_count, u.last_reset_at
    into used_count, reset_time
  from public.ai_usage_daily u
  where u.tenant_id = target_tenant_id and u.usage_date = current_usage_date
  for update;

  if used_count >= plan_limit then
    return jsonb_build_object(
      'allowed', false,
      'tenantId', target_tenant_id,
      'plan', tenant_plan,
      'usageDate', current_usage_date,
      'dailyLimit', plan_limit,
      'used', used_count,
      'remaining', 0,
      'lastResetAt', reset_time,
      'nextResetAt', next_reset
    );
  end if;

  update public.ai_usage_daily u
  set query_count = u.query_count + 1,
      updated_at = current_now
  where u.tenant_id = target_tenant_id and u.usage_date = current_usage_date
  returning u.query_count, u.last_reset_at into used_count, reset_time;

  return jsonb_build_object(
    'allowed', true,
    'tenantId', target_tenant_id,
    'plan', tenant_plan,
    'usageDate', current_usage_date,
    'dailyLimit', plan_limit,
    'used', used_count,
    'remaining', greatest(0, plan_limit - used_count),
    'lastResetAt', reset_time,
    'nextResetAt', next_reset
  );
end;
$$;

revoke all on function public.get_ai_usage_status(uuid) from public, anon, authenticated;
revoke all on function public.consume_ai_query(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_usage_status(uuid) to service_role;
grant execute on function public.consume_ai_query(uuid) to service_role;

comment on table public.ai_plan_limits is 'Editable daily AI query limits by subscription plan.';
comment on table public.ai_usage_daily is 'Daily AI query count and first-use reset timestamp per tenant.';
comment on function public.consume_ai_query(uuid) is 'Atomically checks and consumes one daily AI query before calling an AI provider.';

commit;

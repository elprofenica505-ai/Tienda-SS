-- Conexia IA: configuración cifrada BYOK, historial y cuota diaria por empresa.
--
-- La versión 20261007000001 ya está ocupada por quotes_crm_phase1.sql en este
-- proyecto. Esta migración usa la siguiente versión disponible después de las
-- migraciones ya presentes para conservar el historial inmutable y no bloquear
-- el despliegue de Supabase.

begin;

create table if not exists public.tenant_ai_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  provider text not null default 'gemini' check (provider = 'gemini'),
  -- Nunca se almacena una clave de Gemini en claro. La aplicación cifra este
  -- valor con AES-256-GCM antes de escribirlo usando AI_ENCRYPTION_KEY.
  api_key_encrypted text,
  personality text not null default 'conexia'
    check (personality in ('conexia', 'financial', 'sales', 'inventory', 'custom')),
  daily_limit integer not null default 20 check (daily_limit between 1 and 100),
  enabled boolean not null default true,
  custom_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_daily_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Día civil fijo de America/Managua. No depende de la zona horaria del
  -- navegador ni de una sucursal, para que la cuota sea consistente.
  local_date date not null,
  query_count integer not null default 0 check (query_count between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, local_date)
);

create table if not exists public.ai_chat_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 10000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_daily_usage_local_date_idx
  on public.ai_chat_daily_usage (local_date desc);
create index if not exists ai_chat_history_tenant_created_idx
  on public.ai_chat_history (tenant_id, created_at desc);

-- Estas tablas contienen secretos cifrados e historial financiero. Se accede
-- exclusivamente desde rutas de servidor autenticadas con service_role.
alter table public.tenant_ai_config enable row level security;
alter table public.ai_chat_daily_usage enable row level security;
alter table public.ai_chat_history enable row level security;

revoke all on table public.tenant_ai_config from public, anon, authenticated;
revoke all on table public.ai_chat_daily_usage from public, anon, authenticated;
revoke all on table public.ai_chat_history from public, anon, authenticated;

grant select, insert, update, delete on table public.tenant_ai_config to service_role;
grant select, insert, update on table public.ai_chat_daily_usage to service_role;
grant select, insert, update, delete on table public.ai_chat_history to service_role;

-- Consume de forma atómica una consulta gratuita. Se bloquea la fila del
-- tenant antes del contador diario para serializar peticiones simultáneas de
-- distintas sesiones del mismo negocio.
create or replace function public.consume_ai_chat_quota(
  target_tenant_id uuid,
  target_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_instant timestamptz := clock_timestamp();
  v_local_date date := (current_instant at time zone 'America/Managua')::date;
  reset_at timestamptz := ((v_local_date + 1)::timestamp without time zone at time zone 'America/Managua');
  effective_limit integer := coalesce(target_limit, 20);
  current_count integer;
begin
  if effective_limit < 1 or effective_limit > 100 then
    raise exception 'AI_CHAT_LIMIT_INVALID';
  end if;

  perform 1
    from public.tenants
   where id = target_tenant_id
   for update;
  if not found then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  insert into public.ai_chat_daily_usage (tenant_id, local_date, query_count, created_at, updated_at)
  values (target_tenant_id, v_local_date, 0, current_instant, current_instant)
  on conflict (tenant_id, local_date) do nothing;

  select usage.query_count
    into current_count
    from public.ai_chat_daily_usage as usage
   where usage.tenant_id = target_tenant_id
     and usage.local_date = v_local_date
   for update;
  current_count := coalesce(current_count, 0);

  if current_count >= effective_limit then
    return jsonb_build_object(
      'allowed', false,
      'code', 'AI_DAILY_LIMIT',
      'used', current_count,
      'limit', effective_limit,
      'remaining', 0,
      'localDate', v_local_date,
      'resetAt', reset_at,
      'timezone', 'America/Managua'
    );
  end if;

  current_count := current_count + 1;
  update public.ai_chat_daily_usage
     set query_count = current_count,
         updated_at = current_instant
   where tenant_id = target_tenant_id
     and local_date = v_local_date;

  return jsonb_build_object(
    'allowed', true,
    'used', current_count,
    'limit', effective_limit,
    'remaining', greatest(effective_limit - current_count, 0),
    'localDate', v_local_date,
    'resetAt', reset_at,
    'timezone', 'America/Managua'
  );
end;
$$;

-- Libera una consulta que se reservó antes de un error de Gemini. El contador
-- nunca baja de cero y sólo toca el día vigente de America/Managua.
create or replace function public.release_ai_chat_quota(
  target_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_instant timestamptz := clock_timestamp();
  v_local_date date := (current_instant at time zone 'America/Managua')::date;
  current_count integer := 0;
begin
  update public.ai_chat_daily_usage
     set query_count = greatest(query_count - 1, 0),
         updated_at = current_instant
   where tenant_id = target_tenant_id
     and local_date = v_local_date
   returning query_count into current_count;

  current_count := coalesce(current_count, 0);
  return jsonb_build_object(
    'released', true,
    'used', current_count,
    'localDate', v_local_date,
    'timezone', 'America/Managua'
  );
end;
$$;

revoke all on function public.consume_ai_chat_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_ai_chat_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_chat_quota(uuid, integer) to service_role;
grant execute on function public.release_ai_chat_quota(uuid) to service_role;

comment on table public.tenant_ai_config is 'Encrypted Gemini BYOK configuration for one ConexiaX tenant.';
comment on table public.ai_chat_daily_usage is 'Atomic daily Conexia free-tier quota, reset in America/Managua.';
comment on table public.ai_chat_history is 'Tenant-scoped conversation history for Conexia IA.';

commit;

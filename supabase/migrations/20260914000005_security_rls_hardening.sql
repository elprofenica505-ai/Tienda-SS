begin;

-- Todas las tablas expuestas al esquema public quedan protegidas por RLS.
alter table public.rate_limit_buckets enable row level security;
alter table public.platform_audit enable row level security;
alter table public.api_keys enable row level security;
alter table public.integration_events enable row level security;
alter table public.billing_events enable row level security;

-- Estas tablas son de backend y no deben ser accesibles directamente desde PostgREST.
revoke all on table public.rate_limit_buckets from anon, authenticated;
revoke all on table public.platform_audit from authenticated;

-- El onboarding se realiza exclusivamente mediante create_initial_tenant.
drop policy if exists tenants_insert_authenticated on public.tenants;
revoke insert on table public.tenants from authenticated;

commit;

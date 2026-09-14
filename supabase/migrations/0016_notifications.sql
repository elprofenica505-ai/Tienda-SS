create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users(id) on delete set null,
  unique (id, tenant_id)
);
create index if not exists notifications_tenant_created_idx on public.notifications (tenant_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select, update on table public.notifications to authenticated;
create policy notifications_select_member on public.notifications for select to authenticated using (public.has_tenant_access(tenant_id));
create policy notifications_update_member on public.notifications for update to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

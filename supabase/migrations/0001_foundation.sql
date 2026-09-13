-- ConexiaX / Supabase foundation
-- Migration: 0001_foundation
-- Scope: tenant organization, memberships, branches, warehouses and cash registers.
-- No application data is inserted by this migration.

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  slug text not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  timezone text not null default 'America/Managua',
  currency text not null default 'NIO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_id_legacy_unique unique (id, legacy_firestore_id),
  constraint tenants_slug_unique unique (slug)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  auth_user_id uuid not null,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_auth_user_unique unique (auth_user_id),
  constraint profiles_id_legacy_unique unique (id, legacy_firestore_id)
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  tenant_id uuid not null,
  profile_id uuid not null,
  role text not null default 'solo_lectura',
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_tenant_profile_unique unique (tenant_id, profile_id),
  constraint members_id_tenant_unique unique (id, tenant_id),
  constraint members_id_legacy_unique unique (id, legacy_firestore_id),
  constraint members_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict,
  constraint members_profile_fk foreign key (profile_id) references public.profiles (id) on delete restrict
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  tenant_id uuid not null,
  code text not null,
  name text not null,
  timezone text not null default 'America/Managua',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_tenant_code_unique unique (tenant_id, code),
  constraint branches_id_tenant_unique unique (id, tenant_id),
  constraint branches_id_legacy_unique unique (id, legacy_firestore_id),
  constraint branches_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete restrict
);

create table if not exists public.member_branches (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  tenant_id uuid not null,
  member_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  constraint member_branches_unique unique (tenant_id, member_id, branch_id),
  constraint member_branches_id_tenant_unique unique (id, tenant_id),
  constraint member_branches_id_legacy_unique unique (id, legacy_firestore_id),
  constraint member_branches_member_fk foreign key (member_id, tenant_id)
    references public.members (id, tenant_id) on delete cascade,
  constraint member_branches_branch_fk foreign key (branch_id, tenant_id)
    references public.branches (id, tenant_id) on delete cascade
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  tenant_id uuid not null,
  branch_id uuid not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_tenant_code_unique unique (tenant_id, code),
  constraint warehouses_id_tenant_unique unique (id, tenant_id),
  constraint warehouses_id_legacy_unique unique (id, legacy_firestore_id),
  constraint warehouses_branch_fk foreign key (branch_id, tenant_id)
    references public.branches (id, tenant_id) on delete restrict
);

create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  legacy_firestore_id text,
  tenant_id uuid not null,
  branch_id uuid not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_registers_tenant_code_unique unique (tenant_id, code),
  constraint cash_registers_id_tenant_unique unique (id, tenant_id),
  constraint cash_registers_id_legacy_unique unique (id, legacy_firestore_id),
  constraint cash_registers_branch_fk foreign key (branch_id, tenant_id)
    references public.branches (id, tenant_id) on delete restrict
);

create index if not exists members_tenant_status_idx
  on public.members (tenant_id, status);
create index if not exists members_profile_status_idx
  on public.members (profile_id, status);
create index if not exists member_branches_tenant_member_idx
  on public.member_branches (tenant_id, member_id);
create index if not exists member_branches_tenant_branch_idx
  on public.member_branches (tenant_id, branch_id);
create index if not exists branches_tenant_active_name_idx
  on public.branches (tenant_id, active, name);
create index if not exists warehouses_tenant_branch_active_idx
  on public.warehouses (tenant_id, branch_id, active);
create index if not exists cash_registers_tenant_branch_active_idx
  on public.cash_registers (tenant_id, branch_id, active);

-- SECURITY DEFINER helpers read membership through the owner context so RLS
-- policies can safely consult membership without recursive policy evaluation.
create or replace function public.current_auth_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

create or replace function public.is_active_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    join public.profiles p on p.id = m.profile_id
    where m.tenant_id = target_tenant_id
      and m.status = 'active'
      and p.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    join public.profiles p on p.id = m.profile_id
    where m.tenant_id = target_tenant_id
      and m.status = 'active'
      and p.auth_user_id = auth.uid()
      and m.role in ('owner', 'admin', 'gerente', 'jefe')
  );
$$;

create or replace function public.has_active_branch_access(target_tenant_id uuid, target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_tenant_admin(target_tenant_id)
    or exists (
      select 1
      from public.member_branches mb
      join public.members m on m.id = mb.member_id and m.tenant_id = mb.tenant_id
      join public.profiles p on p.id = m.profile_id
      where mb.tenant_id = target_tenant_id
        and mb.branch_id = target_branch_id
        and m.status = 'active'
        and p.auth_user_id = auth.uid()
    );
$$;

revoke all on table
  public.tenants,
  public.profiles,
  public.members,
  public.member_branches,
  public.branches,
  public.warehouses,
  public.cash_registers
from anon, authenticated;

grant select on table
  public.tenants,
  public.profiles,
  public.members,
  public.member_branches,
  public.branches,
  public.warehouses,
  public.cash_registers
to authenticated;

grant insert on table public.tenants, public.profiles to authenticated;
grant insert, update on table public.members, public.member_branches, public.branches, public.warehouses, public.cash_registers to authenticated;

grant execute on function public.current_auth_user_id() to anon, authenticated;
grant execute on function public.is_active_tenant_member(uuid) to anon, authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.has_active_branch_access(uuid, uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.member_branches enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.cash_registers enable row level security;

create policy tenants_select_member
  on public.tenants for select to authenticated
  using (public.is_active_tenant_member(id));

-- Required for the initial onboarding flow; the backend must create the
-- initial member in the same trusted transaction or server-side operation.
create policy tenants_insert_authenticated
  on public.tenants for insert to authenticated
  with check (true);

create policy profiles_select_self
  on public.profiles for select to authenticated
  using (auth_user_id = auth.uid());

create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy members_select_member
  on public.members for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

create policy members_insert_admin
  on public.members for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy members_update_admin
  on public.members for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy member_branches_select_member
  on public.member_branches for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

create policy member_branches_insert_admin
  on public.member_branches for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy member_branches_update_admin
  on public.member_branches for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy member_branches_delete_admin
  on public.member_branches for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy branches_select_member
  on public.branches for select to authenticated
  using (public.is_active_tenant_member(tenant_id));

create policy branches_insert_admin
  on public.branches for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy branches_update_admin
  on public.branches for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy warehouses_select_branch_member
  on public.warehouses for select to authenticated
  using (public.has_active_branch_access(tenant_id, branch_id));

create policy warehouses_insert_admin
  on public.warehouses for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy warehouses_update_admin
  on public.warehouses for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy cash_registers_select_branch_member
  on public.cash_registers for select to authenticated
  using (public.has_active_branch_access(tenant_id, branch_id));

create policy cash_registers_insert_admin
  on public.cash_registers for insert to authenticated
  with check (public.is_tenant_admin(tenant_id));

create policy cash_registers_update_admin
  on public.cash_registers for update to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

comment on table public.tenants is 'Tenant root for ConexiaX multi-tenant data.';
comment on table public.members is 'Active tenant membership and role assignment.';
comment on table public.member_branches is 'Explicit branch scope for non-administrative members.';
comment on function public.is_active_tenant_member(uuid) is 'RLS helper: current authenticated user has an active membership in the tenant.';
comment on function public.is_tenant_admin(uuid) is 'RLS helper: current authenticated user has an administrative tenant role.';
comment on function public.has_active_branch_access(uuid, uuid) is 'RLS helper: current user can access the branch through admin scope or member_branches.';

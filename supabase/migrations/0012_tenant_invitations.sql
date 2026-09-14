-- Supabase-only tenant invitations.
create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  last_sent_at timestamptz,
  resend_count integer not null default 0 check (resend_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email, status)
);
create index if not exists tenant_invitations_tenant_status_idx on public.tenant_invitations (tenant_id, status, created_at desc);
create index if not exists tenant_invitations_token_hash_idx on public.tenant_invitations (token_hash);
alter table public.tenant_invitations enable row level security;
revoke all on table public.tenant_invitations from anon, authenticated;
grant select, insert, update on table public.tenant_invitations to authenticated;
drop policy if exists tenant_invitations_select_member on public.tenant_invitations;
create policy tenant_invitations_select_member on public.tenant_invitations for select to authenticated using (public.has_tenant_access(tenant_id));
drop policy if exists tenant_invitations_write_admin on public.tenant_invitations;
create policy tenant_invitations_write_admin on public.tenant_invitations for insert to authenticated with check (public.has_tenant_admin_access(tenant_id));
create policy tenant_invitations_update_admin on public.tenant_invitations for update to authenticated using (public.has_tenant_admin_access(tenant_id)) with check (public.has_tenant_admin_access(tenant_id));

create or replace function public.accept_tenant_invitation(target_token_hash text, target_user_id uuid, target_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invitation_row public.tenant_invitations%rowtype; profile_id uuid; active_count integer; result_name text;
begin
  select * into invitation_row from public.tenant_invitations where token_hash=target_token_hash for update;
  if not found or invitation_row.status <> 'pending' or invitation_row.expires_at <= now() then raise exception 'INVITATION_NOT_AVAILABLE'; end if;
  if lower(coalesce((select email from auth.users where id=target_user_id),'')) <> lower(invitation_row.email) then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;
  if exists(select 1 from public.members m join public.profiles p on p.id=m.profile_id where m.tenant_id=invitation_row.tenant_id and p.auth_user_id=target_user_id and m.status in ('active','disabled')) then raise exception 'ALREADY_MEMBER'; end if;
  select count(*) into active_count from public.members where tenant_id=invitation_row.tenant_id and status='active';
  if active_count >= 100 then raise exception 'ENTITLEMENT_EXCEEDED:members:100'; end if;
  profile_id := target_user_id;
  result_name := coalesce(nullif(left(target_name,120),''), split_part(invitation_row.email,'@',1));
  insert into public.profiles(id,auth_user_id,email,display_name) select target_user_id,target_user_id,email,result_name from auth.users where id=target_user_id on conflict (auth_user_id) do update set email=excluded.email,display_name=excluded.display_name,updated_at=now();
  insert into public.members(tenant_id,profile_id,role,status) values(invitation_row.tenant_id,profile_id,invitation_row.role,'active');
  update public.tenant_invitations set status='accepted',accepted_by=target_user_id,accepted_at=now(),updated_at=now() where id=invitation_row.id;
  return jsonb_build_object('tenantId',invitation_row.tenant_id,'invitationId',invitation_row.id,'uid',target_user_id,'role',invitation_row.role,'status','accepted');
end; $$;
revoke all on function public.accept_tenant_invitation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_tenant_invitation(text,uuid,text) to service_role;

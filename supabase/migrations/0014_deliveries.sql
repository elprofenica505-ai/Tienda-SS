create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  sale_id uuid not null,
  branch_id uuid not null,
  customer_id uuid,
  customer_name text not null default 'Cliente mostrador',
  address text not null default '',
  driver_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','delivered')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (id, tenant_id),
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete restrict,
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete set null
);
create index if not exists deliveries_tenant_created_idx on public.deliveries (tenant_id, created_at desc);
create index if not exists deliveries_driver_status_idx on public.deliveries (tenant_id, driver_id, status, created_at desc);
alter table public.deliveries enable row level security;
revoke all on table public.deliveries from anon, authenticated;
grant select on table public.deliveries to authenticated;
create policy deliveries_select_member on public.deliveries for select to authenticated using (public.has_tenant_access(tenant_id));

create or replace function public.create_delivery(target_tenant_id uuid,target_sale_id uuid,target_driver_id uuid,target_address text,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare sale_row public.sales%rowtype; customer_row public.customers%rowtype; delivery_id uuid:=gen_random_uuid(); address_value text:=left(trim(coalesce(target_address,'')),300);
begin
  select * into sale_row from public.sales where id=target_sale_id and tenant_id=target_tenant_id for share;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if sale_row.status in ('voided','pending') then raise exception 'SALE_NOT_AVAILABLE'; end if;
  if sale_row.customer_id is not null then select * into customer_row from public.customers where id=sale_row.customer_id and tenant_id=target_tenant_id; end if;
  insert into public.deliveries(id,tenant_id,sale_id,branch_id,customer_id,customer_name,address,driver_id,created_by,updated_by)
    values(delivery_id,target_tenant_id,sale_row.id,sale_row.branch_id,sale_row.customer_id,coalesce(customer_row.name,'Cliente mostrador'),address_value,target_driver_id,target_user_id,target_user_id);
  return jsonb_build_object('id',delivery_id,'saleId',sale_row.id,'branchId',sale_row.branch_id,'customerId',sale_row.customer_id,'customerName',coalesce(customer_row.name,'Cliente mostrador'),'address',address_value,'driverUid',target_driver_id,'status','pending');
end; $$;
revoke all on function public.create_delivery(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.create_delivery(uuid,uuid,uuid,text,uuid) to service_role;

create or replace function public.update_delivery_status(target_tenant_id uuid,target_delivery_id uuid,target_status text,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare delivery_row public.deliveries%rowtype; delivered_time timestamptz;
begin
  if target_status not in ('pending','delivered') then raise exception 'INVALID_DELIVERY_STATUS'; end if;
  select * into delivery_row from public.deliveries where id=target_delivery_id and tenant_id=target_tenant_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if delivery_row.driver_id is not null and delivery_row.driver_id <> target_user_id and not public.has_tenant_admin_access(target_tenant_id) then raise exception 'DELIVERY_OUT_OF_SCOPE'; end if;
  delivered_time := case when target_status='delivered' then now() else null end;
  update public.deliveries set status=target_status,delivered_at=delivered_time,updated_by=target_user_id,updated_at=now() where id=target_delivery_id and tenant_id=target_tenant_id;
  return jsonb_build_object('id',target_delivery_id,'status',target_status,'deliveredAt',delivered_time);
end; $$;
revoke all on function public.update_delivery_status(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.update_delivery_status(uuid,uuid,text,uuid) to service_role;

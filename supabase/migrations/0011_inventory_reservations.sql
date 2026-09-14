-- Supabase-only inventory reservations.
-- Reservations reduce available quantity and increase reserved_quantity atomically.
create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  warehouse_id uuid not null,
  items jsonb not null default '[]'::jsonb,
  reason text not null default 'Reserva de stock',
  status text not null default 'active' check (status in ('active','released','expired','consumed')),
  created_by uuid references auth.users(id) on delete set null,
  released_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  released_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);
create index if not exists inventory_reservations_tenant_status_idx
  on public.inventory_reservations (tenant_id, status, created_at desc);
alter table public.inventory_reservations enable row level security;
revoke all on table public.inventory_reservations from anon, authenticated;
grant select on table public.inventory_reservations to authenticated;
drop policy if exists inventory_reservations_select_member on public.inventory_reservations;
create policy inventory_reservations_select_member on public.inventory_reservations
  for select to authenticated using (public.has_tenant_access(tenant_id));

create or replace function public.reserve_inventory(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_user_id uuid,
  target_items jsonb,
  target_reason text default 'Reserva de stock'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  item jsonb;
  product_id uuid;
  requested numeric;
  stock_row public.inventory_stocks%rowtype;
  product_row public.products%rowtype;
  reservation_id uuid := gen_random_uuid();
  reservation_items jsonb := '[]'::jsonb;
  next_quantity numeric;
  reason_value text := coalesce(nullif(left(target_reason, 300), ''), 'Reserva de stock');
begin
  if not public.has_tenant_access(target_tenant_id) and current_user <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if not public.has_active_branch_access(target_tenant_id, target_branch_id) and current_user <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(target_items) <> 'array' then raise exception 'RESERVATION_ITEMS_REQUIRED'; end if;
  for item in select value from jsonb_array_elements(target_items) loop
    product_id := nullif(item->>'productId', '')::uuid;
    requested := (item->>'quantity')::numeric;
    if product_id is null or requested is null or requested <= 0 then continue; end if;
    if requested <> trunc(requested) then raise exception 'INVALID_RESERVATION_QUANTITY'; end if;
    select * into product_row from public.products where id=product_id and tenant_id=target_tenant_id for share;
    if not found or product_row.active=false then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if product_row.item_type='service' then continue; end if;
    select * into stock_row from public.inventory_stocks
      where tenant_id=target_tenant_id and product_id=product_id and warehouse_id=target_warehouse_id for update;
    if not found then raise exception 'INSUFFICIENT_WAREHOUSE_STOCK'; end if;
    next_quantity := stock_row.quantity - requested;
    if next_quantity < 0 then raise exception 'INSUFFICIENT_WAREHOUSE_STOCK'; end if;
    update public.inventory_stocks set quantity=next_quantity, reserved_quantity=reserved_quantity+requested, updated_at=now() where id=stock_row.id;
    insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,reference_type,reference_id,performed_by,metadata)
      values(target_tenant_id,product_id,target_warehouse_id,'reservation',-requested,'inventory_reservation',reservation_id,target_user_id,jsonb_build_object('previous_quantity',stock_row.quantity,'new_quantity',next_quantity));
    reservation_items := reservation_items || jsonb_build_array(jsonb_build_object('productId',product_id,'quantity',requested));
  end loop;
  if jsonb_array_length(reservation_items)=0 then raise exception 'RESERVATION_EMPTY'; end if;
  insert into public.inventory_reservations(id,tenant_id,branch_id,warehouse_id,items,reason,status,created_by)
    values(reservation_id,target_tenant_id,target_branch_id,target_warehouse_id,reservation_items,reason_value,'active',target_user_id);
  return jsonb_build_object('reservationId',reservation_id,'branchId',target_branch_id,'warehouseId',target_warehouse_id,'items',reservation_items,'status','active');
end; $$;
revoke all on function public.reserve_inventory(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_inventory(uuid,uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.release_inventory_reservation(
  target_tenant_id uuid,
  target_reservation_id uuid,
  target_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  reservation_row public.inventory_reservations%rowtype;
  item jsonb;
  product_id uuid;
  released_quantity numeric;
  stock_row public.inventory_stocks%rowtype;
  next_quantity numeric;
begin
  if not public.has_tenant_access(target_tenant_id) and current_user <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into reservation_row from public.inventory_reservations where id=target_reservation_id and tenant_id=target_tenant_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if reservation_row.status <> 'active' then raise exception 'RESERVATION_CLOSED'; end if;
  if not public.has_active_branch_access(target_tenant_id,reservation_row.branch_id) and current_user <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  for item in select value from jsonb_array_elements(reservation_row.items) loop
    product_id := nullif(item->>'productId', '')::uuid;
    released_quantity := (item->>'quantity')::numeric;
    if product_id is null or released_quantity is null or released_quantity <= 0 then continue; end if;
    select * into stock_row from public.inventory_stocks where tenant_id=target_tenant_id and product_id=product_id and warehouse_id=reservation_row.warehouse_id for update;
    if not found then raise exception 'STOCK_ROW_NOT_FOUND'; end if;
    next_quantity := stock_row.quantity + released_quantity;
    if stock_row.reserved_quantity < released_quantity then raise exception 'RESERVATION_STOCK_INCONSISTENT'; end if;
    update public.inventory_stocks set quantity=next_quantity, reserved_quantity=reserved_quantity-released_quantity, updated_at=now() where id=stock_row.id;
    insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,reference_type,reference_id,performed_by,metadata)
      values(target_tenant_id,product_id,reservation_row.warehouse_id,'release',released_quantity,'inventory_reservation',target_reservation_id,target_user_id,jsonb_build_object('previous_quantity',stock_row.quantity,'new_quantity',next_quantity));
  end loop;
  update public.inventory_reservations set status='released',released_by=target_user_id,released_at=now(),updated_at=now() where id=target_reservation_id and tenant_id=target_tenant_id;
  return jsonb_build_object('reservationId',target_reservation_id,'branchId',reservation_row.branch_id,'warehouseId',reservation_row.warehouse_id,'status','released');
end; $$;
revoke all on function public.release_inventory_reservation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_inventory_reservation(uuid,uuid,uuid) to service_role;

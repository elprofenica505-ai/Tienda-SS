-- Stage 5: immutable inventory kardex, non-negative stock, and weighted-average valuation.
-- Local development only. Do not apply remotely until PostgreSQL validation is authorized.
begin;

alter table public.inventory_stocks
  add column if not exists average_cost numeric(14,4) not null default 0 check (average_cost >= 0);

alter table public.inventory_movements
  add column if not exists previous_quantity numeric(14,4),
  add column if not exists new_quantity numeric(14,4),
  add column if not exists previous_average_cost numeric(14,4),
  add column if not exists new_average_cost numeric(14,4);

-- Existing rows are retained; future rows receive explicit before/after balances.
update public.inventory_movements
   set previous_quantity = coalesce((metadata->>'previous_quantity')::numeric, quantity * -1),
       new_quantity = coalesce((metadata->>'new_quantity')::numeric, quantity),
       previous_average_cost = coalesce((metadata->>'previous_average_cost')::numeric, unit_cost),
       new_average_cost = coalesce((metadata->>'new_average_cost')::numeric, unit_cost)
 where previous_quantity is null or new_quantity is null;

alter table public.inventory_movements
  alter column previous_quantity set default 0,
  alter column new_quantity set default 0,
  alter column previous_average_cost set default 0,
  alter column new_average_cost set default 0;

create index if not exists inventory_movements_kardex_idx
  on public.inventory_movements (tenant_id, product_id, warehouse_id, created_at, id);

create or replace function public.inventory_movement_kardex_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare current_stock numeric; current_cost numeric;
begin
  if new.quantity = 0 then raise exception 'INVENTORY_MOVEMENT_ZERO'; end if;
  select quantity, average_cost into current_stock, current_cost
    from public.inventory_stocks
   where tenant_id = new.tenant_id and product_id = new.product_id and warehouse_id = new.warehouse_id;
  current_stock := coalesce(current_stock, 0);
  current_cost := coalesce(current_cost, new.unit_cost, 0);
  new.previous_quantity := coalesce((new.metadata->>'previous_quantity')::numeric, current_stock);
  new.new_quantity := coalesce((new.metadata->>'new_quantity')::numeric, current_stock + new.quantity);
  new.previous_average_cost := coalesce((new.metadata->>'previous_average_cost')::numeric, current_cost);
  new.new_average_cost := coalesce((new.metadata->>'new_average_cost')::numeric, current_cost);
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'previous_quantity', new.previous_quantity,
    'new_quantity', new.new_quantity,
    'previous_average_cost', new.previous_average_cost,
    'new_average_cost', new.new_average_cost
  );
  if new.new_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_kardex_guard on public.inventory_movements;
create trigger inventory_movements_kardex_guard
before insert on public.inventory_movements
for each row execute function public.inventory_movement_kardex_guard();

create or replace function public.inventory_movement_immutable_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'INVENTORY_KARDEX_IMMUTABLE';
end;
$$;

drop trigger if exists inventory_movements_no_update on public.inventory_movements;
create trigger inventory_movements_no_update
before update or delete on public.inventory_movements
for each row execute function public.inventory_movement_immutable_guard();

-- Single server-side primitive for all future receipts/adjustments. It locks the
-- stock row, rejects negative availability, updates weighted-average cost, and
-- writes the immutable kardex entry with explicit balances.
create or replace function public.apply_inventory_movement(
  target_tenant_id uuid,
  target_product_id uuid,
  target_warehouse_id uuid,
  target_movement_type text,
  target_quantity numeric,
  target_unit_cost numeric,
  target_reference_type text,
  target_reference_id uuid,
  target_user_id uuid,
  target_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare stock_row public.inventory_stocks%rowtype; before_qty numeric; after_qty numeric; before_cost numeric; after_cost numeric; movement_id uuid;
begin
  if target_quantity = 0 then raise exception 'INVENTORY_MOVEMENT_ZERO'; end if;
  select * into stock_row from public.inventory_stocks where tenant_id = target_tenant_id and product_id = target_product_id and warehouse_id = target_warehouse_id for update;
  if not found then
    if target_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
    insert into public.inventory_stocks(tenant_id, product_id, warehouse_id, quantity, average_cost, updated_at) values(target_tenant_id, target_product_id, target_warehouse_id, 0, 0, now()) returning * into stock_row;
  end if;
  before_qty := stock_row.quantity;
  before_cost := coalesce(stock_row.average_cost, 0);
  after_qty := before_qty + target_quantity;
  if after_qty < 0 or stock_row.reserved_quantity > after_qty then raise exception 'INSUFFICIENT_STOCK'; end if;
  after_cost := case when target_quantity > 0 then round(((before_qty * before_cost) + (target_quantity * greatest(coalesce(target_unit_cost, 0), 0))) / greatest(after_qty, 1), 4) else before_cost end;
  update public.inventory_stocks set quantity = after_qty, average_cost = after_cost, updated_at = now() where id = stock_row.id;
  insert into public.inventory_movements(tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, performed_by, metadata, previous_quantity, new_quantity, previous_average_cost, new_average_cost)
  values(target_tenant_id, target_product_id, target_warehouse_id, target_movement_type, target_quantity, greatest(coalesce(target_unit_cost, before_cost), 0), target_reference_type, target_reference_id, target_user_id, coalesce(target_metadata, '{}'::jsonb), before_qty, after_qty, before_cost, after_cost)
  returning id into movement_id;
  return jsonb_build_object('movementId', movement_id, 'previousQuantity', before_qty, 'newQuantity', after_qty, 'previousAverageCost', before_cost, 'newAverageCost', after_cost);
end;
$$;

create or replace function public.adjust_inventory(
  target_tenant_id uuid, target_product_id uuid, target_warehouse_id uuid,
  target_movement_type text, target_quantity numeric, target_reason text, target_user_id uuid
) returns table(previous_quantity numeric, new_quantity numeric, delta numeric, movement_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_quantity numeric; resulting_quantity numeric; calculated_delta numeric; new_movement_id uuid; current_cost numeric;
begin
  if target_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if target_movement_type not in ('receive', 'remove', 'set') then raise exception 'INVALID_MOVEMENT_TYPE'; end if;
  select quantity, average_cost into current_quantity, current_cost from public.inventory_stocks where tenant_id = target_tenant_id and product_id = target_product_id and warehouse_id = target_warehouse_id for update;
  current_quantity := coalesce(current_quantity, 0); current_cost := coalesce(current_cost, 0);
  resulting_quantity := case when target_movement_type = 'receive' then current_quantity + target_quantity when target_movement_type = 'remove' then current_quantity - target_quantity else target_quantity end;
  if resulting_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  calculated_delta := resulting_quantity - current_quantity;
  insert into public.inventory_stocks(tenant_id, product_id, warehouse_id, quantity, average_cost, updated_at)
  values(target_tenant_id, target_product_id, target_warehouse_id, resulting_quantity, current_cost, now())
  on conflict (tenant_id, product_id, warehouse_id) do update set quantity = excluded.quantity, average_cost = excluded.average_cost, updated_at = now();
  insert into public.inventory_movements(tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, performed_by, metadata, previous_quantity, new_quantity, previous_average_cost, new_average_cost)
  values(target_tenant_id, target_product_id, target_warehouse_id, 'adjustment', calculated_delta, current_cost, 'manual', target_user_id, jsonb_build_object('reason', target_reason, 'operation', target_movement_type, 'previous_quantity', current_quantity, 'new_quantity', resulting_quantity), current_quantity, resulting_quantity, current_cost, current_cost)
  returning id into new_movement_id;
  return query select current_quantity, resulting_quantity, calculated_delta, new_movement_id;
end;
$$;

revoke all on function public.inventory_movement_kardex_guard() from public, anon, authenticated;
revoke all on function public.inventory_movement_immutable_guard() from public, anon, authenticated;
revoke all on function public.apply_inventory_movement(uuid, uuid, uuid, text, numeric, numeric, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_inventory_movement(uuid, uuid, uuid, text, numeric, numeric, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) to service_role;
revoke update, delete on public.inventory_movements from public, anon, authenticated;

commit;

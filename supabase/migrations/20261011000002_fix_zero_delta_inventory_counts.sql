-- A physical count equal to the current balance is still a valid count.
-- Preserve the non-zero inventory movement invariant by skipping a zero-delta
-- movement while allowing the API to record the count in the immutable audit.
begin;

create or replace function public.adjust_inventory(
  target_tenant_id uuid,
  target_product_id uuid,
  target_warehouse_id uuid,
  target_movement_type text,
  target_quantity numeric,
  target_reason text,
  target_user_id uuid
) returns table(
  previous_quantity numeric,
  new_quantity numeric,
  delta numeric,
  movement_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_quantity numeric;
  current_reserved numeric;
  current_cost numeric;
  resulting_quantity numeric;
  calculated_delta numeric;
  new_movement_id uuid;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_tenant_access(target_tenant_id) then
    raise exception 'FORBIDDEN';
  end if;

  if target_movement_type is null
     or target_movement_type not in ('receive', 'remove', 'set') then
    raise exception 'INVALID_MOVEMENT_TYPE';
  end if;

  if target_quantity is null
     or target_quantity < 0
     or (target_movement_type in ('receive', 'remove') and target_quantity = 0) then
    raise exception 'INVALID_QUANTITY';
  end if;

  if target_warehouse_id is null then
    raise exception 'WAREHOUSE_REQUIRED';
  end if;

  if not exists (
    select 1
      from public.products
     where id = target_product_id
       and tenant_id = target_tenant_id
       and active
  ) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if not exists (
    select 1
      from public.warehouses
     where id = target_warehouse_id
       and tenant_id = target_tenant_id
       and active
  ) then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;

  select quantity, reserved_quantity, average_cost
    into current_quantity, current_reserved, current_cost
    from public.inventory_stocks
   where tenant_id = target_tenant_id
     and product_id = target_product_id
     and warehouse_id = target_warehouse_id
   for update;

  current_quantity := coalesce(current_quantity, 0);
  current_reserved := coalesce(current_reserved, 0);
  current_cost := coalesce(current_cost, 0);

  resulting_quantity := case
    when target_movement_type = 'receive' then current_quantity + target_quantity
    when target_movement_type = 'remove' then current_quantity - target_quantity
    else target_quantity
  end;

  if resulting_quantity < 0 then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  if resulting_quantity < current_reserved then
    raise exception 'INSUFFICIENT_STOCK:RESERVED';
  end if;

  calculated_delta := resulting_quantity - current_quantity;

  insert into public.inventory_stocks (
    tenant_id,
    product_id,
    warehouse_id,
    quantity,
    average_cost,
    updated_at
  )
  values (
    target_tenant_id,
    target_product_id,
    target_warehouse_id,
    resulting_quantity,
    current_cost,
    now()
  )
  on conflict (tenant_id, product_id, warehouse_id)
  do update set
    quantity = excluded.quantity,
    average_cost = excluded.average_cost,
    updated_at = now();

  if calculated_delta <> 0 then
    insert into public.inventory_movements (
      tenant_id,
      product_id,
      warehouse_id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      performed_by,
      metadata,
      previous_quantity,
      new_quantity,
      previous_average_cost,
      new_average_cost
    )
    values (
      target_tenant_id,
      target_product_id,
      target_warehouse_id,
      'adjustment',
      calculated_delta,
      current_cost,
      'manual',
      target_user_id,
      jsonb_build_object(
        'reason', target_reason,
        'operation', target_movement_type,
        'reserved_quantity', current_reserved,
        'previous_quantity', current_quantity,
        'new_quantity', resulting_quantity
      ),
      current_quantity,
      resulting_quantity,
      current_cost,
      current_cost
    )
    returning id into new_movement_id;
  else
    new_movement_id := null;
  end if;

  return query
    select current_quantity, resulting_quantity, calculated_delta, new_movement_id;
end;
$$;

revoke all on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid)
  to service_role;

commit;

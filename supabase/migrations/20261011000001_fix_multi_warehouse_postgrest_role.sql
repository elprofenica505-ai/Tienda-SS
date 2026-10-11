-- Alinea las RPC de inventario multi-almacén con la impersonación de rol de PostgREST.
-- PostgREST mantiene session_user=authenticator y aplica el JWT role con SET LOCAL ROLE;
-- auth.role() reconoce el rol del JWT sin debilitar la guarda para los demás roles.
-- Las definiciones se copian de 20261010000001_multi_warehouse_inventory.sql sin cambiar su lógica.
begin;

create or replace function public.adjust_inventory(
  target_tenant_id uuid,
  target_product_id uuid,
  target_warehouse_id uuid,
  target_movement_type text,
  target_quantity numeric,
  target_reason text,
  target_user_id uuid
) returns table(previous_quantity numeric, new_quantity numeric, delta numeric, movement_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_quantity numeric;
  current_reserved numeric;
  current_cost numeric;
  resulting_quantity numeric;
  calculated_delta numeric;
  new_movement_id uuid;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;
  if target_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if target_movement_type not in ('receive', 'remove', 'set') then raise exception 'INVALID_MOVEMENT_TYPE'; end if;
  if target_warehouse_id is null then raise exception 'WAREHOUSE_REQUIRED'; end if;
  if not exists (select 1 from public.products where id = target_product_id and tenant_id = target_tenant_id and active) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.warehouses where id = target_warehouse_id and tenant_id = target_tenant_id and active) then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;

  select quantity, reserved_quantity, average_cost
    into current_quantity, current_reserved, current_cost
    from public.inventory_stocks
   where tenant_id = target_tenant_id and product_id = target_product_id and warehouse_id = target_warehouse_id
   for update;
  current_quantity := coalesce(current_quantity, 0);
  current_reserved := coalesce(current_reserved, 0);
  current_cost := coalesce(current_cost, 0);

  resulting_quantity := case
    when target_movement_type = 'receive' then current_quantity + target_quantity
    when target_movement_type = 'remove' then current_quantity - target_quantity
    else target_quantity
  end;

  if resulting_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  if resulting_quantity < current_reserved then raise exception 'INSUFFICIENT_STOCK:RESERVED'; end if;

  calculated_delta := resulting_quantity - current_quantity;

  insert into public.inventory_stocks (tenant_id, product_id, warehouse_id, quantity, average_cost, updated_at)
  values (target_tenant_id, target_product_id, target_warehouse_id, resulting_quantity, current_cost, now())
  on conflict (tenant_id, product_id, warehouse_id)
    do update set quantity = excluded.quantity, average_cost = excluded.average_cost, updated_at = now();

  insert into public.inventory_movements (
    tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, performed_by, metadata,
    previous_quantity, new_quantity, previous_average_cost, new_average_cost
  )
  values (
    target_tenant_id, target_product_id, target_warehouse_id, 'adjustment', calculated_delta, current_cost,
    'manual', target_user_id,
    jsonb_build_object(
      'reason', target_reason,
      'operation', target_movement_type,
      'reserved_quantity', current_reserved,
      'previous_quantity', current_quantity,
      'new_quantity', resulting_quantity
    ),
    current_quantity, resulting_quantity, current_cost, current_cost
  )
  returning id into new_movement_id;

  return query select current_quantity, resulting_quantity, calculated_delta, new_movement_id;
end;
$$;

create or replace function public.create_stock_transfer(
  target_tenant_id uuid,
  target_origin_warehouse_id uuid,
  target_destination_warehouse_id uuid,
  target_user_id uuid,
  target_items jsonb,
  target_reason text default 'Transferencia entre almacenes'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  origin_row public.warehouses%rowtype;
  destination_row public.warehouses%rowtype;
  product_row public.products%rowtype;
  item jsonb;
  product_id uuid;
  requested_quantity numeric;
  unit_cost_value numeric;
  transfer_id uuid := gen_random_uuid();
  transfer_number_value text;
  next_sequence integer;
  normalized_items jsonb := '[]'::jsonb;
  seen_products uuid[] := '{}';
  reason_value text := coalesce(nullif(left(coalesce(target_reason, ''), 300), ''), 'Transferencia entre almacenes');
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;
  if target_origin_warehouse_id is null or target_destination_warehouse_id is null then
    raise exception 'WAREHOUSE_REQUIRED';
  end if;
  if target_origin_warehouse_id = target_destination_warehouse_id then
    raise exception 'TRANSFER_SAME_WAREHOUSE';
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select * into origin_row from public.warehouses
   where id = target_origin_warehouse_id and tenant_id = target_tenant_id and active;
  if not found then raise exception 'ORIGIN_WAREHOUSE_NOT_FOUND'; end if;

  select * into destination_row from public.warehouses
   where id = target_destination_warehouse_id and tenant_id = target_tenant_id and active;
  if not found then raise exception 'DESTINATION_WAREHOUSE_NOT_FOUND'; end if;

  for item in select value from jsonb_array_elements(target_items) order by (value->>'productId') nulls last loop
    product_id := nullif(coalesce(item->>'productId', item->>'product_id', ''), '')::uuid;
    requested_quantity := coalesce(nullif(item->>'quantity', '')::numeric, nullif(item->>'qty', '')::numeric);
    unit_cost_value := nullif(item->>'unitCost', '')::numeric;

    if product_id is null or requested_quantity is null then
      raise exception 'INVALID_TRANSFER_ITEM';
    end if;
    if requested_quantity <= 0 or requested_quantity <> trunc(requested_quantity) then
      raise exception 'INVALID_TRANSFER_QUANTITY';
    end if;
    if product_id = any (seen_products) then
      raise exception 'TRANSFER_DUPLICATE_PRODUCT';
    end if;
    seen_products := array_append(seen_products, product_id);

    select * into product_row from public.products
     where id = product_id and tenant_id = target_tenant_id
     for share;
    if not found or not product_row.active then
      raise exception 'PRODUCT_NOT_FOUND:%', product_id::text;
    end if;
    if coalesce(product_row.item_type, 'physical') = 'service' then
      raise exception 'SERVICE_NOT_TRANSFERABLE:%', product_id::text;
    end if;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'productId', product_id,
      'quantity', requested_quantity,
      'unitCost', greatest(coalesce(unit_cost_value, product_row.cost, 0), 0)
    ));
  end loop;

  if jsonb_array_length(normalized_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  -- Numeración por tenant sin riesgo de choque bajo concurrencia.
  perform pg_advisory_xact_lock(hashtext('stock_transfers:' || target_tenant_id::text)::bigint);

  select coalesce(max(substring(transfer_number from 10)::int), 0) + 1
    into next_sequence
    from public.stock_transfers
   where tenant_id = target_tenant_id
     and transfer_number like 'TRF-' || to_char(now(), 'YYYY') || '-%';

  transfer_number_value := 'TRF-' || to_char(now(), 'YYYY') || '-' || lpad(next_sequence::text, 6, '0');

  insert into public.stock_transfers (
    id, tenant_id, transfer_number, origin_branch_id, origin_warehouse_id,
    destination_branch_id, destination_warehouse_id, status, reason, created_by
  )
  values (
    transfer_id, target_tenant_id, transfer_number_value, origin_row.branch_id, origin_row.id,
    destination_row.branch_id, destination_row.id, 'draft', reason_value, target_user_id
  );

  for item in select value from jsonb_array_elements(normalized_items) loop
    insert into public.stock_transfer_items (
      tenant_id, transfer_id, product_id, requested_quantity, shipped_quantity, received_quantity, unit_cost
    )
    values (
      target_tenant_id, transfer_id, (item->>'productId')::uuid,
      (item->>'quantity')::numeric, 0, 0, greatest(coalesce((item->>'unitCost')::numeric, 0), 0)
    );
  end loop;

  return jsonb_build_object(
    'transferId', transfer_id,
    'transferNumber', transfer_number_value,
    'status', 'draft',
    'originBranchId', origin_row.branch_id,
    'originWarehouseId', origin_row.id,
    'destinationBranchId', destination_row.branch_id,
    'destinationWarehouseId', destination_row.id,
    'items', normalized_items
  );
end;
$$;

create or replace function public.approve_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  stock_row public.inventory_stocks%rowtype;
  available_quantity numeric;
  reserved_total numeric := 0;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status <> 'draft' then raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status; end if;

  if not exists (
    select 1 from public.warehouses
     where id = transfer_row.destination_warehouse_id and tenant_id = target_tenant_id and active
  ) then raise exception 'DESTINATION_WAREHOUSE_NOT_FOUND'; end if;

  -- Orden determinista por producto: evita deadlocks entre transferencias cruzadas.
  for item_row in
    select * from public.stock_transfer_items
     where transfer_id = transfer_row.id and tenant_id = target_tenant_id
     order by product_id
     for update
  loop
    select * into stock_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.origin_warehouse_id
     for update;
    if not found then
      raise exception 'INSUFFICIENT_WAREHOUSE_STOCK:%', item_row.product_id::text;
    end if;

    available_quantity := stock_row.quantity - stock_row.reserved_quantity;
    if available_quantity < item_row.requested_quantity then
      raise exception 'INSUFFICIENT_WAREHOUSE_STOCK:%', item_row.product_id::text;
    end if;

    update public.inventory_stocks
       set reserved_quantity = stock_row.reserved_quantity + item_row.requested_quantity,
           updated_at = now()
     where id = stock_row.id;

    reserved_total := reserved_total + item_row.requested_quantity;
  end loop;

  update public.stock_transfers
     set status = 'approved', approved_by = target_user_id, approved_at = now(), updated_at = now()
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', 'approved',
    'originWarehouseId', transfer_row.origin_warehouse_id,
    'destinationWarehouseId', transfer_row.destination_warehouse_id,
    'reservedQuantity', reserved_total
  );
end;
$$;

create or replace function public.dispatch_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  stock_row public.inventory_stocks%rowtype;
  destination_row public.inventory_stocks%rowtype;
  shipped_total numeric := 0;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status <> 'approved' then raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status; end if;

  for item_row in
    select * from public.stock_transfer_items
     where transfer_id = transfer_row.id and tenant_id = target_tenant_id
     order by product_id
     for update
  loop
    select * into stock_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.origin_warehouse_id
     for update;
    if not found then raise exception 'TRANSFER_STOCK_ROW_NOT_FOUND:%', item_row.product_id::text; end if;
    if stock_row.reserved_quantity < item_row.requested_quantity then
      raise exception 'TRANSFER_NOT_APPROVED:%', item_row.product_id::text;
    end if;

    update public.inventory_stocks
       set reserved_quantity = stock_row.reserved_quantity - item_row.requested_quantity,
           updated_at = now()
     where id = stock_row.id;

    perform public.apply_inventory_movement(
      target_tenant_id, item_row.product_id, transfer_row.origin_warehouse_id,
      'transfer_out', -item_row.requested_quantity, item_row.unit_cost,
      'stock_transfer', transfer_row.id, target_user_id,
      jsonb_build_object('transferNumber', transfer_row.transfer_number, 'direction', 'out')
    );

    select * into destination_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.destination_warehouse_id
     for update;
    if not found then
      insert into public.inventory_stocks (
        tenant_id, product_id, warehouse_id, quantity, reserved_quantity, in_transit_quantity, updated_at
      )
      values (target_tenant_id, item_row.product_id, transfer_row.destination_warehouse_id, 0, 0, 0, now())
      returning * into destination_row;
    end if;

    update public.inventory_stocks
       set in_transit_quantity = destination_row.in_transit_quantity + item_row.requested_quantity,
           updated_at = now()
     where id = destination_row.id;

    update public.stock_transfer_items
       set shipped_quantity = item_row.requested_quantity, updated_at = now()
     where id = item_row.id;

    shipped_total := shipped_total + item_row.requested_quantity;
  end loop;

  update public.stock_transfers
     set status = 'in_transit', dispatched_by = target_user_id, dispatched_at = now(), updated_at = now()
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', 'in_transit',
    'originWarehouseId', transfer_row.origin_warehouse_id,
    'destinationWarehouseId', transfer_row.destination_warehouse_id,
    'shippedQuantity', shipped_total
  );
end;
$$;

create or replace function public.receive_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid,
  target_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  destination_row public.inventory_stocks%rowtype;
  item jsonb;
  received_now numeric;
  pending_quantity numeric;
  received_total numeric := 0;
  remaining_lines integer;
  next_status text;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status <> 'in_transit' then raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status; end if;

  for item in select value from jsonb_array_elements(target_items) loop
    received_now := coalesce(
      nullif(item->>'quantity', '')::numeric,
      nullif(item->>'receivedQuantity', '')::numeric
    );
    if received_now is null or received_now <= 0
       or received_now <> trunc(received_now) then
      raise exception 'INVALID_TRANSFER_QUANTITY';
    end if;

    -- La línea se identifica por transferItemId o, en su defecto, por productId.
    select * into item_row from public.stock_transfer_items
     where transfer_id = transfer_row.id
       and tenant_id = target_tenant_id
       and (
         (nullif(item->>'transferItemId', '')::uuid is not null and id = nullif(item->>'transferItemId', '')::uuid)
         or (nullif(item->>'transferItemId', '')::uuid is null and product_id = nullif(coalesce(item->>'productId', item->>'product_id', ''), '')::uuid)
       )
     order by product_id
     for update;
    if not found then raise exception 'TRANSFER_ITEM_NOT_FOUND'; end if;

    pending_quantity := item_row.shipped_quantity - item_row.received_quantity;
    if received_now > pending_quantity then
      raise exception 'RECEIPT_EXCEEDS_PENDING:%', item_row.product_id::text;
    end if;

    select * into destination_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.destination_warehouse_id
     for update;
    if not found then
      insert into public.inventory_stocks (
        tenant_id, product_id, warehouse_id, quantity, reserved_quantity, in_transit_quantity, updated_at
      )
      values (target_tenant_id, item_row.product_id, transfer_row.destination_warehouse_id, 0, 0, 0, now())
      returning * into destination_row;
    end if;

    if destination_row.in_transit_quantity < received_now then
      raise exception 'TRANSFER_IN_TRANSIT_INCONSISTENT:%', item_row.product_id::text;
    end if;

    perform public.apply_inventory_movement(
      target_tenant_id, item_row.product_id, transfer_row.destination_warehouse_id,
      'transfer_in', received_now, item_row.unit_cost,
      'stock_transfer', transfer_row.id, target_user_id,
      jsonb_build_object('transferNumber', transfer_row.transfer_number, 'direction', 'in', 'partialReceipt', true)
    );

    update public.inventory_stocks
       set in_transit_quantity = destination_row.in_transit_quantity - received_now,
           updated_at = now()
     where id = destination_row.id;

    update public.stock_transfer_items
       set received_quantity = item_row.received_quantity + received_now,
           updated_at = now()
     where id = item_row.id;

    received_total := received_total + received_now;
  end loop;

  select count(*) into remaining_lines
    from public.stock_transfer_items
   where transfer_id = transfer_row.id
     and tenant_id = target_tenant_id
     and received_quantity < shipped_quantity;

  next_status := case when remaining_lines = 0 then 'received' else 'in_transit' end;

  update public.stock_transfers
     set status = next_status,
         received_by = target_user_id,
         received_at = case when next_status = 'received' then now() else received_at end,
         updated_at = now()
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', next_status,
    'destinationWarehouseId', transfer_row.destination_warehouse_id,
    'receivedQuantity', received_total,
    'pendingLines', remaining_lines
  );
end;
$$;

create or replace function public.cancel_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid,
  target_reason text default 'Transferencia cancelada'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  stock_row public.inventory_stocks%rowtype;
  in_transit_pending numeric;
  returned_total numeric := 0;
  reason_value text := coalesce(nullif(left(coalesce(target_reason, ''), 300), ''), 'Transferencia cancelada');
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and coalesce(auth.role(), '') <> 'service_role' and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status not in ('draft','approved','in_transit') then
    raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status;
  end if;

  for item_row in
    select * from public.stock_transfer_items
     where transfer_id = transfer_row.id and tenant_id = target_tenant_id
     order by product_id
     for update
  loop
    if transfer_row.status = 'approved' then
      select * into stock_row from public.inventory_stocks
       where tenant_id = target_tenant_id
         and product_id = item_row.product_id
         and warehouse_id = transfer_row.origin_warehouse_id
       for update;
      if not found or stock_row.reserved_quantity < item_row.requested_quantity then
        raise exception 'TRANSFER_STOCK_INCONSISTENT:%', item_row.product_id::text;
      end if;

      update public.inventory_stocks
         set reserved_quantity = stock_row.reserved_quantity - item_row.requested_quantity,
             updated_at = now()
       where id = stock_row.id;

    elsif transfer_row.status = 'in_transit' then
      in_transit_pending := item_row.shipped_quantity - item_row.received_quantity;
      if in_transit_pending > 0 then
        select * into stock_row from public.inventory_stocks
         where tenant_id = target_tenant_id
           and product_id = item_row.product_id
           and warehouse_id = transfer_row.destination_warehouse_id
         for update;
        if not found or stock_row.in_transit_quantity < in_transit_pending then
          raise exception 'TRANSFER_IN_TRANSIT_INCONSISTENT:%', item_row.product_id::text;
        end if;

        update public.inventory_stocks
           set in_transit_quantity = stock_row.in_transit_quantity - in_transit_pending,
               updated_at = now()
         where id = stock_row.id;

        perform public.apply_inventory_movement(
          target_tenant_id, item_row.product_id, transfer_row.origin_warehouse_id,
          'transfer_in', in_transit_pending, item_row.unit_cost,
          'stock_transfer', transfer_row.id, target_user_id,
          jsonb_build_object('transferNumber', transfer_row.transfer_number, 'direction', 'return', 'reason', reason_value)
        );

        returned_total := returned_total + in_transit_pending;
      end if;
    end if;
  end loop;

  update public.stock_transfers
     set status = 'cancelled',
         cancelled_by = target_user_id,
         cancelled_at = now(),
         updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelReason', reason_value)
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', 'cancelled',
    'previousStatus', transfer_row.status,
    'returnedQuantity', returned_total,
    'reason', reason_value
  );
end;
$$;

-- Las RPC quedan disponibles sólo para el backend, como en la migración original.
revoke all on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.approve_stock_transfer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.dispatch_stock_transfer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.receive_stock_transfer(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_stock_transfer(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) to service_role;
grant execute on function public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.approve_stock_transfer(uuid, uuid, uuid) to service_role;
grant execute on function public.dispatch_stock_transfer(uuid, uuid, uuid) to service_role;
grant execute on function public.receive_stock_transfer(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.cancel_stock_transfer(uuid, uuid, uuid, text) to service_role;

commit;

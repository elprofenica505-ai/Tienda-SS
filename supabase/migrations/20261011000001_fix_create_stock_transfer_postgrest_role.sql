-- Corrige la comprobación del rol backend para llamadas RPC de PostgREST.
-- PostgREST entra con `authenticator` y cambia de rol con SET LOCAL ROLE;
-- por eso session_user sigue siendo `authenticator` incluso si el JWT es service_role.
-- La firma y el resto del comportamiento de create_stock_transfer no cambian.
begin;

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

revoke all on function public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text)
  to service_role;

commit;

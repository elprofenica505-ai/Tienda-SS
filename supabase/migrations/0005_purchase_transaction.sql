-- Atomic purchase receiving transaction for Supabase-only ERP.
create or replace function public.receive_purchase(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_supplier_name text,
  target_evidence_ref text,
  target_user_id uuid,
  target_items jsonb
)
returns table(purchase_id uuid, total numeric, item_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_purchase_id uuid := gen_random_uuid();
  resolved_branch_id uuid;
  resolved_warehouse_id uuid;
  item jsonb;
  resolved_product_id uuid;
  qty numeric;
  unit_cost numeric;
  line_total numeric;
  purchase_total numeric := 0;
  count_items integer := 0;
  current_qty numeric;
  current_cost numeric;
  next_qty numeric;
  next_cost numeric;
begin
  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) < 1 or jsonb_array_length(target_items) > 50 then raise exception 'INVALID_PURCHASE_ITEMS'; end if;
  select id into resolved_branch_id from public.branches where tenant_id = target_tenant_id and id = target_branch_id and active limit 1;
  select id into resolved_warehouse_id from public.warehouses where tenant_id = target_tenant_id and id = target_warehouse_id and active limit 1;
  if resolved_branch_id is null then raise exception 'BRANCH_NOT_FOUND'; end if;
  if resolved_warehouse_id is null then raise exception 'WAREHOUSE_NOT_FOUND'; end if;
  if not exists (select 1 from public.warehouses where id = resolved_warehouse_id and tenant_id = target_tenant_id and branch_id = resolved_branch_id) then raise exception 'WAREHOUSE_BRANCH_MISMATCH'; end if;

  insert into public.purchases(tenant_id, id, branch_id, warehouse_id, supplier_id, status, subtotal, total, created_by, metadata)
  values(target_tenant_id, new_purchase_id, resolved_branch_id, resolved_warehouse_id, null, 'received', 0, 0, target_user_id, jsonb_build_object('supplierName', coalesce(nullif(target_supplier_name,''),'Proveedor no especificado'), 'evidenceRef', nullif(target_evidence_ref,'')));

  for item in select * from jsonb_array_elements(target_items) loop
    begin
      resolved_product_id := (item->>'productId')::uuid;
    exception when invalid_text_representation then
      raise exception 'PRODUCT_NOT_FOUND';
    end;
    qty := nullif(item->>'quantity','')::numeric;
    unit_cost := greatest(coalesce(nullif(item->>'unitCost','')::numeric, 0), 0);
    if not exists (select 1 from public.products where id = resolved_product_id and tenant_id = target_tenant_id and active) then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if qty is null or qty <= 0 or qty <> trunc(qty) then raise exception 'INVALID_PURCHASE_QUANTITY'; end if;
    select quantity, coalesce((select cost from public.products p where p.id = resolved_product_id), 0) into current_qty, current_cost from public.inventory_stocks where tenant_id = target_tenant_id and product_id = resolved_product_id and warehouse_id = resolved_warehouse_id for update;
    current_qty := coalesce(current_qty, 0);
    current_cost := coalesce(current_cost, 0);
    next_qty := current_qty + qty;
    next_cost := case when next_qty > 0 then ((current_qty * current_cost) + (qty * unit_cost)) / next_qty else unit_cost end;
    line_total := qty * unit_cost;
    purchase_total := purchase_total + line_total;
    count_items := count_items + 1;
    insert into public.inventory_stocks(tenant_id, product_id, warehouse_id, quantity, updated_at) values(target_tenant_id, resolved_product_id, resolved_warehouse_id, next_qty, now()) on conflict(tenant_id, product_id, warehouse_id) do update set quantity=excluded.quantity, updated_at=now();
    insert into public.inventory_movements(tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, performed_by, metadata) values(target_tenant_id, resolved_product_id, resolved_warehouse_id, 'purchase', qty, unit_cost, 'purchase', new_purchase_id, target_user_id, jsonb_build_object('previous_quantity',current_qty,'new_quantity',next_qty,'average_cost',next_cost));
    update public.products set cost = next_cost, updated_at = now(), updated_by = target_user_id where id = resolved_product_id and tenant_id = target_tenant_id;
    insert into public.purchase_items(tenant_id, purchase_id, product_id, quantity, unit_cost, line_total) values(target_tenant_id, new_purchase_id, resolved_product_id, qty, unit_cost, line_total);
  end loop;
  update public.purchases set subtotal = purchase_total, total = purchase_total, updated_at = now() where id = new_purchase_id and tenant_id = target_tenant_id;
  return query select new_purchase_id, purchase_total, count_items;
end;
$$;

revoke all on function public.receive_purchase(uuid, uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.receive_purchase(uuid, uuid, uuid, text, text, uuid, jsonb) to service_role;

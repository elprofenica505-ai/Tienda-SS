-- Stage 2: canonical SQL contracts and atomic tenant/branch provisioning.
-- Local development only until validated against an isolated PostgreSQL/Supabase branch.
begin;

create extension if not exists pgcrypto;

-- Canonical item contract. APIs must emit productId and quantity; these aliases are
-- accepted only at the SQL boundary for compatibility with legacy callers.
create or replace function public.erp_normalize_items(target_items jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  normalized jsonb := '[]'::jsonb;
  product_value text;
  quantity_value numeric;
  unit_price_value numeric;
  unit_cost_value numeric;
begin
  if jsonb_typeof(target_items) <> 'array' then
    raise exception 'INVALID_ITEMS_CONTRACT';
  end if;

  for item in select value from jsonb_array_elements(target_items) loop
    product_value := coalesce(nullif(item->>'productId', ''), nullif(item->>'product_id', ''), nullif(item->>'purchaseItemId', ''));
    quantity_value := coalesce(
      nullif(item->>'quantity', '')::numeric,
      nullif(item->>'sale_quantity', '')::numeric,
      nullif(item->>'sale_qty', '')::numeric,
      nullif(item->>'received_quantity', '')::numeric,
      nullif(item->>'received_qty', '')::numeric
    );
    unit_price_value := coalesce(nullif(item->>'unitPrice', '')::numeric, nullif(item->>'unit_price', '')::numeric);
    unit_cost_value := coalesce(nullif(item->>'unitCost', '')::numeric, nullif(item->>'unit_cost', '')::numeric);

    if product_value is null or quantity_value is null or quantity_value <= 0 then
      raise exception 'INVALID_ITEM_CONTRACT';
    end if;

    normalized := normalized || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'productId', product_value,
        'purchaseItemId', nullif(item->>'purchaseItemId', ''),
        'quantity', quantity_value,
        'unitPrice', unit_price_value,
        'unitCost', unit_cost_value
      ))
    );
  end loop;

  if jsonb_array_length(normalized) = 0 then
    raise exception 'INVALID_ITEMS_CONTRACT';
  end if;
  return normalized;
end;
$$;

-- Canonical compatibility wrappers preserve existing RPC bodies while fixing the
-- boundary contract and keeping all business work inside one transaction.
create or replace function public.reserve_inventory_contract(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_user_id uuid,
  target_items jsonb,
  target_reason text default 'Reserva de stock'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.reserve_inventory(target_tenant_id, target_branch_id, target_warehouse_id, target_user_id, public.erp_normalize_items(target_items), target_reason);
end;
$$;

create or replace function public.create_purchase_order_contract(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_supplier_id uuid,
  target_user_id uuid,
  target_items jsonb,
  target_status text default 'ordered'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.create_purchase_order(target_tenant_id, target_branch_id, target_warehouse_id, target_supplier_id, target_user_id, public.erp_normalize_items(target_items), target_status);
end;
$$;

create or replace function public.receive_purchase_partial_contract(
  target_tenant_id uuid,
  target_purchase_id uuid,
  target_user_id uuid,
  target_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.receive_purchase_partial(target_tenant_id, target_purchase_id, target_user_id, public.erp_normalize_items(target_items));
end;
$$;

create or replace function public.receive_purchase_contract(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_supplier_name text,
  target_evidence_ref text,
  target_user_id uuid,
  target_items jsonb
) returns table(purchase_id uuid, total numeric, item_count integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query select * from public.receive_purchase(
    target_tenant_id, target_branch_id, target_warehouse_id,
    target_supplier_name, target_evidence_ref, target_user_id,
    public.erp_normalize_items(target_items)
  );
end;
$$;

create or replace function public.create_sale_contract(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_cash_session_id uuid,
  target_customer_id uuid,
  target_user_id uuid,
  target_payment_method text,
  target_discount numeric,
  target_idempotency_key text,
  target_metadata jsonb,
  target_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.create_sale(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, target_payment_method, target_discount, target_idempotency_key, target_metadata, public.erp_normalize_items(target_items));
end;
$$;

create or replace function public.create_sale_with_payments_contract(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_warehouse_id uuid,
  target_cash_session_id uuid,
  target_customer_id uuid,
  target_user_id uuid,
  target_discount numeric,
  target_idempotency_key text,
  target_metadata jsonb,
  target_items jsonb,
  target_payments jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.create_sale_with_payments(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, target_discount, target_idempotency_key, target_metadata, public.erp_normalize_items(target_items), target_payments);
end;
$$;

-- Atomic, idempotent provisioning for one branch. The advisory lock prevents two
-- concurrent requests from creating duplicate operational resources.
create or replace function public.provision_branch_resources(
  target_tenant_id uuid,
  target_branch_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  branch_row public.branches%rowtype;
  warehouse_id uuid;
  register_id uuid;
  code_suffix text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':' || target_branch_id::text, 0));

  select * into branch_row
    from public.branches
   where id = target_branch_id and tenant_id = target_tenant_id and active
   for update;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;

  code_suffix := left(coalesce(nullif(branch_row.code, ''), 'BRANCH') || '-' || replace(substr(branch_row.id::text, 1, 8), '-', ''), 55);

  select id into warehouse_id from public.warehouses
   where tenant_id = target_tenant_id and branch_id = target_branch_id and active
   order by created_at, id limit 1;
  if warehouse_id is null then
    insert into public.warehouses(tenant_id, branch_id, code, name, active)
    values (target_tenant_id, target_branch_id, left('BR-' || code_suffix || '-ALM', 80), 'Almacén ' || branch_row.name, true)
    returning id into warehouse_id;
  end if;

  select id into register_id from public.cash_registers
   where tenant_id = target_tenant_id and branch_id = target_branch_id and active
   order by created_at, id limit 1;
  if register_id is null then
    insert into public.cash_registers(tenant_id, branch_id, code, name, active)
    values (target_tenant_id, target_branch_id, left('BR-' || code_suffix || '-CAJA', 80), 'Caja ' || branch_row.name, true)
    returning id into register_id;
  end if;

  return jsonb_build_object('tenantId', target_tenant_id, 'branchId', target_branch_id, 'warehouseId', warehouse_id, 'cashRegisterId', register_id);
end;
$$;

-- Atomic initial tenant provisioning. Any failure rolls back tenant, membership,
-- branch assignment, warehouse, and register as one unit.
create or replace function public.provision_initial_tenant(
  target_auth_user_id uuid,
  target_email text,
  target_display_name text,
  target_company_name text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  tenant_id uuid;
  member_id uuid;
  branch_id uuid;
  slug_base text;
  slug_value text;
  resources jsonb;
begin
  if target_auth_user_id is null or nullif(trim(target_email), '') is null or nullif(trim(target_company_name), '') is null then
    raise exception 'INVALID_TENANT_PROVISIONING';
  end if;
  if exists(select 1 from public.members m where m.profile_id = target_auth_user_id and m.status = 'active') then
    raise exception 'AUTH_USER_ALREADY_ONBOARDED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(trim(target_email)), 0));
  insert into public.profiles(id, auth_user_id, email, display_name)
  values (target_auth_user_id, target_auth_user_id, lower(trim(target_email)), nullif(trim(target_display_name), ''))
  on conflict (auth_user_id) do update set email = excluded.email, display_name = excluded.display_name;

  slug_base := regexp_replace(lower(trim(target_company_name)), '[^a-z0-9]+', '-', 'g');
  slug_base := trim(both '-' from left(slug_base, 50));
  if slug_base = '' then slug_base := 'empresa'; end if;
  slug_value := slug_base;
  if exists(select 1 from public.tenants where slug = slug_value) then
    slug_value := left(slug_base, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  insert into public.tenants(slug, name, status)
  values (slug_value, trim(target_company_name), 'active')
  returning id into tenant_id;
  insert into public.members(tenant_id, profile_id, role, status)
  values (tenant_id, target_auth_user_id, 'owner', 'active')
  returning id into member_id;
  insert into public.branches(tenant_id, code, name)
  values (tenant_id, 'PRINCIPAL', 'Sucursal principal')
  returning id into branch_id;
  insert into public.member_branches(tenant_id, member_id, branch_id)
  values (tenant_id, member_id, branch_id);
  resources := public.provision_branch_resources(tenant_id, branch_id);
  return tenant_id;
end;
$$;

-- Atomic branch creation: branch, warehouse, cash register, and owner assignment
-- succeed or fail together.
create or replace function public.create_branch_with_resources(
  target_tenant_id uuid,
  target_code text,
  target_name text,
  target_timezone text default 'America/Managua'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  branch_id uuid;
  owner_id uuid;
  resources jsonb;
begin
  if target_tenant_id is null or nullif(trim(target_code), '') is null or nullif(trim(target_name), '') is null then
    raise exception 'INVALID_BRANCH_PROVISIONING';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':branches', 0));
  insert into public.branches(tenant_id, code, name, timezone, active)
  values (target_tenant_id, left(trim(target_code), 80), left(trim(target_name), 120), coalesce(nullif(trim(target_timezone), ''), 'America/Managua'), true)
  returning id into branch_id;
  resources := public.provision_branch_resources(target_tenant_id, branch_id);
  select id into owner_id from public.members where tenant_id = target_tenant_id and role = 'owner' and status = 'active' order by created_at limit 1;
  if owner_id is not null then
    insert into public.member_branches(tenant_id, member_id, branch_id)
    values (target_tenant_id, owner_id, branch_id)
    on conflict (tenant_id, member_id, branch_id) do nothing;
  end if;
  return jsonb_build_object('branchId', branch_id, 'code', target_code, 'name', target_name, 'timezone', target_timezone, 'resources', resources);
end;
$$;

revoke all on function public.erp_normalize_items(jsonb) from public, anon, authenticated;
revoke all on function public.reserve_inventory_contract(uuid, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.create_purchase_order_contract(uuid, uuid, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.receive_purchase_partial_contract(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.receive_purchase_contract(uuid, uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_contract(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_with_payments_contract(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.provision_branch_resources(uuid, uuid) from public, anon, authenticated;
revoke all on function public.provision_initial_tenant(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.create_branch_with_resources(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.reserve_inventory_contract(uuid, uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.create_purchase_order_contract(uuid, uuid, uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.receive_purchase_partial_contract(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.receive_purchase_contract(uuid, uuid, uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.create_sale_contract(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) to service_role;
grant execute on function public.create_sale_with_payments_contract(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.provision_branch_resources(uuid, uuid) to service_role;
grant execute on function public.provision_initial_tenant(uuid, text, text, text) to service_role;
grant execute on function public.create_branch_with_resources(uuid, text, text, text) to service_role;

commit;

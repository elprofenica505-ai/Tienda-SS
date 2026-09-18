-- Stage 4: commercial rules, price lists, discounts, and commissions.
-- Local development only. Do not apply remotely until PostgreSQL validation is authorized.
begin;

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  priority integer not null default 0,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (id, tenant_id)
);

create table if not exists public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  unit_price numeric(14,4) not null check (unit_price >= 0),
  active boolean not null default true,
  unique (tenant_id, price_list_id, product_id),
  unique (id, tenant_id)
);

create table if not exists public.customer_price_lists (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  active boolean not null default true,
  priority integer not null default 0,
  primary key (tenant_id, customer_id, price_list_id)
);

create table if not exists public.branch_price_lists (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  active boolean not null default true,
  priority integer not null default 0,
  primary key (tenant_id, branch_id, price_list_id)
);

create table if not exists public.commercial_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  sale_type text,
  role text,
  max_discount_percent numeric(7,4) not null default 0 check (max_discount_percent between 0 and 100),
  commission_percent numeric(7,4) not null default 0 check (commission_percent between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null,
  seller_id uuid not null references auth.users(id) on delete restrict,
  base_amount numeric(14,2) not null default 0 check (base_amount >= 0),
  commission_percent numeric(7,4) not null default 0 check (commission_percent between 0 and 100),
  commission_amount numeric(14,2) not null default 0 check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, sale_id)
);

create index if not exists price_lists_tenant_active_idx on public.price_lists (tenant_id, active, priority desc);
create index if not exists price_list_items_lookup_idx on public.price_list_items (tenant_id, product_id, price_list_id) where active;
create index if not exists commercial_rules_lookup_idx on public.commercial_rules (tenant_id, product_id, sale_type, role) where active;
create index if not exists sales_commissions_seller_idx on public.sales_commissions (tenant_id, seller_id, created_at desc);

-- Resolve the active price list in strict order: customer assignment, branch
-- assignment, then tenant default. Product.price is the final fallback.
create or replace function public.erp_commercial_price_items(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_customer_id uuid,
  target_user_id uuid,
  target_metadata jsonb,
  target_items jsonb
) returns table(items jsonb, subtotal numeric, tax_amount numeric, max_discount_percent numeric, commission_percent numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  product_id uuid;
  quantity numeric;
  resolved_price numeric;
  line_total numeric;
  normalized jsonb := '[]'::jsonb;
  subtotal_value numeric := 0;
  tax_value numeric := 0;
  rule_discount numeric;
  rule_commission numeric;
  effective_role text;
  sale_type_value text := nullif(target_metadata->>'saleType', '');
  customer_list_id uuid;
  branch_list_id uuid;
begin
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) < 1 or jsonb_array_length(target_items) > 50 then raise exception 'INVALID_SALE_ITEMS'; end if;
  select m.role into effective_role from public.members m where m.tenant_id = target_tenant_id and m.profile_id = target_user_id and m.status = 'active' limit 1;
  for item in select value from jsonb_array_elements(target_items) loop
    begin product_id := coalesce(nullif(item->>'productId', ''), nullif(item->>'product_id', ''))::uuid; exception when invalid_text_representation then raise exception 'PRODUCT_NOT_FOUND'; end;
    quantity := coalesce(nullif(item->>'quantity', '')::numeric, nullif(item->>'sale_quantity', '')::numeric, nullif(item->>'sale_qty', '')::numeric);
    if product_id is null or quantity is null or quantity <= 0 or quantity <> trunc(quantity) then raise exception 'INVALID_SALE_QUANTITY'; end if;
    select * into product_row from public.products where id = product_id and tenant_id = target_tenant_id and active for share;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    select pli.unit_price, pl.id into resolved_price, customer_list_id
      from public.price_list_items pli join public.price_lists pl on pl.id = pli.price_list_id and pl.tenant_id = target_tenant_id and pl.active
     where pli.tenant_id = target_tenant_id and pli.product_id = product_id and pli.active
       and exists (select 1 from public.customer_price_lists cpl where cpl.tenant_id = target_tenant_id and cpl.customer_id = target_customer_id and cpl.price_list_id = pl.id and cpl.active)
     order by pl.priority desc, pl.created_at desc limit 1;
    if resolved_price is null then
      select pli.unit_price, pl.id into resolved_price, branch_list_id
        from public.price_list_items pli join public.price_lists pl on pl.id = pli.price_list_id and pl.tenant_id = target_tenant_id and pl.active
       where pli.tenant_id = target_tenant_id and pli.product_id = product_id and pli.active
         and exists (select 1 from public.branch_price_lists bpl where bpl.tenant_id = target_tenant_id and bpl.branch_id = target_branch_id and bpl.price_list_id = pl.id and bpl.active)
       order by pl.priority desc, pl.created_at desc limit 1;
    end if;
    if resolved_price is null then
      select pli.unit_price into resolved_price
        from public.price_list_items pli join public.price_lists pl on pl.id = pli.price_list_id and pl.tenant_id = target_tenant_id and pl.active and pl.is_default
       where pli.tenant_id = target_tenant_id and pli.product_id = product_id and pli.active
       order by pl.priority desc, pl.created_at desc limit 1;
    end if;
    resolved_price := greatest(coalesce(resolved_price, product_row.price), 0);
    line_total := resolved_price * quantity;
    subtotal_value := subtotal_value + line_total;
    tax_value := tax_value + round(line_total * greatest(coalesce(product_row.tax_rate, 0), 0) / 100, 2);
    normalized := normalized || jsonb_build_array(jsonb_build_object('productId', product_id, 'quantity', quantity));
  end loop;

  select coalesce(min(r.max_discount_percent), 100), coalesce(max(r.commission_percent), 0)
    into rule_discount, rule_commission
    from public.commercial_rules r
   where r.tenant_id = target_tenant_id and r.active
     and (r.product_id is null or r.product_id in (select (value->>'productId')::uuid from jsonb_array_elements(normalized)))
     and (r.sale_type is null or r.sale_type = sale_type_value)
     and (r.role is null or r.role = effective_role);
  return query select normalized, round(subtotal_value, 2), round(tax_value, 2), coalesce(rule_discount, 100), coalesce(rule_commission, 0);
end;
$$;

-- Replaces the Stage 3 pricing wrapper so commercial lists and discount rules are
-- evaluated before the underlying atomic sale RPC runs.
create or replace function public.create_sale_server_priced(
  target_tenant_id uuid, target_branch_id uuid, target_warehouse_id uuid, target_cash_session_id uuid,
  target_customer_id uuid, target_user_id uuid, target_payment_method text, target_discount numeric,
  target_idempotency_key text, target_metadata jsonb, target_items jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare priced record; metadata_value jsonb; result jsonb; discount_value numeric := greatest(coalesce(target_discount, 0), 0); sale_id uuid; commission_base numeric; commission_amount numeric;
begin
  select * into priced from public.erp_commercial_price_items(target_tenant_id, target_branch_id, target_customer_id, target_user_id, target_metadata, target_items);
  if discount_value > round(priced.subtotal * priced.max_discount_percent / 100, 2) then raise exception 'DISCOUNT_NOT_AUTHORIZED'; end if;
  metadata_value := (coalesce(target_metadata, '{}'::jsonb) - 'taxAmount') || jsonb_build_object('taxAmount', priced.tax_amount, 'priceSource', 'server_commercial_rules');
  result := public.create_sale(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, target_payment_method, discount_value, target_idempotency_key, metadata_value, priced.items);
  if coalesce((result->>'replayed')::boolean, false) then return result; end if;
  sale_id := (result->>'saleId')::uuid; commission_base := greatest((result->>'subtotal')::numeric - discount_value, 0); commission_amount := round(commission_base * priced.commission_percent / 100, 2);
  insert into public.sales_commissions(tenant_id, sale_id, seller_id, base_amount, commission_percent, commission_amount) values(target_tenant_id, sale_id, target_user_id, commission_base, priced.commission_percent, commission_amount) on conflict (tenant_id, sale_id) do nothing;
  return result || jsonb_build_object('commissionAmount', commission_amount, 'commissionPercent', priced.commission_percent);
end; $$;

create or replace function public.create_sale_with_payments_server_priced(
  target_tenant_id uuid, target_branch_id uuid, target_warehouse_id uuid, target_cash_session_id uuid,
  target_customer_id uuid, target_user_id uuid, target_discount numeric, target_idempotency_key text,
  target_metadata jsonb, target_items jsonb, target_payments jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare priced record; metadata_value jsonb; result jsonb; discount_value numeric := greatest(coalesce(target_discount, 0), 0); sale_id uuid; commission_base numeric; commission_amount numeric;
begin
  select * into priced from public.erp_commercial_price_items(target_tenant_id, target_branch_id, target_customer_id, target_user_id, target_metadata, target_items);
  if discount_value > round(priced.subtotal * priced.max_discount_percent / 100, 2) then raise exception 'DISCOUNT_NOT_AUTHORIZED'; end if;
  metadata_value := (coalesce(target_metadata, '{}'::jsonb) - 'taxAmount') || jsonb_build_object('taxAmount', priced.tax_amount, 'priceSource', 'server_commercial_rules');
  result := public.create_sale_with_payments(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, discount_value, target_idempotency_key, metadata_value, priced.items, target_payments);
  if coalesce((result->>'replayed')::boolean, false) then return result; end if;
  sale_id := (result->>'saleId')::uuid; commission_base := greatest((result->>'subtotal')::numeric - discount_value, 0); commission_amount := round(commission_base * priced.commission_percent / 100, 2);
  insert into public.sales_commissions(tenant_id, sale_id, seller_id, base_amount, commission_percent, commission_amount) values(target_tenant_id, sale_id, target_user_id, commission_base, priced.commission_percent, commission_amount) on conflict (tenant_id, sale_id) do nothing;
  return result || jsonb_build_object('commissionAmount', commission_amount, 'commissionPercent', priced.commission_percent);
end; $$;

revoke all on function public.erp_commercial_price_items(uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_with_payments_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_sale_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) to service_role;
grant execute on function public.create_sale_with_payments_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) to service_role;

commit;

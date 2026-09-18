-- Stage 3: cash uniqueness, server-side pricing, and idempotent critical operations.
-- Local development only. Do not apply remotely until PostgreSQL validation is authorized.
begin;

-- A user cannot own two open cash sessions in the same tenant/branch.
create unique index if not exists cash_sessions_one_open_per_user_branch_idx
  on public.cash_sessions (tenant_id, branch_id, opened_by)
  where status = 'open' and opened_by is not null;

-- Returns need the same replay protection as sales/checkouts.
alter table public.sale_returns add column if not exists idempotency_key text;
create unique index if not exists sale_returns_tenant_idempotency_idx
  on public.sale_returns (tenant_id, idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

-- Normalize item prices from the authoritative product catalog. Client prices are
-- deliberately discarded; tax_rate is stored as a percentage on products.
create or replace function public.erp_server_price_items(target_tenant_id uuid, target_items jsonb)
returns table(items jsonb, tax_amount numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  product_id uuid;
  quantity numeric;
  unit_total numeric;
  normalized jsonb := '[]'::jsonb;
  computed_tax numeric := 0;
begin
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) < 1 or jsonb_array_length(target_items) > 50 then
    raise exception 'INVALID_SALE_ITEMS';
  end if;
  for item in select value from jsonb_array_elements(target_items) loop
    begin product_id := coalesce(nullif(item->>'productId', ''), nullif(item->>'product_id', ''))::uuid; exception when invalid_text_representation then raise exception 'PRODUCT_NOT_FOUND'; end;
    quantity := coalesce(nullif(item->>'quantity', '')::numeric, nullif(item->>'sale_quantity', '')::numeric, nullif(item->>'sale_qty', '')::numeric);
    if product_id is null or quantity is null or quantity <= 0 or quantity <> trunc(quantity) then raise exception 'INVALID_SALE_QUANTITY'; end if;
    select * into product_row from public.products where id = product_id and tenant_id = target_tenant_id and active for share;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    unit_total := greatest(coalesce(product_row.price, 0), 0) * quantity;
    computed_tax := computed_tax + round(unit_total * greatest(coalesce(product_row.tax_rate, 0), 0) / 100, 2);
    normalized := normalized || jsonb_build_array(jsonb_build_object('productId', product_id, 'quantity', quantity));
  end loop;
  return query select normalized, round(computed_tax, 2);
end;
$$;

create or replace function public.create_sale_server_priced(
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
declare priced record; metadata_value jsonb;
begin
  select * into priced from public.erp_server_price_items(target_tenant_id, target_items);
  metadata_value := coalesce(target_metadata, '{}'::jsonb) - 'taxAmount' || jsonb_build_object('taxAmount', priced.tax_amount);
  return public.create_sale(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, target_payment_method, target_discount, target_idempotency_key, metadata_value, priced.items);
end;
$$;

create or replace function public.create_sale_with_payments_server_priced(
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
declare priced record; metadata_value jsonb;
begin
  select * into priced from public.erp_server_price_items(target_tenant_id, target_items);
  metadata_value := coalesce(target_metadata, '{}'::jsonb) - 'taxAmount' || jsonb_build_object('taxAmount', priced.tax_amount);
  return public.create_sale_with_payments(target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id, target_customer_id, target_user_id, target_discount, target_idempotency_key, metadata_value, priced.items, target_payments);
end;
$$;

create or replace function public.create_sale_return_idempotent(
  target_tenant_id uuid,
  target_sale_id uuid,
  target_user_id uuid,
  target_refund_method text,
  target_cash_session_id uuid,
  target_reason text,
  target_items jsonb,
  target_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing_return public.sale_returns%rowtype; result jsonb; key_value text;
begin
  key_value := nullif(left(trim(target_idempotency_key), 160), '');
  if key_value is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':return:' || key_value, 0));
  select * into existing_return from public.sale_returns where tenant_id = target_tenant_id and idempotency_key = key_value limit 1;
  if found then return jsonb_build_object('returnId', existing_return.id, 'saleId', existing_return.sale_id, 'amount', existing_return.amount, 'refundMethod', existing_return.refund_method, 'status', existing_return.status, 'replayed', true); end if;
  result := public.create_sale_return(target_tenant_id, target_sale_id, target_user_id, target_refund_method, target_cash_session_id, target_reason, target_items);
  update public.sale_returns set idempotency_key = key_value where id = (result->>'returnId')::uuid and tenant_id = target_tenant_id;
  return result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.erp_server_price_items(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_with_payments_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale_return_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_sale_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, text, jsonb, jsonb) to service_role;
grant execute on function public.create_sale_with_payments_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.create_sale_return_idempotent(uuid, uuid, uuid, text, uuid, text, jsonb, text) to service_role;

commit;

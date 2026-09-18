-- Fix: use the priced commission value in the mixed-payment wrapper response.
begin;

create or replace function public.create_sale_with_payments_server_priced(
  target_tenant_id uuid, target_branch_id uuid, target_warehouse_id uuid,
  target_cash_session_id uuid, target_customer_id uuid, target_user_id uuid,
  target_discount numeric, target_idempotency_key text, target_metadata jsonb,
  target_items jsonb, target_payments jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  priced record;
  metadata_value jsonb;
  sale_result jsonb;
  created_sale_id uuid;
  commission_base_value numeric;
  commission_amount_value numeric;
  discount_value numeric := greatest(coalesce(target_discount, 0), 0);
begin
  select * into priced
    from public.erp_commercial_price_items(
      target_tenant_id, target_branch_id, target_customer_id,
      target_user_id, target_metadata, target_items
    );
  if discount_value > round(priced.subtotal * priced.max_discount_percent / 100, 2) then
    raise exception 'DISCOUNT_NOT_AUTHORIZED';
  end if;
  metadata_value := (coalesce(target_metadata, '{}'::jsonb) - 'taxAmount')
    || jsonb_build_object('taxAmount', priced.tax_amount, 'priceSource', 'server_commercial_rules');
  sale_result := public.create_sale_with_payments(
    target_tenant_id, target_branch_id, target_warehouse_id, target_cash_session_id,
    target_customer_id, target_user_id, discount_value, target_idempotency_key,
    metadata_value, priced.items, target_payments
  );
  if coalesce((sale_result->>'replayed')::boolean, false) then
    return sale_result;
  end if;
  created_sale_id := (sale_result->>'saleId')::uuid;
  commission_base_value := greatest((sale_result->>'subtotal')::numeric - discount_value, 0);
  commission_amount_value := round(commission_base_value * priced.commission_percent / 100, 2);
  insert into public.sales_commissions(
    tenant_id, sale_id, seller_id, base_amount, commission_percent, commission_amount
  ) values (
    target_tenant_id, created_sale_id, target_user_id, commission_base_value,
    priced.commission_percent, commission_amount_value
  ) on conflict (tenant_id, sale_id) do nothing;
  return sale_result || jsonb_build_object(
    'commissionAmount', commission_amount_value,
    'commissionPercent', priced.commission_percent
  );
end;
$$;

revoke all on function public.create_sale_with_payments_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_sale_with_payments_server_priced(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, jsonb, jsonb, jsonb) to service_role;

commit;

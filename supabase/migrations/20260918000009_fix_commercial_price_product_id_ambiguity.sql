-- Fix: qualify the product id used by commercial price-list lookups.
-- The previous function used `product_id` both as a PL/pgSQL variable and
-- as a table column, which raises 42702 during every server-priced POS sale.
begin;

create or replace function public.erp_commercial_price_items(
  target_tenant_id uuid,
  target_branch_id uuid,
  target_customer_id uuid,
  target_user_id uuid,
  target_metadata jsonb,
  target_items jsonb
) returns table(
  items jsonb,
  subtotal numeric,
  tax_amount numeric,
  max_discount_percent numeric,
  commission_percent numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  resolved_product_id uuid;
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
  if jsonb_typeof(target_items) <> 'array'
     or jsonb_array_length(target_items) < 1
     or jsonb_array_length(target_items) > 50 then
    raise exception 'INVALID_SALE_ITEMS';
  end if;

  select m.role
    into effective_role
    from public.members as m
   where m.tenant_id = target_tenant_id
     and m.profile_id = target_user_id
     and m.status = 'active'
   limit 1;

  for item in select value from jsonb_array_elements(target_items) loop
    begin
      resolved_product_id := coalesce(
        nullif(item->>'productId', ''),
        nullif(item->>'product_id', '')
      )::uuid;
    exception when invalid_text_representation then
      raise exception 'PRODUCT_NOT_FOUND';
    end;

    quantity := coalesce(
      nullif(item->>'quantity', '')::numeric,
      nullif(item->>'sale_quantity', '')::numeric,
      nullif(item->>'sale_qty', '')::numeric
    );
    if resolved_product_id is null
       or quantity is null
       or quantity <= 0
       or quantity <> trunc(quantity) then
      raise exception 'INVALID_SALE_QUANTITY';
    end if;

    select p.*
      into product_row
      from public.products as p
     where p.id = resolved_product_id
       and p.tenant_id = target_tenant_id
       and p.active
     for share;
    if not found then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;

    select pli.unit_price, pl.id
      into resolved_price, customer_list_id
      from public.price_list_items as pli
      join public.price_lists as pl
        on pl.id = pli.price_list_id
       and pl.tenant_id = target_tenant_id
       and pl.active
     where pli.tenant_id = target_tenant_id
       and pli.product_id = resolved_product_id
       and pli.active
       and exists (
         select 1
           from public.customer_price_lists as cpl
          where cpl.tenant_id = target_tenant_id
            and cpl.customer_id = target_customer_id
            and cpl.price_list_id = pl.id
            and cpl.active
       )
     order by pl.priority desc, pl.created_at desc
     limit 1;

    if resolved_price is null then
      select pli.unit_price, pl.id
        into resolved_price, branch_list_id
        from public.price_list_items as pli
        join public.price_lists as pl
          on pl.id = pli.price_list_id
         and pl.tenant_id = target_tenant_id
         and pl.active
       where pli.tenant_id = target_tenant_id
         and pli.product_id = resolved_product_id
         and pli.active
         and exists (
           select 1
             from public.branch_price_lists as bpl
            where bpl.tenant_id = target_tenant_id
              and bpl.branch_id = target_branch_id
              and bpl.price_list_id = pl.id
              and bpl.active
         )
       order by pl.priority desc, pl.created_at desc
       limit 1;
    end if;

    if resolved_price is null then
      select pli.unit_price
        into resolved_price
        from public.price_list_items as pli
        join public.price_lists as pl
          on pl.id = pli.price_list_id
         and pl.tenant_id = target_tenant_id
         and pl.active
         and pl.is_default
       where pli.tenant_id = target_tenant_id
         and pli.product_id = resolved_product_id
         and pli.active
       order by pl.priority desc, pl.created_at desc
       limit 1;
    end if;

    resolved_price := greatest(coalesce(resolved_price, product_row.price), 0);
    line_total := resolved_price * quantity;
    subtotal_value := subtotal_value + line_total;
    tax_value := tax_value + round(
      line_total * greatest(coalesce(product_row.tax_rate, 0), 0) / 100,
      2
    );
    normalized := normalized || jsonb_build_array(jsonb_build_object(
      'productId', resolved_product_id,
      'quantity', quantity
    ));
  end loop;

  select coalesce(min(r.max_discount_percent), 100),
         coalesce(max(r.commission_percent), 0)
    into rule_discount, rule_commission
    from public.commercial_rules as r
   where r.tenant_id = target_tenant_id
     and r.active
     and (
       r.product_id is null
       or r.product_id in (
         select (value->>'productId')::uuid
           from jsonb_array_elements(normalized)
       )
     )
     and (r.sale_type is null or r.sale_type = sale_type_value)
     and (r.role is null or r.role = effective_role);

  return query
    select normalized,
           round(subtotal_value, 2),
           round(tax_value, 2),
           coalesce(rule_discount, 100),
           coalesce(rule_commission, 0);
end;
$$;

revoke all on function public.erp_commercial_price_items(uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.erp_commercial_price_items(uuid, uuid, uuid, uuid, jsonb, jsonb) to service_role;

commit;

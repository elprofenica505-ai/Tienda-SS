create or replace function public.import_catalog_products(
  target_tenant_id uuid,
  target_user_id uuid,
  target_rows jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant_plan text; current_count integer; row_count integer; product_id uuid; ids jsonb:='[]'::jsonb; item jsonb; sku_value text; category_value text; category_uuid uuid; max_products integer;
begin
  if jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows)=0 then raise exception 'CATALOG_EMPTY'; end if;
  if jsonb_array_length(target_rows)>500 then raise exception 'CATALOG_TOO_LARGE'; end if;
  select plan into tenant_plan from public.tenants where id=target_tenant_id;
  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  max_products := case coalesce(tenant_plan,'starter') when 'growth' then 1000 when 'scale' then 2147483647 else 100 end;
  select count(*) into current_count from public.products where tenant_id=target_tenant_id and active;
  row_count := jsonb_array_length(target_rows);
  if current_count + row_count > max_products then raise exception 'ENTITLEMENT_EXCEEDED:products:%',max_products; end if;
  for item in select value from jsonb_array_elements(target_rows) loop
    sku_value := upper(trim(item->>'sku'));
    if exists(select 1 from public.products where tenant_id=target_tenant_id and upper(sku)=sku_value) then raise exception 'DUPLICATE_SKU:%',sku_value; end if;
    if (select count(*) from jsonb_array_elements(target_rows) inner_item where upper(trim(inner_item->>'sku'))=sku_value)>1 then raise exception 'DUPLICATE_SKU:%',sku_value; end if;
    category_value := nullif(trim(item->>'categoryId'),'');
    category_uuid := case when category_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then category_value::uuid else null end;
    insert into public.products(tenant_id,category_id,sku,name,price,active,metadata,created_at,updated_at)
      values(target_tenant_id,category_uuid,sku_value,left(trim(item->>'name'),120),greatest(0,coalesce((item->>'price')::numeric,0)),true,jsonb_build_object('itemType',case when item->>'itemType'='service' then 'service' else 'physical' end,'initialStock',greatest(0,coalesce((item->>'stock')::numeric,0)),'minStock',greatest(0,coalesce((item->>'minStock')::numeric,5)),'importedBy',target_user_id),now(),now()) returning id into product_id;
    ids := ids || jsonb_build_array(product_id);
  end loop;
  return jsonb_build_object('ids',ids,'count',row_count);
end; $$;
revoke all on function public.import_catalog_products(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_catalog_products(uuid,uuid,jsonb) to service_role;

create or replace function public.consume_catalog_export(target_tenant_id uuid,target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant_plan text; current_count integer; max_exports integer; month_key text:=to_char(current_date,'YYYY-MM'); usage_value jsonb; next_count integer;
begin
  select plan into tenant_plan from public.tenants where id=target_tenant_id;
  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  max_exports := case coalesce(tenant_plan,'starter') when 'growth' then 100 when 'scale' then 2147483647 else 10 end;
  select value->'monthlyExports' into usage_value from public.tenant_settings where tenant_id=target_tenant_id and setting_key='entitlement:'||month_key for update;
  current_count := coalesce((usage_value #>> '{}')::integer,0);
  next_count := current_count+1;
  if next_count > max_exports then raise exception 'ENTITLEMENT_EXCEEDED:monthlyExports:%',max_exports; end if;
  insert into public.tenant_settings(tenant_id,setting_key,value,updated_by,updated_at) values(target_tenant_id,'entitlement:'||month_key,jsonb_build_object('monthlyExports',next_count),target_user_id,now()) on conflict (tenant_id,setting_key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return jsonb_build_object('current',current_count,'next',next_count,'limit',max_exports);
end; $$;
revoke all on function public.consume_catalog_export(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_catalog_export(uuid,uuid) to service_role;

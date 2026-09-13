-- Supabase-only sales returns and voids.
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  sale_id uuid not null, branch_id uuid not null, warehouse_id uuid not null, amount numeric(14,2) not null default 0 check (amount >= 0),
  refund_method text not null check (refund_method in ('cash','card','transfer','credit')), status text not null default 'completed', reason text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb,
  unique (id, tenant_id), foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete restrict,
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);
create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  return_id uuid not null, sale_id uuid not null, product_id uuid not null, warehouse_id uuid not null, quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0, amount numeric(14,2) not null default 0, unique (id, tenant_id),
  foreign key (return_id, tenant_id) references public.sale_returns(id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict,
  foreign key (warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);
alter table public.sale_returns enable row level security; alter table public.sale_return_items enable row level security;
revoke all on table public.sale_returns, public.sale_return_items from anon, authenticated;
grant select, insert, update on table public.sale_returns, public.sale_return_items to authenticated;
drop policy if exists sale_returns_select_member on public.sale_returns; drop policy if exists sale_return_items_select_member on public.sale_return_items;
create policy sale_returns_select_member on public.sale_returns for select to authenticated using (public.has_tenant_access(tenant_id));
create policy sale_return_items_select_member on public.sale_return_items for select to authenticated using (public.has_tenant_access(tenant_id));

create or replace function public.create_sale_return(target_tenant_id uuid,target_sale_id uuid,target_user_id uuid,target_refund_method text,target_cash_session_id uuid,target_reason text,target_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare sale_row public.sales%rowtype; item jsonb; target_product_id uuid; sale_item_row public.sale_items%rowtype; stock_row public.inventory_stocks%rowtype; return_id uuid:=gen_random_uuid(); return_quantity numeric; returned_quantity numeric; refund_total numeric:=0; current_status text; requested_items jsonb;
begin
  if target_refund_method not in ('cash','card','transfer','credit') then raise exception 'INVALID_REFUND_METHOD'; end if;
  select * into sale_row from public.sales where id=target_sale_id and tenant_id=target_tenant_id for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if sale_row.status='voided' then raise exception 'SALE_VOID'; end if;
  if target_refund_method<>'credit' and (target_cash_session_id is null or not exists(select 1 from public.cash_sessions where id=target_cash_session_id and tenant_id=target_tenant_id and branch_id=sale_row.branch_id and status='open')) then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)=0 then select jsonb_agg(jsonb_build_object('productId',si.product_id,'quantity',si.quantity)) into requested_items from public.sale_items si where si.tenant_id=target_tenant_id and si.sale_id=target_sale_id; else requested_items:=target_items; end if;
  if requested_items is null or jsonb_array_length(requested_items)=0 then raise exception 'RETURN_LINES_INVALID'; end if;
  insert into public.sale_returns(id,tenant_id,sale_id,branch_id,warehouse_id,amount,refund_method,reason,created_by) values(return_id,target_tenant_id,target_sale_id,sale_row.branch_id,(select warehouse_id from public.sale_items where tenant_id=target_tenant_id and sale_id=target_sale_id limit 1),0,target_refund_method,coalesce(nullif(target_reason,''),'Devolución'),target_user_id);
  for item in select * from jsonb_array_elements(requested_items) loop
    begin target_product_id:=(item->>'productId')::uuid; exception when invalid_text_representation then raise exception 'RETURN_LINES_INVALID'; end;
    return_quantity:=nullif(item->>'quantity','')::numeric;
    select * into sale_item_row from public.sale_items where tenant_id=target_tenant_id and sale_id=target_sale_id and product_id=target_product_id limit 1;
    if not found or return_quantity is null or return_quantity<=0 then raise exception 'RETURN_LINES_INVALID'; end if;
    select coalesce(sum(quantity),0) into returned_quantity from public.sale_return_items where tenant_id=target_tenant_id and sale_id=target_sale_id and product_id=target_product_id;
    if returned_quantity+return_quantity>sale_item_row.quantity then raise exception 'RETURN_EXCEEDS_SOLD'; end if;
    refund_total:=refund_total+(sale_item_row.unit_price*return_quantity);
    select * into stock_row from public.inventory_stocks where tenant_id=target_tenant_id and product_id=target_product_id and warehouse_id=sale_item_row.warehouse_id for update;
    if found then update public.inventory_stocks set quantity=stock_row.quantity+return_quantity,updated_at=now() where id=stock_row.id; else insert into public.inventory_stocks(tenant_id,product_id,warehouse_id,quantity,updated_at) values(target_tenant_id,target_product_id,sale_item_row.warehouse_id,return_quantity,now()); end if;
    insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,target_product_id,sale_item_row.warehouse_id,'return',return_quantity,0,'sale_return',return_id,target_user_id,'{}'::jsonb);
    insert into public.sale_return_items(tenant_id,return_id,sale_id,product_id,warehouse_id,quantity,unit_price,amount) values(target_tenant_id,return_id,target_sale_id,target_product_id,sale_item_row.warehouse_id,return_quantity,sale_item_row.unit_price,sale_item_row.unit_price*return_quantity);
  end loop;
  if target_refund_method<>'credit' then insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,target_cash_session_id,'refund',-refund_total,'sale_return',return_id,target_user_id,jsonb_build_object('paymentMethod',target_refund_method)); else update public.receivables set outstanding_amount=greatest(0,outstanding_amount-refund_total),status=case when outstanding_amount-refund_total<=0 then 'paid' else 'partial' end,updated_at=now() where tenant_id=target_tenant_id and sale_id=target_sale_id and status in ('open','partial'); end if;
  select case when not exists(select 1 from public.sale_items si where si.tenant_id=target_tenant_id and si.sale_id=target_sale_id and si.quantity>coalesce((select sum(sri.quantity) from public.sale_return_items sri where sri.tenant_id=target_tenant_id and sri.sale_id=target_sale_id and sri.product_id=si.product_id),0)) then 'returned' else 'completed' end into current_status;
  update public.sale_returns set amount=refund_total where id=return_id and tenant_id=target_tenant_id;
  update public.sales set status=current_status,updated_at=now(),metadata=metadata||jsonb_build_object('returnedAmount',coalesce((metadata->>'returnedAmount')::numeric,0)+refund_total) where id=target_sale_id and tenant_id=target_tenant_id;
  return jsonb_build_object('returnId',return_id,'saleId',target_sale_id,'amount',refund_total,'refundMethod',target_refund_method,'status',current_status);
end; $$;
revoke all on function public.create_sale_return(uuid,uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated; grant execute on function public.create_sale_return(uuid,uuid,uuid,text,uuid,text,jsonb) to service_role;

create or replace function public.void_sale(target_tenant_id uuid,target_sale_id uuid,target_user_id uuid,target_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare sale_row public.sales%rowtype; item record; stock_row public.inventory_stocks%rowtype;
begin
  select * into sale_row from public.sales where id=target_sale_id and tenant_id=target_tenant_id for update; if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if sale_row.status='voided' then raise exception 'SALE_ALREADY_VOID'; end if;
  if exists(select 1 from public.sale_payments where tenant_id=target_tenant_id and sale_id=target_sale_id and amount>0) then raise exception 'SALE_HAS_PAYMENTS'; end if;
  for item in select * from public.sale_items where tenant_id=target_tenant_id and sale_id=target_sale_id loop
    select * into stock_row from public.inventory_stocks where tenant_id=target_tenant_id and product_id=item.product_id and warehouse_id=item.warehouse_id for update;
    if found then update public.inventory_stocks set quantity=stock_row.quantity+item.quantity,updated_at=now() where id=stock_row.id; else insert into public.inventory_stocks(tenant_id,product_id,warehouse_id,quantity,updated_at) values(target_tenant_id,item.product_id,item.warehouse_id,item.quantity,now()); end if;
    insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,item.product_id,item.warehouse_id,'adjustment',item.quantity,0,'sale_void',target_sale_id,target_user_id,jsonb_build_object('reason',target_reason));
  end loop;
  update public.receivables set status='cancelled',outstanding_amount=0,updated_at=now() where tenant_id=target_tenant_id and sale_id=target_sale_id and status in ('open','partial');
  update public.sales set status='voided',updated_at=now(),metadata=metadata||jsonb_build_object('voidReason',target_reason,'voidedBy',target_user_id,'voidedAt',now()) where id=target_sale_id and tenant_id=target_tenant_id;
  return jsonb_build_object('saleId',target_sale_id,'status','voided');
end; $$;
revoke all on function public.void_sale(uuid,uuid,uuid,text) from public,anon,authenticated; grant execute on function public.void_sale(uuid,uuid,uuid,text) to service_role;

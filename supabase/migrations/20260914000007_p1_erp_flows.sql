-- P1: credit collection hardening, partial purchases and return disposition.
alter table public.receivable_payments add column if not exists notes text;
alter table public.receivable_payments add column if not exists reference text;

create or replace function public.record_receivable_payment(target_tenant_id uuid,target_sale_id uuid,target_user_id uuid,target_payment_method text,target_amount numeric,target_notes text,target_cash_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.receivables%rowtype; payment_id uuid:=gen_random_uuid(); balance numeric; next_status text;
begin
  if target_payment_method not in ('cash','card','transfer') or target_amount<=0 then raise exception 'INVALID_RECEIVABLE_PAYMENT'; end if;
  select * into r from public.receivables where tenant_id=target_tenant_id and sale_id=target_sale_id and status in ('open','partial') for update;
  if not found then raise exception 'RECEIVABLE_NOT_FOUND'; end if;
  if target_amount>r.outstanding_amount then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
  if target_payment_method='cash' and (target_cash_session_id is null or not exists(select 1 from public.cash_sessions where id=target_cash_session_id and tenant_id=target_tenant_id and branch_id=(select branch_id from public.sales where id=target_sale_id and tenant_id=target_tenant_id) and status='open')) then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  balance:=r.outstanding_amount-target_amount; next_status:=case when balance<=0 then 'paid' else 'partial' end;
  update public.receivables set outstanding_amount=balance,status=next_status,updated_at=now() where id=r.id and tenant_id=target_tenant_id;
  insert into public.receivable_payments(id,tenant_id,receivable_id,amount,payment_method,received_by,notes,reference) values(payment_id,target_tenant_id,r.id,target_amount,target_payment_method,target_user_id,left(coalesce(target_notes,''),300),null);
  if target_payment_method='cash' then insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,target_cash_session_id,'payment',target_amount,'receivable_payment',payment_id,target_user_id,jsonb_build_object('paymentMethod','cash','saleId',target_sale_id,'notes',left(coalesce(target_notes,''),300))); end if;
  return jsonb_build_object('saleId',target_sale_id,'paymentId',payment_id,'paidAmount',target_amount,'balanceDue',balance,'paymentStatus',next_status);
end; $$;
revoke all on function public.record_receivable_payment(uuid,uuid,uuid,text,numeric,text,uuid) from public,anon,authenticated; grant execute on function public.record_receivable_payment(uuid,uuid,uuid,text,numeric,text,uuid) to service_role;

alter table public.sale_returns add column if not exists stock_disposition text not null default 'restock';
alter table public.sale_returns drop constraint if exists sale_returns_stock_disposition_check;
alter table public.sale_returns add constraint sale_returns_stock_disposition_check check (stock_disposition in ('restock','scrap'));

create or replace function public.create_sale_return(target_tenant_id uuid,target_sale_id uuid,target_user_id uuid,target_refund_method text,target_cash_session_id uuid,target_reason text,target_items jsonb,target_stock_disposition text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare sale_row public.sales%rowtype; item jsonb; pid uuid; sale_item public.sale_items%rowtype; stock public.inventory_stocks%rowtype; rid uuid:=gen_random_uuid(); rq numeric; returned numeric; total numeric:=0; final_status text; requested jsonb; disposition text:=case when target_stock_disposition='scrap' then 'scrap' else 'restock' end;
begin
  if target_refund_method not in ('cash','card','transfer','credit') then raise exception 'INVALID_REFUND_METHOD'; end if;
  select * into sale_row from public.sales where id=target_sale_id and tenant_id=target_tenant_id for update; if not found then raise exception 'SALE_NOT_FOUND'; end if; if sale_row.status='voided' then raise exception 'SALE_VOID'; end if;
  if target_refund_method='cash' and (target_cash_session_id is null or not exists(select 1 from public.cash_sessions where id=target_cash_session_id and tenant_id=target_tenant_id and branch_id=sale_row.branch_id and status='open')) then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)=0 then select jsonb_agg(jsonb_build_object('productId',product_id,'quantity',quantity)) into requested from public.sale_items where tenant_id=target_tenant_id and sale_id=target_sale_id; else requested:=target_items; end if;
  if requested is null or jsonb_array_length(requested)=0 then raise exception 'RETURN_LINES_INVALID'; end if;
  insert into public.sale_returns(id,tenant_id,sale_id,branch_id,warehouse_id,amount,refund_method,reason,created_by,stock_disposition) values(rid,target_tenant_id,target_sale_id,sale_row.branch_id,(select warehouse_id from public.sale_items where tenant_id=target_tenant_id and sale_id=target_sale_id limit 1),0,target_refund_method,left(coalesce(target_reason,'Devolución'),300),target_user_id,disposition);
  for item in select value from jsonb_array_elements(requested) loop
    begin pid:=(item->>'productId')::uuid; exception when invalid_text_representation then raise exception 'RETURN_LINES_INVALID'; end;
    rq:=nullif(item->>'quantity','')::numeric; select * into sale_item from public.sale_items where tenant_id=target_tenant_id and sale_id=target_sale_id and product_id=pid limit 1; if not found or rq is null or rq<=0 then raise exception 'RETURN_LINES_INVALID'; end if;
    select coalesce(sum(quantity),0) into returned from public.sale_return_items where tenant_id=target_tenant_id and sale_id=target_sale_id and product_id=pid; if returned+rq>sale_item.quantity then raise exception 'RETURN_EXCEEDS_SOLD'; end if;
    total:=total+(sale_item.unit_price*rq);
    if disposition='restock' then
      select * into stock from public.inventory_stocks where tenant_id=target_tenant_id and product_id=pid and warehouse_id=sale_item.warehouse_id for update;
      if found then update public.inventory_stocks set quantity=quantity+rq,updated_at=now() where id=stock.id; else insert into public.inventory_stocks(tenant_id,product_id,warehouse_id,quantity,updated_at) values(target_tenant_id,pid,sale_item.warehouse_id,rq,now()); end if;
      insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,pid,sale_item.warehouse_id,'return',rq,0,'sale_return',rid,target_user_id,jsonb_build_object('disposition','restock','reason',target_reason));
    else
      insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,pid,sale_item.warehouse_id,'adjustment',-rq,0,'sale_return',rid,target_user_id,jsonb_build_object('disposition','scrap','reason',target_reason));
    end if;
    insert into public.sale_return_items(tenant_id,return_id,sale_id,product_id,warehouse_id,quantity,unit_price,amount) values(target_tenant_id,rid,target_sale_id,pid,sale_item.warehouse_id,rq,sale_item.unit_price,sale_item.unit_price*rq);
  end loop;
  if target_refund_method='cash' then insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,target_cash_session_id,'refund',-total,'sale_return',rid,target_user_id,jsonb_build_object('paymentMethod','cash','disposition',disposition)); elsif target_refund_method='credit' then update public.receivables set outstanding_amount=greatest(0,outstanding_amount-total),status=case when outstanding_amount-total<=0 then 'paid' else 'partial' end,updated_at=now() where tenant_id=target_tenant_id and sale_id=target_sale_id and status in ('open','partial'); end if;
  select case when not exists(select 1 from public.sale_items si where si.tenant_id=target_tenant_id and si.sale_id=target_sale_id and si.quantity>coalesce((select sum(quantity) from public.sale_return_items sri where sri.tenant_id=target_tenant_id and sri.sale_id=target_sale_id and sri.product_id=si.product_id),0)) then 'returned' else 'completed' end into final_status;
  update public.sale_returns set amount=total where id=rid and tenant_id=target_tenant_id; update public.sales set status=final_status,updated_at=now(),metadata=metadata||jsonb_build_object('returnedAmount',coalesce((metadata->>'returnedAmount')::numeric,0)+total) where id=target_sale_id and tenant_id=target_tenant_id;
  return jsonb_build_object('returnId',rid,'saleId',target_sale_id,'amount',total,'refundMethod',target_refund_method,'stockDisposition',disposition,'status',final_status);
end; $$;
revoke all on function public.create_sale_return(uuid,uuid,uuid,text,uuid,text,jsonb,text) from public,anon,authenticated; grant execute on function public.create_sale_return(uuid,uuid,uuid,text,uuid,text,jsonb,text) to service_role;
create or replace function public.create_sale_return(target_tenant_id uuid,target_sale_id uuid,target_user_id uuid,target_refund_method text,target_cash_session_id uuid,target_reason text,target_items jsonb) returns jsonb language sql security definer set search_path=public as $$ select public.create_sale_return($1,$2,$3,$4,$5,$6,$7,'restock'); $$;
revoke all on function public.create_sale_return(uuid,uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated; grant execute on function public.create_sale_return(uuid,uuid,uuid,text,uuid,text,jsonb) to service_role;

alter table public.purchase_items add column if not exists received_quantity numeric(14,4) not null default 0;
update public.purchase_items set received_quantity=quantity where received_quantity=0 and purchase_id in (select id from public.purchases where status='received');
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check check (status in ('draft','ordered','partial','received','cancelled'));

create or replace function public.create_purchase_order(target_tenant_id uuid,target_branch_id uuid,target_warehouse_id uuid,target_supplier_id uuid,target_user_id uuid,target_items jsonb,target_status text default 'ordered') returns jsonb language plpgsql security definer set search_path=public as $$
declare pid uuid:=gen_random_uuid(); item jsonb; product_id uuid; qty numeric; cost numeric; subtotal numeric:=0; status_value text:=case when target_status='draft' then 'draft' else 'ordered' end;
begin
 if not exists(select 1 from public.branches where id=target_branch_id and tenant_id=target_tenant_id and active) then raise exception 'BRANCH_NOT_FOUND'; end if; if not exists(select 1 from public.warehouses where id=target_warehouse_id and tenant_id=target_tenant_id and branch_id=target_branch_id and active) then raise exception 'WAREHOUSE_NOT_FOUND'; end if; if target_supplier_id is null or not exists(select 1 from public.suppliers where id=target_supplier_id and tenant_id=target_tenant_id and active) then raise exception 'SUPPLIER_REQUIRED'; end if; if jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)=0 then raise exception 'INVALID_PURCHASE_ITEMS'; end if;
 insert into public.purchases(id,tenant_id,branch_id,warehouse_id,supplier_id,status,created_by) values(pid,target_tenant_id,target_branch_id,target_warehouse_id,target_supplier_id,status_value,target_user_id);
 for item in select value from jsonb_array_elements(target_items) loop product_id:=(item->>'productId')::uuid; qty:=(item->>'quantity')::numeric; cost:=greatest(coalesce((item->>'unitCost')::numeric,0),0); if qty is null or qty<=0 or qty<>trunc(qty) then raise exception 'INVALID_PURCHASE_QUANTITY'; end if; if not exists(select 1 from public.products where id=product_id and tenant_id=target_tenant_id and active) then raise exception 'PRODUCT_NOT_FOUND'; end if; subtotal:=subtotal+qty*cost; insert into public.purchase_items(tenant_id,purchase_id,product_id,quantity,received_quantity,unit_cost,line_total) values(target_tenant_id,pid,product_id,qty,0,cost,qty*cost); end loop;
 update public.purchases set subtotal=subtotal,total=subtotal,updated_at=now() where id=pid; return jsonb_build_object('purchaseId',pid,'status',status_value,'total',subtotal);
end; $$;
revoke all on function public.create_purchase_order(uuid,uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated; grant execute on function public.create_purchase_order(uuid,uuid,uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.receive_purchase_partial(target_tenant_id uuid,target_purchase_id uuid,target_user_id uuid,target_items jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.purchases%rowtype; item jsonb; pi public.purchase_items%rowtype; qty numeric; stock public.inventory_stocks%rowtype; pending numeric; rec numeric; total_received numeric:=0;
begin select * into p from public.purchases where id=target_purchase_id and tenant_id=target_tenant_id for update; if not found or p.status in ('cancelled','draft') then raise exception 'PURCHASE_NOT_RECEIVABLE'; end if; if jsonb_typeof(target_items)<>'array' then raise exception 'INVALID_PURCHASE_ITEMS'; end if;
 for item in select value from jsonb_array_elements(target_items) loop select * into pi from public.purchase_items where id=(item->>'purchaseItemId')::uuid and purchase_id=p.id and tenant_id=target_tenant_id for update; if not found then raise exception 'PURCHASE_ITEM_NOT_FOUND'; end if; qty:=(item->>'quantity')::numeric; pending:=pi.quantity-pi.received_quantity; if qty is null or qty<=0 or qty>pending then raise exception 'RECEIPT_EXCEEDS_PENDING'; end if; select * into stock from public.inventory_stocks where tenant_id=target_tenant_id and product_id=pi.product_id and warehouse_id=p.warehouse_id for update; if found then update public.inventory_stocks set quantity=quantity+qty,updated_at=now() where id=stock.id; else insert into public.inventory_stocks(tenant_id,product_id,warehouse_id,quantity,updated_at) values(target_tenant_id,pi.product_id,p.warehouse_id,qty,now()); end if; insert into public.inventory_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,performed_by,metadata) values(target_tenant_id,pi.product_id,p.warehouse_id,'purchase',qty,pi.unit_cost,'purchase',p.id,target_user_id,jsonb_build_object('partialReceipt',true,'previousReceived',pi.received_quantity,'newReceived',pi.received_quantity+qty)); update public.purchase_items set received_quantity=received_quantity+qty where id=pi.id; total_received:=total_received+qty; end loop;
 select case when not exists(select 1 from public.purchase_items where purchase_id=p.id and received_quantity<quantity) then 'received' else 'partial' end into rec; update public.purchases set status=rec,updated_at=now() where id=p.id; return jsonb_build_object('purchaseId',p.id,'status',rec,'receivedLines',total_received);
end; $$;
revoke all on function public.receive_purchase_partial(uuid,uuid,uuid,jsonb) from public,anon,authenticated; grant execute on function public.receive_purchase_partial(uuid,uuid,uuid,jsonb) to service_role;

-- Stage 8: atomic cash close, immutable reconciliation, and consolidated reports.
-- Local development only. Do not apply remotely until PostgreSQL validation is authorized.
begin;

create table if not exists public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cash_session_id uuid not null,
  counted_by uuid references auth.users(id) on delete set null,
  expected_by_method jsonb not null default '{}'::jsonb,
  counted_by_method jsonb not null default '{}'::jsonb,
  difference numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, cash_session_id)
);

create index if not exists cash_reconciliations_tenant_created_idx on public.cash_reconciliations(tenant_id, created_at desc);

create or replace function public.cash_session_close_atomic(
  target_tenant_id uuid,
  target_session_id uuid,
  target_user_id uuid,
  target_counted_by_method jsonb,
  target_approve_difference boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare session_row public.cash_sessions%rowtype; movement_row record; opening jsonb; expected jsonb; counted jsonb; difference numeric; reconciliation_id uuid; is_manager boolean;
  cash_total numeric := 0; card_total numeric := 0; transfer_total numeric := 0;
begin
  select * into session_row from public.cash_sessions where id = target_session_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if session_row.status not in ('open', 'pending_review') then raise exception 'SESSION_NOT_OPEN'; end if;
  select exists(select 1 from public.members where tenant_id = target_tenant_id and profile_id = target_user_id and role in ('owner','admin','gerente','jefe') and status = 'active') into is_manager;
  if session_row.status = 'pending_review' then
    expected := coalesce(session_row.metadata->'expectedByMethod', '{}'::jsonb);
    counted := coalesce(session_row.metadata->'countedByMethod', '{}'::jsonb);
    difference := coalesce((session_row.metadata->>'difference')::numeric, 0);
  else
  opening := coalesce(session_row.metadata->'openingByMethod', '{}'::jsonb);
  for movement_row in select amount, metadata from public.cash_movements where tenant_id = target_tenant_id and cash_session_id = target_session_id loop
    if movement_row.metadata->>'paymentMethod' = 'cash' then cash_total := cash_total + movement_row.amount;
    elsif movement_row.metadata->>'paymentMethod' = 'card' then card_total := card_total + movement_row.amount;
    elsif movement_row.metadata->>'paymentMethod' = 'transfer' then transfer_total := transfer_total + movement_row.amount;
    end if;
  end loop;
  expected := jsonb_build_object('cash', coalesce((opening->>'cash')::numeric, 0) + cash_total, 'card', coalesce((opening->>'card')::numeric, 0) + card_total, 'transfer', coalesce((opening->>'transfer')::numeric, 0) + transfer_total);
  counted := jsonb_build_object('cash', greatest(coalesce((target_counted_by_method->>'cash')::numeric, 0), 0), 'card', greatest(coalesce((target_counted_by_method->>'card')::numeric, 0), 0), 'transfer', greatest(coalesce((target_counted_by_method->>'transfer')::numeric, 0), 0));
  difference := round(((counted->>'cash')::numeric - (expected->>'cash')::numeric) + ((counted->>'card')::numeric - (expected->>'card')::numeric) + ((counted->>'transfer')::numeric - (expected->>'transfer')::numeric), 2);
  end if;
  if difference <> 0 and not (target_approve_difference and is_manager) then raise exception 'CASH_DIFFERENCE_REQUIRES_APPROVAL'; end if;
  insert into public.cash_reconciliations(tenant_id, cash_session_id, counted_by, expected_by_method, counted_by_method, difference) values(target_tenant_id, target_session_id, target_user_id, expected, counted, difference) returning id into reconciliation_id;
  update public.cash_sessions set status = 'closed', closed_by = target_user_id, closed_at = now(), closing_amount = (counted->>'cash')::numeric, expected_amount = (expected->>'cash')::numeric, metadata = metadata || jsonb_build_object('expectedByMethod', expected, 'countedByMethod', counted, 'difference', difference, 'reconciliationId', reconciliation_id), updated_at = now() where id = target_session_id and tenant_id = target_tenant_id;
  return jsonb_build_object('status', 'closed', 'reconciliationId', reconciliation_id, 'expectedByMethod', expected, 'countedByMethod', counted, 'difference', difference);
end;
$$;

create or replace function public.report_sales_consolidated(
  target_tenant_id uuid, target_branch_id uuid default null, target_from timestamptz default null, target_to timestamptz default null
) returns table(branch_id uuid, sale_count bigint, subtotal numeric, tax numeric, discount numeric, total numeric, paid numeric, balance_due numeric)
language sql security definer set search_path = public, pg_temp as $$
  select s.branch_id, count(*)::bigint, coalesce(sum(s.subtotal),0), coalesce(sum(s.tax),0), coalesce(sum(s.discount),0), coalesce(sum(s.total),0), coalesce(sum(coalesce(p.paid,0)),0), coalesce(sum(greatest(s.total-coalesce(p.paid,0),0)),0)
    from public.sales s
    left join (select tenant_id, sale_id, sum(amount) paid from public.sale_payments group by tenant_id, sale_id) p on p.tenant_id=s.tenant_id and p.sale_id=s.id
   where s.tenant_id=target_tenant_id and s.status <> 'voided' and (target_branch_id is null or s.branch_id=target_branch_id) and (target_from is null or s.created_at >= target_from) and (target_to is null or s.created_at < target_to)
   group by s.branch_id;
$$;

create or replace function public.report_inventory_kardex_valuation(target_tenant_id uuid, target_branch_id uuid default null)
returns table(warehouse_id uuid, product_id uuid, quantity numeric, average_cost numeric, inventory_value numeric, movement_count bigint)
language sql security definer set search_path = public, pg_temp as $$
  select st.warehouse_id, st.product_id, st.quantity, st.average_cost, round(st.quantity * st.average_cost, 2), count(m.id)::bigint
    from public.inventory_stocks st
    join public.warehouses w on w.id=st.warehouse_id and w.tenant_id=st.tenant_id
    left join public.inventory_movements m on m.tenant_id=st.tenant_id and m.product_id=st.product_id and m.warehouse_id=st.warehouse_id
   where st.tenant_id=target_tenant_id and (target_branch_id is null or w.branch_id=target_branch_id)
   group by st.warehouse_id, st.product_id, st.quantity, st.average_cost;
$$;

create or replace function public.report_receivables_payables_aging(target_tenant_id uuid, target_branch_id uuid default null)
returns table(account_type text, account_id uuid, document_id uuid, party_id uuid, branch_id uuid, original_amount numeric, outstanding_amount numeric, due_date date, aging_bucket text)
language sql security definer set search_path = public, pg_temp as $$
  select 'receivable', r.id, r.sale_id, r.customer_id, s.branch_id, r.original_amount, r.outstanding_amount, r.due_date,
    case when r.due_date is null or r.due_date >= current_date then 'current' when current_date-r.due_date <= 30 then '0-30' when current_date-r.due_date <= 60 then '31-60' when current_date-r.due_date <= 90 then '61-90' else '90+' end
    from public.receivables r join public.sales s on s.id=r.sale_id and s.tenant_id=r.tenant_id
   where r.tenant_id=target_tenant_id and r.outstanding_amount>0 and (target_branch_id is null or s.branch_id=target_branch_id)
  union all
  select 'payable', p.id, p.purchase_id, p.supplier_id, pu.branch_id, p.original_amount, p.outstanding_amount, p.due_date,
    case when p.due_date is null or p.due_date >= current_date then 'current' when current_date-p.due_date <= 30 then '0-30' when current_date-p.due_date <= 60 then '31-60' when current_date-p.due_date <= 90 then '61-90' else '90+' end
    from public.payables p join public.purchases pu on pu.id=p.purchase_id and pu.tenant_id=p.tenant_id
   where p.tenant_id=target_tenant_id and p.outstanding_amount>0 and (target_branch_id is null or pu.branch_id=target_branch_id);
$$;

create or replace function public.report_cash_movements(target_tenant_id uuid, target_branch_id uuid default null, target_from timestamptz default null, target_to timestamptz default null)
returns table(cash_session_id uuid, movement_type text, payment_method text, movement_count bigint, amount numeric)
language sql security definer set search_path = public, pg_temp as $$
  select cm.cash_session_id, cm.movement_type, coalesce(cm.metadata->>'paymentMethod','unknown'), count(*)::bigint, coalesce(sum(cm.amount),0)
    from public.cash_movements cm join public.cash_sessions cs on cs.id=cm.cash_session_id and cs.tenant_id=cm.tenant_id
   where cm.tenant_id=target_tenant_id and (target_branch_id is null or cs.branch_id=target_branch_id) and (target_from is null or cm.created_at>=target_from) and (target_to is null or cm.created_at<target_to)
   group by cm.cash_session_id, cm.movement_type, cm.metadata->>'paymentMethod';
$$;

revoke all on function public.cash_session_close_atomic(uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.report_sales_consolidated(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.report_inventory_kardex_valuation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.report_receivables_payables_aging(uuid, uuid) from public, anon, authenticated;
revoke all on function public.report_cash_movements(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cash_session_close_atomic(uuid, uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.report_sales_consolidated(uuid, uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.report_inventory_kardex_valuation(uuid, uuid) to service_role;
grant execute on function public.report_receivables_payables_aging(uuid, uuid) to service_role;
grant execute on function public.report_cash_movements(uuid, uuid, timestamptz, timestamptz) to service_role;

commit;

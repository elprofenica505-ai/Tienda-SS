-- Historical cash refunds may predate paymentMethod metadata. The safe legacy
-- default is cash, matching the original sale payment in the affected session.
begin;

create or replace function public.cash_session_close_atomic(
  target_tenant_id uuid,
  target_session_id uuid,
  target_user_id uuid,
  target_counted_by_method jsonb,
  target_approve_difference boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.cash_sessions%rowtype;
  movement_row record;
  opening jsonb;
  expected jsonb;
  counted jsonb;
  difference numeric;
  reconciliation_id uuid;
  is_manager boolean;
  cash_total numeric := 0;
  card_total numeric := 0;
  transfer_total numeric := 0;
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
      if coalesce(movement_row.metadata->>'paymentMethod', 'cash') = 'cash' then cash_total := cash_total + movement_row.amount;
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

revoke all on function public.cash_session_close_atomic(uuid, uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.cash_session_close_atomic(uuid, uuid, uuid, jsonb, boolean) to service_role;

commit;

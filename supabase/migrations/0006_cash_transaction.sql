-- Atomic cash register session operations for Supabase-only ERP.
alter table public.cash_sessions drop constraint if exists cash_sessions_status_check;
alter table public.cash_sessions add constraint cash_sessions_status_check check (status in ('open','pending_review','closed','cancelled'));

create or replace function public.cash_session_action(
  target_action text,
  target_tenant_id uuid,
  target_branch_id uuid,
  target_register_id uuid,
  target_session_id uuid,
  target_user_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.cash_sessions%rowtype;
  new_session_id uuid;
  new_movement_id uuid;
  opening jsonb;
  counted jsonb;
  expected jsonb;
  difference numeric;
  method text;
  amount numeric;
  direction text;
  current_value numeric;
  opening_amount numeric;
  sales_cash numeric := 0;
  sales_card numeric := 0;
  sales_transfer numeric := 0;
  movements_cash numeric := 0;
  movements_card numeric := 0;
  movements_transfer numeric := 0;
  movement_row record;
begin
  if target_action = 'open' then
    if not exists (select 1 from public.branches where id=target_branch_id and tenant_id=target_tenant_id and active) then raise exception 'BRANCH_NOT_FOUND'; end if;
    if not exists (select 1 from public.cash_registers where id=target_register_id and tenant_id=target_tenant_id and branch_id=target_branch_id and active) then raise exception 'REGISTER_NOT_FOUND'; end if;
    if exists (select 1 from public.cash_sessions where tenant_id=target_tenant_id and branch_id=target_branch_id and cash_register_id=target_register_id and status='open') then raise exception 'SESSION_ALREADY_OPEN'; end if;
    opening := jsonb_build_object('cash', greatest(coalesce((target_payload->'openingByMethod'->>'cash')::numeric,0),0), 'card', greatest(coalesce((target_payload->'openingByMethod'->>'card')::numeric,0),0), 'transfer', greatest(coalesce((target_payload->'openingByMethod'->>'transfer')::numeric,0),0));
    insert into public.cash_sessions(id,tenant_id,branch_id,cash_register_id,opened_by,status,opening_amount,metadata) values(gen_random_uuid(),target_tenant_id,target_branch_id,target_register_id,target_user_id,'open',coalesce((opening->>'cash')::numeric,0),jsonb_build_object('openingByMethod',opening,'currency','NIO')) returning id into new_session_id;
    return jsonb_build_object('id',new_session_id,'branchId',target_branch_id,'registerId',target_register_id,'status','open','openingByMethod',opening,'currency','NIO');
  end if;

  select * into session_row from public.cash_sessions where id=target_session_id and tenant_id=target_tenant_id and branch_id=target_branch_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if target_action = 'movement' then
    if session_row.status <> 'open' then raise exception 'SESSION_NOT_OPEN'; end if;
    method := target_payload->>'paymentMethod'; amount := greatest(coalesce((target_payload->>'amount')::numeric,0),0); direction := target_payload->>'direction';
    if method not in ('cash','card','transfer') or amount <= 0 or direction not in ('in','out') then raise exception 'INVALID_CASH_MOVEMENT'; end if;
    insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,reference_type,performed_by,metadata) values(target_tenant_id,target_session_id,case when direction='in' then 'deposit' else 'withdrawal' end,case when direction='in' then amount else -amount end,'manual',target_user_id,jsonb_build_object('paymentMethod',method,'direction',direction,'description',target_payload->>'description','notes',target_payload->>'notes')) returning id into new_movement_id;
    return jsonb_build_object('id',new_movement_id,'cashSessionId',target_session_id,'amount',amount,'paymentMethod',method,'direction',direction);
  end if;

  opening := coalesce(session_row.metadata->'openingByMethod','{}'::jsonb);
  for movement_row in select amount, metadata from public.cash_movements where tenant_id=target_tenant_id and cash_session_id=target_session_id loop
    method := movement_row.metadata->>'paymentMethod';
    if method='cash' then movements_cash := movements_cash + movement_row.amount; elsif method='card' then movements_card := movements_card + movement_row.amount; elsif method='transfer' then movements_transfer := movements_transfer + movement_row.amount; end if;
  end loop;
  expected := jsonb_build_object('cash',coalesce((opening->>'cash')::numeric,0)+movements_cash+sales_cash,'card',coalesce((opening->>'card')::numeric,0)+movements_card+sales_card,'transfer',coalesce((opening->>'transfer')::numeric,0)+movements_transfer+sales_transfer);

  if target_action = 'count' then
    if session_row.status <> 'open' then raise exception 'SESSION_NOT_OPEN'; end if;
    counted := jsonb_build_object('cash',greatest(coalesce((target_payload->'countedByMethod'->>'cash')::numeric,0),0),'card',greatest(coalesce((target_payload->'countedByMethod'->>'card')::numeric,0),0),'transfer',greatest(coalesce((target_payload->'countedByMethod'->>'transfer')::numeric,0),0));
    difference := round(((counted->>'cash')::numeric-(expected->>'cash')::numeric)+((counted->>'card')::numeric-(expected->>'card')::numeric)+((counted->>'transfer')::numeric-(expected->>'transfer')::numeric),2);
    update public.cash_sessions set status='pending_review',closing_amount=(counted->>'cash')::numeric,expected_amount=(expected->>'cash')::numeric,metadata=metadata||jsonb_build_object('countedByMethod',counted,'expectedByMethod',expected,'difference',difference,'countedBy',target_user_id,'countedAt',now()),updated_at=now() where id=target_session_id and tenant_id=target_tenant_id;
    return jsonb_build_object('status','pending_review','expectedByMethod',expected,'countedByMethod',counted,'difference',difference);
  end if;

  if target_action in ('close','approve') then
    if session_row.status <> 'pending_review' then raise exception 'SESSION_NOT_COUNTED'; end if;
    difference := coalesce((session_row.metadata->>'difference')::numeric,0);
    if target_action='close' and difference <> 0 and not exists (select 1 from public.members where tenant_id=target_tenant_id and profile_id=target_user_id and role in ('owner','admin','gerente','jefe') and status='active') then raise exception 'MANAGER_REQUIRED'; end if;
    update public.cash_sessions set status='closed',closed_by=target_user_id,closed_at=now(),updated_at=now() where id=target_session_id and tenant_id=target_tenant_id;
    return jsonb_build_object('status','closed','closedBy',target_user_id,'difference',difference);
  end if;
  raise exception 'UNSUPPORTED_CASH_ACTION';
end;
$$;

revoke all on function public.cash_session_action(text,uuid,uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.cash_session_action(text,uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;

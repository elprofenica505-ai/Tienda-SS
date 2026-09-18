-- Stage 1 draft/implementation: append-only audit and client write lockdown.
-- This migration is intentionally local-only until validated in an isolated database.
begin;

create extension if not exists pgcrypto;

-- audit_logs is readable by tenant members but never directly mutable by clients.
drop policy if exists audit_logs_update_admin on public.audit_logs;
drop policy if exists audit_logs_insert_admin on public.audit_logs;
revoke insert, update, delete on public.audit_logs from anon, authenticated;

alter table public.audit_logs
  add column if not exists sequence bigint,
  add column if not exists previous_hash text,
  add column if not exists entry_hash text,
  add column if not exists request_id text;

create unique index if not exists audit_logs_tenant_sequence_key
  on public.audit_logs (tenant_id, sequence)
  where sequence is not null;

create or replace function public.append_audit_log(
  target_tenant_id uuid,
  target_actor_id uuid,
  target_action text,
  target_resource_type text,
  target_resource_id uuid,
  target_metadata jsonb,
  target_request_id text,
  target_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_sequence bigint;
  prior_hash text;
  new_hash text;
  new_id uuid;
  payload jsonb;
begin
  if target_tenant_id is null or target_action is null or length(trim(target_action)) = 0 then
    raise exception 'INVALID_AUDIT_EVENT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text, 0));

  select greatest(
    coalesce(max(sequence), 0),
    coalesce(max(case when metadata->>'sequence' ~ '^[0-9]+$' then (metadata->>'sequence')::bigint else 0 end), 0)
  ) + 1
    into next_sequence
    from public.audit_logs
   where tenant_id = target_tenant_id;

  select coalesce(
    (select entry_hash from public.audit_logs where tenant_id = target_tenant_id and sequence is not null order by sequence desc limit 1),
    (select metadata->>'hash' from public.audit_logs where tenant_id = target_tenant_id order by created_at desc, id desc limit 1),
    'GENESIS'
  ) into prior_hash;

  payload := jsonb_build_object(
    'sequence', next_sequence,
    'tenantId', target_tenant_id,
    'actorUid', target_actor_id,
    'action', target_action,
    'entity', target_resource_type,
    'entityId', target_resource_id,
    'requestId', target_request_id,
    'payload', coalesce(target_payload, '{}'::jsonb),
    'previousHash', prior_hash
  );

  new_hash := encode(digest(payload::text, 'sha256'), 'hex');

  insert into public.audit_logs(
    tenant_id, actor_id, action, resource_type, resource_id, metadata,
    sequence, previous_hash, entry_hash, request_id
  ) values (
    target_tenant_id, target_actor_id, target_action, target_resource_type,
    target_resource_id,
    coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object('audit', payload, 'hash', new_hash, 'sequence', next_sequence),
    next_sequence, prior_hash, new_hash, target_request_id
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.append_audit_log(uuid, uuid, text, text, uuid, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.append_audit_log(uuid, uuid, text, text, uuid, jsonb, text, jsonb)
  to service_role;

-- Critical operational tables are mutated only through their SECURITY DEFINER RPCs.
revoke insert, update, delete on public.inventory_stocks, public.inventory_movements,
  public.cash_movements, public.fiscal_documents from anon, authenticated;

commit;

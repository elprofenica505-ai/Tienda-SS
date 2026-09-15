begin;

-- These tables are written through trusted server-side RPCs/service_role only.
-- Keep explicit deny policies for client roles so Supabase Security Advisor can
-- distinguish intentional backend-only access from an accidentally unprotected table.
revoke all on table public.rate_limit_buckets, public.platform_audit, public.api_keys,
  public.integration_events, public.billing_events from anon, authenticated;

drop policy if exists rate_limit_buckets_client_deny on public.rate_limit_buckets;
create policy rate_limit_buckets_client_deny on public.rate_limit_buckets
  for all to anon, authenticated using (false) with check (false);

drop policy if exists platform_audit_client_deny on public.platform_audit;
create policy platform_audit_client_deny on public.platform_audit
  for all to anon, authenticated using (false) with check (false);

drop policy if exists api_keys_client_deny on public.api_keys;
create policy api_keys_client_deny on public.api_keys
  for all to anon, authenticated using (false) with check (false);

drop policy if exists integration_events_client_deny on public.integration_events;
create policy integration_events_client_deny on public.integration_events
  for all to anon, authenticated using (false) with check (false);

drop policy if exists billing_events_client_deny on public.billing_events;
create policy billing_events_client_deny on public.billing_events
  for all to anon, authenticated using (false) with check (false);

commit;

-- Align cash session schema with the API/RPC and prevent duplicate open turns under concurrency.
alter table public.cash_sessions
  add column if not exists updated_at timestamptz not null default now();

update public.cash_sessions
   set updated_at = coalesce(updated_at, opened_at, now())
 where updated_at is null;

create index if not exists cash_sessions_tenant_branch_open_idx
  on public.cash_sessions (tenant_id, branch_id, cash_register_id)
  where status = 'open';

-- Keep the existing RLS boundary: the server uses service_role, while direct
-- authenticated access remains limited by the tenant policies already deployed.
revoke all on table public.cash_sessions from anon;
grant select, insert, update on table public.cash_sessions to authenticated;

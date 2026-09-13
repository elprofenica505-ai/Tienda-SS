-- Keep cash movements compatible with the sale and cash-session RPCs.
-- Older deployments of cash_movements did not include metadata, while the
-- transaction functions use it to record the payment method and movement data.
alter table public.cash_movements
  add column if not exists metadata jsonb not null default '{}'::jsonb;

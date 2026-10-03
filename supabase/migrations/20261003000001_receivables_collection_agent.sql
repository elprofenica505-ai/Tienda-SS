-- Agente de Cobranza Automática: autorización WhatsApp por cliente + bitácora de entregas y respuestas.
-- La configuración por tenant vive en tenant_settings (setting_key = receivables_reminders).

begin;

alter table public.customers
  add column if not exists whatsapp_opt_in boolean not null default false;

comment on column public.customers.whatsapp_opt_in is
  'Consentimiento explícito del cliente para recibir recordatorios de cobranza por WhatsApp.';

create table if not exists public.receivable_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid,
  customer_id uuid not null,
  receivable_id uuid not null,
  event_type text not null check (event_type in ('customer_reminder', 'owner_overdue', 'owner_no_response')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  dedupe_key text not null,
  customer_name text not null default '',
  phone text,
  message text not null default '',
  provider text check (provider in ('meta', 'twilio')),
  provider_message_id text,
  error text,
  sent_at timestamptz,
  response_at timestamptz,
  response_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key),
  foreign key (customer_id, tenant_id)
    references public.customers(id, tenant_id) on delete restrict,
  foreign key (receivable_id, tenant_id)
    references public.receivables(id, tenant_id) on delete restrict,
  foreign key (branch_id, tenant_id)
    references public.branches(id, tenant_id) on delete restrict
);

create index if not exists receivable_reminder_logs_tenant_created_idx
  on public.receivable_reminder_logs (tenant_id, created_at desc);

create index if not exists receivable_reminder_logs_receivable_event_idx
  on public.receivable_reminder_logs (tenant_id, receivable_id, event_type, created_at desc);

create index if not exists receivable_reminder_logs_pending_response_idx
  on public.receivable_reminder_logs (phone, sent_at desc)
  where event_type = 'customer_reminder' and status = 'sent' and response_at is null;

create index if not exists customers_whatsapp_opt_in_idx
  on public.customers (tenant_id, whatsapp_opt_in)
  where whatsapp_opt_in = true;

alter table public.receivable_reminder_logs enable row level security;
revoke all on table public.receivable_reminder_logs from public, anon, authenticated;
grant select, insert, update on table public.receivable_reminder_logs to service_role;

commit;

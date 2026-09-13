-- Track whether the owner completed the initial onboarding wizard.
alter table public.tenants
  add column if not exists onboarding_completed boolean not null default false;

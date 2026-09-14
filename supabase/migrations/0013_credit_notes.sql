create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  sale_id uuid not null,
  branch_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'applied' check (status in ('applied','voided')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (sale_id, tenant_id) references public.sales(id, tenant_id) on delete restrict,
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict
);
create index if not exists credit_notes_sale_idx on public.credit_notes (tenant_id, sale_id, created_at desc);
alter table public.credit_notes enable row level security;
revoke all on table public.credit_notes from anon, authenticated;
grant select on table public.credit_notes to authenticated;
create policy credit_notes_select_member on public.credit_notes for select to authenticated using (public.has_tenant_access(tenant_id));

create or replace function public.create_credit_note(
  target_tenant_id uuid,
  target_sale_id uuid,
  target_branch_id uuid,
  target_user_id uuid,
  target_amount numeric,
  target_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare sale_row public.sales%rowtype; note_id uuid:=gen_random_uuid(); credited numeric; total numeric; paid numeric; balance numeric; payment_status text; note_total numeric; receivable_row public.receivables%rowtype;
begin
  if target_amount <= 0 or length(trim(coalesce(target_reason,''))) < 3 then raise exception 'INVALID_CREDIT_NOTE'; end if;
  select * into sale_row from public.sales where id=target_sale_id and tenant_id=target_tenant_id for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if sale_row.status in ('voided','pending') then raise exception 'SALE_VOID'; end if;
  if sale_row.branch_id <> target_branch_id then raise exception 'SALE_WRONG_BRANCH'; end if;
  total := sale_row.total;
  select coalesce(sum(amount),0) into note_total from public.credit_notes where tenant_id=target_tenant_id and sale_id=target_sale_id and status='applied';
  if note_total + target_amount > total then raise exception 'CREDIT_NOTE_EXCEEDS_TOTAL'; end if;
  credited := note_total + target_amount;
  paid := coalesce((sale_row.metadata->>'paidAmount')::numeric,0);
  balance := greatest(0,total-credited-paid);
  payment_status := case when balance <= 0 then 'paid' when paid > 0 then 'partial' else 'pending' end;
  insert into public.credit_notes(id,tenant_id,sale_id,branch_id,amount,reason,created_by) values(note_id,target_tenant_id,target_sale_id,target_branch_id,target_amount,left(trim(target_reason),300),target_user_id);
  update public.sales set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('creditedTotal',credited,'balanceDue',balance,'paymentStatus',payment_status),updated_at=now() where id=target_sale_id and tenant_id=target_tenant_id;
  select * into receivable_row from public.receivables where tenant_id=target_tenant_id and sale_id=target_sale_id and status in ('open','partial') for update;
  if found then
    update public.receivables set outstanding_amount=greatest(0,outstanding_amount-target_amount),status=case when greatest(0,outstanding_amount-target_amount)<=0 then 'paid' else 'partial' end,updated_at=now() where id=receivable_row.id and tenant_id=target_tenant_id;
  end if;
  return jsonb_build_object('saleId',target_sale_id,'creditNoteId',note_id,'amount',target_amount,'creditedTotal',credited,'balanceDue',balance,'paymentStatus',payment_status);
end; $$;
revoke all on function public.create_credit_note(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.create_credit_note(uuid,uuid,uuid,uuid,numeric,text) to service_role;

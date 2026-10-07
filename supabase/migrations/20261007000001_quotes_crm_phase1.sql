-- Cotizaciones + CRM fase 1. Todo aditivo y aislado por tenant.
begin;

alter table public.customers
  add column if not exists origin_channel text,
  add column if not exists origin_branch_id uuid;

-- Necesario para enlazar cotización y preventa sin perder el aislamiento por empresa.
create unique index if not exists presales_id_tenant_unique_idx on public.presales (id, tenant_id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  branch_id uuid not null,
  quote_number bigint not null,
  customer_id uuid,
  seller_uid uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired','converted')),
  valid_until date not null,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  currency text not null default 'NIO',
  notes text,
  terms text,
  rejection_reason text,
  sent_at timestamptz,
  decided_at timestamptz,
  converted_presale_id uuid,
  converted_sale_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, quote_number),
  unique (id, tenant_id),
  foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete restrict,
  foreign key (converted_presale_id, tenant_id) references public.presales(id, tenant_id) on delete set null,
  foreign key (converted_sale_id, tenant_id) references public.sales(id, tenant_id) on delete set null
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  quote_id uuid not null,
  product_id uuid not null,
  description text not null,
  sku text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  line_subtotal numeric(14,2) not null check (line_subtotal >= 0),
  line_tax numeric(14,2) not null default 0 check (line_tax >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (quote_id, tenant_id) references public.quotes(id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict
);

create table if not exists public.crm_customer_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  customer_id uuid not null,
  author_uid uuid references auth.users(id) on delete set null,
  note text not null check (length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete cascade
);

create table if not exists public.crm_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  vip_min_spend numeric(14,2) not null default 50000 check (vip_min_spend >= 0),
  recurrent_min_purchases integer not null default 4 check (recurrent_min_purchases >= 1),
  inactive_days integer not null default 90 check (inactive_days >= 1),
  stalled_quote_days integer not null default 3 check (stalled_quote_days >= 1),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alert_key text not null,
  alert_type text not null check (alert_type in ('customer_recontact','stalled_quote')),
  customer_id uuid,
  quote_id uuid,
  title text not null,
  message text not null,
  is_active boolean not null default true,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (tenant_id, alert_key),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete cascade,
  foreign key (quote_id, tenant_id) references public.quotes(id, tenant_id) on delete cascade
);

create index if not exists quotes_branch_period_idx on public.quotes (tenant_id, branch_id, created_at desc);
create index if not exists quotes_customer_idx on public.quotes (tenant_id, customer_id, created_at desc);
create index if not exists quotes_status_idx on public.quotes (tenant_id, status, updated_at desc);
create index if not exists quotes_expiry_idx on public.quotes (tenant_id, valid_until) where status in ('draft','sent');
create index if not exists quote_items_product_idx on public.quote_items (tenant_id, product_id, created_at desc);
create index if not exists quote_items_quote_idx on public.quote_items (tenant_id, quote_id);
create index if not exists crm_notes_customer_idx on public.crm_customer_notes (tenant_id, customer_id, created_at desc);
create index if not exists crm_alerts_active_idx on public.crm_alerts (tenant_id, is_active, last_detected_at desc);
create index if not exists sales_customer_created_idx on public.sales (tenant_id, customer_id, created_at desc);

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.crm_customer_notes enable row level security;
alter table public.crm_settings enable row level security;
alter table public.crm_alerts enable row level security;

revoke all on table public.quotes, public.quote_items, public.crm_customer_notes, public.crm_settings, public.crm_alerts from anon, authenticated;
grant select, insert, update on table public.quotes, public.quote_items, public.crm_customer_notes, public.crm_settings, public.crm_alerts to service_role;

create policy quotes_tenant_select on public.quotes for select to authenticated using (public.has_tenant_access(tenant_id));
create policy quote_items_tenant_select on public.quote_items for select to authenticated using (public.has_tenant_access(tenant_id));
create policy crm_notes_tenant_select on public.crm_customer_notes for select to authenticated using (public.has_tenant_access(tenant_id));
create policy crm_settings_tenant_select on public.crm_settings for select to authenticated using (public.has_tenant_access(tenant_id));
create policy crm_alerts_tenant_select on public.crm_alerts for select to authenticated using (public.has_tenant_access(tenant_id));

-- Crea una cotización usando exclusivamente el motor comercial vigente.
create or replace function public.create_commercial_quote(
  target_tenant_id uuid, target_branch_id uuid, target_customer_id uuid,
  target_user_id uuid, target_valid_until date, target_currency text,
  target_notes text, target_terms text, target_items jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  quote_id uuid := gen_random_uuid(); next_number bigint; raw_item jsonb; product_row public.products%rowtype;
  product_id uuid; quantity numeric; priced record; unit_price numeric; line_subtotal numeric; line_tax numeric;
  subtotal_value numeric := 0; tax_value numeric := 0;
begin
  if target_valid_until < current_date then raise exception 'QUOTE_VALIDITY_INVALID'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) < 1 or jsonb_array_length(target_items) > 50 then raise exception 'QUOTE_ITEMS_REQUIRED'; end if;
  perform 1 from public.branches where id=target_branch_id and tenant_id=target_tenant_id and active for share;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if target_customer_id is not null and not exists(select 1 from public.customers where id=target_customer_id and tenant_id=target_tenant_id and active) then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':quote-number', 0));
  select coalesce(max(quote_number),0)+1 into next_number from public.quotes where tenant_id=target_tenant_id;
  insert into public.quotes(id,tenant_id,branch_id,quote_number,customer_id,seller_uid,valid_until,currency,notes,terms)
  values(quote_id,target_tenant_id,target_branch_id,next_number,target_customer_id,target_user_id,target_valid_until,coalesce(nullif(target_currency,''),'NIO'),nullif(trim(target_notes),''),nullif(trim(target_terms),''));
  for raw_item in select value from jsonb_array_elements(target_items) loop
    begin product_id := (raw_item->>'productId')::uuid; exception when others then raise exception 'PRODUCT_NOT_FOUND'; end;
    quantity := nullif(raw_item->>'quantity','')::numeric;
    if quantity is null or quantity <= 0 then raise exception 'INVALID_SALE_QUANTITY'; end if;
    select * into product_row from public.products where id=product_id and tenant_id=target_tenant_id and active for share;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    select * into priced from public.erp_commercial_price_items(target_tenant_id,target_branch_id,target_customer_id,target_user_id,jsonb_build_object('saleType','quote'),jsonb_build_array(jsonb_build_object('productId',product_id,'quantity',quantity)));
    line_subtotal := round(priced.subtotal,2); line_tax := round(priced.tax_amount,2); unit_price := round(line_subtotal/quantity,4);
    insert into public.quote_items(tenant_id,quote_id,product_id,description,sku,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total)
    values(target_tenant_id,quote_id,product_id,product_row.name,product_row.sku,quantity,unit_price,product_row.tax_rate,line_subtotal,line_tax,line_subtotal+line_tax);
    subtotal_value := subtotal_value+line_subtotal; tax_value := tax_value+line_tax;
  end loop;
  update public.quotes set subtotal=round(subtotal_value,2),tax_amount=round(tax_value,2),total=round(subtotal_value+tax_value,2),updated_at=now() where id=quote_id;
  return jsonb_build_object('id',quote_id,'quoteNumber',next_number,'subtotal',round(subtotal_value,2),'taxAmount',round(tax_value,2),'total',round(subtotal_value+tax_value,2));
end; $$;

-- Conversión protegida: una cotización solo genera una preventa.
create or replace function public.convert_quote_to_presale(target_tenant_id uuid, target_quote_id uuid, target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.quotes%rowtype; presale_id uuid; presale_code text; items_value jsonb;
begin
  select * into q from public.quotes where id=target_quote_id and tenant_id=target_tenant_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if q.converted_presale_id is not null then return jsonb_build_object('presaleId',q.converted_presale_id,'replayed',true); end if;
  if q.status not in ('sent','accepted') then raise exception 'QUOTE_NOT_CONVERTIBLE'; end if;
  if q.valid_until < current_date then update public.quotes set status='expired',updated_at=now() where id=q.id; raise exception 'QUOTE_EXPIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.description,'sku',i.sku,'quantity',i.quantity,'unitPrice',i.unit_price,'total',i.line_total) order by i.created_at),'[]'::jsonb) into items_value from public.quote_items i where i.tenant_id=target_tenant_id and i.quote_id=q.id;
  presale_id := gen_random_uuid(); presale_code := 'Q-' || q.quote_number::text || '-' || upper(substr(replace(presale_id::text,'-',''),1,6));
  insert into public.presales(id,tenant_id,branch_id,ticket_code,items,total,seller_uid,seller_email,seller_role,status,metadata)
  values(presale_id,target_tenant_id,q.branch_id,presale_code,items_value,q.total,q.seller_uid,null,null,'sent_to_cashier',jsonb_build_object('quoteId',q.id,'quoteNumber',q.quote_number,'customerId',q.customer_id,'quotedTotal',q.total,'priceLockedUntil',q.valid_until));
  update public.quotes set status='converted',converted_presale_id=presale_id,decided_at=coalesce(decided_at,now()),updated_at=now() where id=q.id;
  return jsonb_build_object('presaleId',presale_id,'ticketCode',presale_code,'replayed',false);
end; $$;

create or replace function public.generate_crm_daily_alerts()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  update public.quotes set status='expired',updated_at=now() where status in ('draft','sent') and valid_until < current_date;
  insert into public.crm_alerts(tenant_id,alert_key,alert_type,customer_id,title,message,last_detected_at,is_active,resolved_at)
  select c.tenant_id,'recontact:'||c.id,'customer_recontact',c.id,'Recontactar a '||c.name,'No registra compras dentro del plazo configurado.',now(),true,null
  from public.customers c left join public.crm_settings cfg on cfg.tenant_id=c.tenant_id
  where c.active and not exists(select 1 from public.sales s where s.tenant_id=c.tenant_id and s.customer_id=c.id and s.status='completed' and s.created_at >= now()-(coalesce(cfg.inactive_days,90)||' days')::interval)
  on conflict(tenant_id,alert_key) do update set last_detected_at=excluded.last_detected_at,is_active=true,resolved_at=null;
  insert into public.crm_alerts(tenant_id,alert_key,alert_type,customer_id,quote_id,title,message,last_detected_at,is_active,resolved_at)
  select q.tenant_id,'stalled:'||q.id,'stalled_quote',q.customer_id,q.id,'Cotización sin respuesta','La cotización #'||q.quote_number||' continúa enviada sin respuesta.',now(),true,null
  from public.quotes q left join public.crm_settings cfg on cfg.tenant_id=q.tenant_id
  where q.status='sent' and q.sent_at < now()-(coalesce(cfg.stalled_quote_days,3)||' days')::interval
  on conflict(tenant_id,alert_key) do update set last_detected_at=excluded.last_detected_at,is_active=true,resolved_at=null;
  update public.crm_alerts a set is_active=false,resolved_at=now() where is_active and ((alert_type='stalled_quote' and not exists(select 1 from public.quotes q where q.id=a.quote_id and q.tenant_id=a.tenant_id and q.status='sent')) or (alert_type='customer_recontact' and exists(select 1 from public.sales s where s.tenant_id=a.tenant_id and s.customer_id=a.customer_id and s.status='completed' and s.created_at>a.last_detected_at)));
  get diagnostics changed = row_count;
  return jsonb_build_object('ok',true,'resolved',changed);
end; $$;

revoke all on function public.create_commercial_quote(uuid,uuid,uuid,uuid,date,text,text,text,jsonb), public.convert_quote_to_presale(uuid,uuid,uuid), public.generate_crm_daily_alerts() from public,anon,authenticated;
grant execute on function public.create_commercial_quote(uuid,uuid,uuid,uuid,date,text,text,text,jsonb), public.convert_quote_to_presale(uuid,uuid,uuid), public.generate_crm_daily_alerts() to service_role;

commit;

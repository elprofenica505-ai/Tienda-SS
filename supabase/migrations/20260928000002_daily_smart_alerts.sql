-- Fase 2: alertas comerciales diarias, guardadas por empresa y generadas con SQL.
-- No consulta proveedores de IA ni servicios de mensajería.

begin;

create table if not exists public.daily_smart_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alert_key text not null,
  alert_type text not null check (alert_type in ('low_stock', 'overdue_receivables', 'sales_comparison', 'no_movement')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_read boolean not null default false,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  read_at timestamptz,
  read_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, alert_key)
);

create index if not exists daily_smart_alerts_tenant_active_idx
  on public.daily_smart_alerts (tenant_id, is_active, last_detected_at desc);

create index if not exists daily_smart_alerts_type_active_idx
  on public.daily_smart_alerts (tenant_id, alert_type, is_active);

create index if not exists inventory_movements_tenant_product_created_idx
  on public.inventory_movements (tenant_id, product_id, created_at desc);

alter table public.daily_smart_alerts enable row level security;
revoke all on table public.daily_smart_alerts from public, anon, authenticated;
grant select, insert, update on table public.daily_smart_alerts to service_role;

create or replace function public.generate_daily_smart_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tenant_row record;
  tenant_timezone text;
  tenant_currency text;
  generated_at timestamptz;
  tenant_today date;
  today_start timestamptz;
  tomorrow_start timestamptz;
  movement_cutoff timestamptz;
  today_sales numeric(14,2);
  weekday_average numeric(14,2);
  changed_count integer;
  tenant_count integer := 0;
  active_alert_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;

  for tenant_row in
    select t.id, t.timezone, t.currency
    from public.tenants t
    where t.status = 'active'
    order by t.id
  loop
    generated_at := clock_timestamp();
    tenant_timezone := tenant_row.timezone;
    tenant_currency := coalesce(nullif(tenant_row.currency, ''), 'NIO');

    if not exists (select 1 from pg_timezone_names z where z.name = tenant_timezone) then
      tenant_timezone := 'America/Managua';
    end if;

    tenant_today := (generated_at at time zone tenant_timezone)::date;
    today_start := tenant_today::timestamp without time zone at time zone tenant_timezone;
    tomorrow_start := (tenant_today + 1)::timestamp without time zone at time zone tenant_timezone;
    movement_cutoff := (tenant_today - 30)::timestamp without time zone at time zone tenant_timezone;

    select coalesce(sum(s.total), 0)::numeric(14,2)
      into today_sales
    from public.sales s
    where s.tenant_id = tenant_row.id
      and s.status = 'completed'
      and s.created_at >= today_start
      and s.created_at < tomorrow_start;

    select coalesce(avg(daily.total), 0)::numeric(14,2)
      into weekday_average
    from (values (7), (14), (21), (28)) as offsets(days_back)
    cross join lateral (
      select coalesce(sum(s.total), 0)::numeric as total
      from public.sales s
      where s.tenant_id = tenant_row.id
        and s.status = 'completed'
        and s.created_at >= ((tenant_today - offsets.days_back)::timestamp without time zone at time zone tenant_timezone)
        and s.created_at < (((tenant_today - offsets.days_back) + 1)::timestamp without time zone at time zone tenant_timezone)
    ) as daily;

    with stock_alerts as (
      select
        'low_stock:' || p.id::text as alert_key,
        'low_stock'::text as alert_type,
        'warning'::text as severity,
        'Stock bajo: ' || p.name as title,
        format(
          'Stock actual: %s %s; mínimo configurado: %s.',
          to_char(stock.total_quantity, 'FM999999999990D9999'),
          p.unit,
          to_char(p.min_stock, 'FM999999999990D9999')
        ) as message,
        jsonb_build_object(
          'productId', p.id,
          'productName', p.name,
          'sku', p.sku,
          'stock', stock.total_quantity,
          'minimum', p.min_stock
        ) as metadata
      from public.products p
      cross join lateral (
        select coalesce(sum(s.quantity), 0)::numeric as total_quantity
        from public.inventory_stocks s
        join public.warehouses w
          on w.id = s.warehouse_id
         and w.tenant_id = s.tenant_id
         and w.active = true
        where s.tenant_id = tenant_row.id
          and s.product_id = p.id
      ) as stock
      where p.tenant_id = tenant_row.id
        and p.active = true
        and p.item_type <> 'service'
        and stock.total_quantity < p.min_stock
    ), overdue_summary as (
      select count(*)::integer as overdue_count,
             coalesce(sum(r.outstanding_amount), 0)::numeric(14,2) as overdue_total
      from public.receivables r
      where r.tenant_id = tenant_row.id
        and r.status in ('open', 'partial')
        and r.outstanding_amount > 0
        and r.due_date is not null
        and r.due_date < tenant_today
    ), overdue_alerts as (
      select
        'overdue_receivables'::text as alert_key,
        'overdue_receivables'::text as alert_type,
        'warning'::text as severity,
        'Créditos vencidos'::text as title,
        format(
          '%s cuentas vencidas por un total de %s %s.',
          overdue_count,
          tenant_currency,
          to_char(overdue_total, 'FM999999999999990D00')
        ) as message,
        jsonb_build_object(
          'count', overdue_count,
          'amount', overdue_total,
          'currency', tenant_currency,
          'asOfDate', tenant_today
        ) as metadata
      from overdue_summary
      where overdue_total > 0
    ), sales_alerts as (
      select
        'sales_comparison'::text as alert_key,
        'sales_comparison'::text as alert_type,
        case when today_sales < weekday_average then 'warning' else 'info' end::text as severity,
        case when today_sales < weekday_average then 'Ventas debajo del promedio' else 'Comparación de ventas' end::text as title,
        case
          when today_sales < weekday_average and weekday_average > 0 then format(
            'Hoy: %s %s; promedio de los últimos 4 mismos días: %s %s. Vas %s%% por debajo.',
            tenant_currency,
            to_char(today_sales, 'FM999999999999990D00'),
            tenant_currency,
            to_char(weekday_average, 'FM999999999999990D00'),
            to_char(round(((weekday_average - today_sales) / weekday_average) * 100, 1), 'FM999990D0')
          )
          when today_sales > weekday_average then format(
            'Hoy: %s %s; promedio de los últimos 4 mismos días: %s %s. Vas por encima del promedio.',
            tenant_currency,
            to_char(today_sales, 'FM999999999999990D00'),
            tenant_currency,
            to_char(weekday_average, 'FM999999999999990D00')
          )
          else format(
            'Hoy: %s %s; promedio de los últimos 4 mismos días: %s %s.',
            tenant_currency,
            to_char(today_sales, 'FM999999999999990D00'),
            tenant_currency,
            to_char(weekday_average, 'FM999999999999990D00')
          )
        end as message,
        jsonb_build_object(
          'date', tenant_today,
          'todaySales', today_sales,
          'sameWeekdayFourWeekAverage', weekday_average,
          'differencePercent', case
            when weekday_average > 0 then round(((today_sales - weekday_average) / weekday_average) * 100, 1)
            else null
          end,
          'currency', tenant_currency
        ) as metadata
      where today_sales > 0 or weekday_average > 0
    ), no_movement_alerts as (
      select
        'no_movement:' || p.id::text as alert_key,
        'no_movement'::text as alert_type,
        'info'::text as severity,
        'Sin movimiento: ' || p.name as title,
        format(
          'No registra movimientos en los últimos 30 días y quedan %s %s en inventario.',
          to_char(stock.total_quantity, 'FM999999999990D9999'),
          p.unit
        ) as message,
        jsonb_build_object(
          'productId', p.id,
          'productName', p.name,
          'sku', p.sku,
          'stock', stock.total_quantity,
          'lastMovementBefore', movement_cutoff
        ) as metadata
      from public.products p
      cross join lateral (
        select coalesce(sum(s.quantity), 0)::numeric as total_quantity
        from public.inventory_stocks s
        join public.warehouses w
          on w.id = s.warehouse_id
         and w.tenant_id = s.tenant_id
         and w.active = true
        where s.tenant_id = tenant_row.id
          and s.product_id = p.id
      ) as stock
      where p.tenant_id = tenant_row.id
        and p.active = true
        and p.item_type <> 'service'
        and p.created_at < movement_cutoff
        and stock.total_quantity > 0
        and not exists (
          select 1
          from public.inventory_movements m
          where m.tenant_id = tenant_row.id
            and m.product_id = p.id
            and m.created_at >= movement_cutoff
        )
    ), candidates as materialized (
      select * from stock_alerts
      union all select * from overdue_alerts
      union all select * from sales_alerts
      union all select * from no_movement_alerts
    ), resolved as (
      update public.daily_smart_alerts existing
         set is_active = false,
             resolved_at = generated_at,
             updated_at = generated_at
       where existing.tenant_id = tenant_row.id
         and existing.is_active = true
         and not exists (
           select 1 from candidates c where c.alert_key = existing.alert_key
         )
      returning existing.id
    ), upserted as (
      insert into public.daily_smart_alerts (
        tenant_id, alert_key, alert_type, severity, title, message, metadata,
        is_active, is_read, first_detected_at, last_detected_at, resolved_at, updated_at
      )
      select
        tenant_row.id, c.alert_key, c.alert_type, c.severity, c.title, c.message, c.metadata,
        true, false, generated_at, generated_at, null, generated_at
      from candidates c
      on conflict (tenant_id, alert_key) do update
        set alert_type = excluded.alert_type,
            severity = excluded.severity,
            title = excluded.title,
            message = excluded.message,
            metadata = excluded.metadata,
            is_active = true,
            is_read = case
              when not daily_smart_alerts.is_active or daily_smart_alerts.message is distinct from excluded.message then false
              else daily_smart_alerts.is_read
            end,
            read_at = case
              when not daily_smart_alerts.is_active or daily_smart_alerts.message is distinct from excluded.message then null
              else daily_smart_alerts.read_at
            end,
            read_by = case
              when not daily_smart_alerts.is_active or daily_smart_alerts.message is distinct from excluded.message then null
              else daily_smart_alerts.read_by
            end,
            last_detected_at = generated_at,
            resolved_at = null,
            updated_at = generated_at
      returning id
    )
    select count(*) into changed_count from upserted;

    tenant_count := tenant_count + 1;
    select count(*)::integer into changed_count
    from public.daily_smart_alerts a
    where a.tenant_id = tenant_row.id and a.is_active = true;
    active_alert_count := active_alert_count + changed_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'tenantsProcessed', tenant_count,
    'activeAlerts', active_alert_count,
    'generatedAt', clock_timestamp()
  );
end;
$$;

revoke all on function public.generate_daily_smart_alerts() from public, anon, authenticated;
grant execute on function public.generate_daily_smart_alerts() to service_role;

comment on table public.daily_smart_alerts is 'Daily tenant-scoped business alerts generated from Supabase data without AI.';
comment on function public.generate_daily_smart_alerts() is 'Refreshes low stock, overdue receivables, same-weekday sales comparisons, and stale inventory alerts for active tenants.';

commit;

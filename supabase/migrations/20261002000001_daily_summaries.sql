-- Módulo: Resumen Diario Automático de operaciones.
-- Calcula, por empresa y por fecha local: ventas, devoluciones, ganancia aproximada,
-- tickets, producto más vendido, alertas operativas y comparaciones (día anterior, promedio 7 días
-- y mismo día de la semana). El envío por WhatsApp y el texto del mensaje viven en la capa Next.js
-- (lib/daily-summary.ts + app/api/cron/daily-summary) porque no son responsabilidad de PostgreSQL.

begin;

create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  summary_date date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  timezone text not null default 'America/Managua',
  currency text not null default 'NIO',
  -- true cuando el resumen se generó antes de terminar el día local (p. ej. cierre a las 8:00 pm).
  partial boolean not null default false,
  sales_total numeric(14,2) not null default 0,
  returns_total numeric(14,2) not null default 0,
  net_sales numeric(14,2) not null default 0,
  sales_count integer not null default 0,
  average_ticket numeric(14,2) not null default 0,
  cogs_total numeric(14,2) not null default 0,
  gross_profit numeric(14,2) not null default 0,
  margin_percent numeric(7,2) not null default 0,
  expenses_total numeric(14,2) not null default 0,
  estimated_net_profit numeric(14,2) not null default 0,
  top_product jsonb,
  top_products jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  message text not null default '',
  whatsapp_status text not null default 'pending' check (whatsapp_status in ('pending', 'sent', 'skipped', 'failed', 'disabled')),
  whatsapp_provider text,
  whatsapp_phone text,
  whatsapp_error text,
  whatsapp_message_id text,
  whatsapp_attempts integer not null default 0,
  whatsapp_sent_at timestamptz,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, summary_date),
  unique (id, tenant_id)
);

create index if not exists daily_summaries_tenant_date_idx
  on public.daily_summaries (tenant_id, summary_date desc);

create index if not exists daily_summaries_pending_delivery_idx
  on public.daily_summaries (whatsapp_status, summary_date)
  where whatsapp_status = 'pending';

alter table public.daily_summaries enable row level security;
revoke all on table public.daily_summaries from public, anon, authenticated;
grant select, insert, update on table public.daily_summaries to service_role;

-- Genera (o refresca) el resumen del día para una empresa o para todas las activas.
-- Es idempotente: la clave única (tenant_id, summary_date) hace que cada corrida
-- recalcule métricas sin duplicar filas ni perder el estado de entrega de WhatsApp.
create or replace function public.generate_daily_summaries(
  target_tenant_id uuid default null,
  target_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tenant_row record;
  generated_at timestamptz;
  tenant_timezone text;
  tenant_currency text;
  local_now timestamp without time zone;
  local_today date;
  target_summary_date date;
  period_start timestamptz;
  period_end timestamptz;
  window_seconds numeric;
  is_partial boolean;
  sales_total numeric(14,2);
  returns_total numeric(14,2);
  net_sales numeric(14,2);
  sales_count integer;
  cogs_gross numeric(14,2);
  cogs_returned numeric(14,2);
  cogs_total numeric(14,2);
  expenses_total numeric(14,2);
  gross_profit numeric(14,2);
  estimated_net_profit numeric(14,2);
  margin_percent numeric(7,2);
  average_ticket numeric(14,2);
  top_products jsonb;
  top_ranked jsonb;
  alerts jsonb;
  alert_item jsonb;
  comparison jsonb;
  previous_day_total numeric(14,2);
  previous_day_date date;
  average_last_7 numeric(14,2);
  average_same_weekday numeric(14,2);
  content jsonb;
  summary_id uuid;
  is_new boolean;
  summaries jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;

  generated_at := clock_timestamp();

  for tenant_row in
    select t.id, t.timezone, t.currency
      from public.tenants t
     where t.status = 'active'
       and (target_tenant_id is null or t.id = target_tenant_id)
     order by t.id
  loop
    tenant_timezone := tenant_row.timezone;
    if tenant_timezone is null or tenant_timezone = ''
       or not exists (select 1 from pg_timezone_names z where z.name = tenant_timezone) then
      tenant_timezone := 'America/Managua';
    end if;
    tenant_currency := coalesce(nullif(tenant_row.currency, ''), 'NIO');

    local_now := generated_at at time zone tenant_timezone;
    local_today := local_now::date;
    target_summary_date := coalesce(target_date, local_today);
    period_start := target_summary_date::timestamp without time zone at time zone tenant_timezone;
    period_end := (target_summary_date + 1)::timestamp without time zone at time zone tenant_timezone;
    is_partial := period_end > generated_at;
    if is_partial then
      period_end := generated_at;
    end if;
    window_seconds := greatest(extract(epoch from (period_end - period_start)), 0);

    -- Ventas del día local (se excluyen anuladas y borradores).
    select coalesce(sum(s.total), 0)::numeric(14,2), count(*)::integer
      into sales_total, sales_count
      from public.sales s
     where s.tenant_id = tenant_row.id
       and s.status in ('completed', 'returned')
       and s.created_at >= period_start
       and s.created_at < period_end;

    select coalesce(sum(r.amount), 0)::numeric(14,2)
      into returns_total
      from public.sale_returns r
     where r.tenant_id = tenant_row.id
       and r.status = 'completed'
       and r.created_at >= period_start
       and r.created_at < period_end;

    net_sales := greatest(sales_total - returns_total, 0)::numeric(14,2);

    -- Costo aproximado de lo vendido: se usa el costo del kardex al momento de la venta
    -- (inventory_movements.unit_cost) y, si no existe, el costo actual del producto.
    select coalesce(sum(si.quantity * coalesce(m.unit_cost, p.cost, 0)), 0)::numeric(14,2)
      into cogs_gross
      from public.sale_items si
      join public.sales s
        on s.id = si.sale_id
       and s.tenant_id = si.tenant_id
      left join public.products p
        on p.id = si.product_id
       and p.tenant_id = si.tenant_id
      left join lateral (
        select m.unit_cost
          from public.inventory_movements m
         where m.tenant_id = si.tenant_id
           and m.product_id = si.product_id
           and m.reference_type = 'sale'
           and m.reference_id = si.sale_id
         order by m.created_at asc
         limit 1
      ) m on true
     where s.tenant_id = tenant_row.id
       and s.status in ('completed', 'returned')
       and s.created_at >= period_start
       and s.created_at < period_end;

    select coalesce(sum(sri.quantity * coalesce(p.cost, 0)), 0)::numeric(14,2)
      into cogs_returned
      from public.sale_return_items sri
      join public.sale_returns r
        on r.id = sri.return_id
       and r.tenant_id = sri.tenant_id
      left join public.products p
        on p.id = sri.product_id
       and p.tenant_id = sri.tenant_id
     where sri.tenant_id = tenant_row.id
       and r.status = 'completed'
       and r.created_at >= period_start
       and r.created_at < period_end;

    cogs_total := greatest(cogs_gross - cogs_returned, 0)::numeric(14,2);

    select coalesce(sum(e.amount), 0)::numeric(14,2)
      into expenses_total
      from public.expenses e
     where e.tenant_id = tenant_row.id
       and e.created_at >= period_start
       and e.created_at < period_end;

    gross_profit := (net_sales - cogs_total)::numeric(14,2);
    estimated_net_profit := (gross_profit - expenses_total)::numeric(14,2);
    margin_percent := case when net_sales > 0 then round((gross_profit / net_sales) * 100, 2) else 0 end;
    average_ticket := case when sales_count > 0 then round(sales_total / sales_count, 2) else 0 end;

    -- Producto más vendido (neto de devoluciones del período).
    with sold as (
      select si.product_id,
             max(coalesce(p.name, 'Producto')) as name,
             max(coalesce(p.sku, '')) as sku,
             sum(si.quantity) as quantity,
             sum(si.line_total) as revenue
        from public.sale_items si
        join public.sales s
          on s.id = si.sale_id
         and s.tenant_id = si.tenant_id
        left join public.products p
          on p.id = si.product_id
         and p.tenant_id = si.tenant_id
       where si.tenant_id = tenant_row.id
         and s.status in ('completed', 'returned')
         and s.created_at >= period_start
         and s.created_at < period_end
       group by si.product_id
    ), returned_items as (
      select sri.product_id,
             sum(sri.quantity) as quantity,
             sum(sri.amount) as amount
        from public.sale_return_items sri
        join public.sale_returns r
          on r.id = sri.return_id
         and r.tenant_id = sri.tenant_id
       where sri.tenant_id = tenant_row.id
         and r.status = 'completed'
         and r.created_at >= period_start
         and r.created_at < period_end
       group by sri.product_id
    ), ranked as (
      select sold.product_id,
             sold.name,
             sold.sku,
             (sold.quantity - coalesce(returned_items.quantity, 0)) as quantity,
             (sold.revenue - coalesce(returned_items.amount, 0)) as revenue
        from sold
        left join returned_items on returned_items.product_id = sold.product_id
    )
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'productId', top_rows.product_id,
               'name', top_rows.name,
               'sku', top_rows.sku,
               'quantity', top_rows.quantity,
               'revenue', top_rows.revenue
             ) order by top_rows.quantity desc, top_rows.revenue desc
           ), '[]'::jsonb)
      into top_products
      from (select * from ranked where quantity > 0 order by quantity desc, revenue desc limit 5) top_rows;

    top_ranked := case when jsonb_array_length(top_products) > 0 then top_products->0 else null end;

    -- Alertas operativas del día (stock, cartera vencida, por vencer y cuentas por pagar).
    alerts := '[]'::jsonb;

    if exists (select 1 from public.warehouses w where w.tenant_id = tenant_row.id and w.active = true) then
      select jsonb_build_object(
               'type', 'out_of_stock',
               'severity', 'critical',
               'title', 'Productos agotados',
               'count', count(*)::integer,
               'items', coalesce(jsonb_agg(out_rows.name order by out_rows.name), '[]'::jsonb),
               'message', format('%s producto(s) sin existencias.', count(*))
             )
        into alert_item
        from (
          select p.name
            from public.products p
           where p.tenant_id = tenant_row.id
             and p.active = true
             and p.item_type <> 'service'
             and (
               select coalesce(sum(st.quantity), 0)
                 from public.inventory_stocks st
                 join public.warehouses w
                   on w.id = st.warehouse_id
                  and w.tenant_id = st.tenant_id
                  and w.active = true
                where st.tenant_id = p.tenant_id
                  and st.product_id = p.id
             ) <= 0
           order by p.name
           limit 10
        ) out_rows;
      if coalesce((alert_item->>'count')::integer, 0) > 0 then
        alerts := alerts || jsonb_build_array(alert_item);
      end if;

      select jsonb_build_object(
               'type', 'low_stock',
               'severity', 'warning',
               'title', 'Stock bajo',
               'count', count(*)::integer,
               'items', coalesce(jsonb_agg(low_rows.name order by low_rows.name), '[]'::jsonb),
               'message', format('%s producto(s) por debajo del mínimo configurado.', count(*))
             )
        into alert_item
        from (
          select p.name
            from public.products p
           where p.tenant_id = tenant_row.id
             and p.active = true
             and p.item_type <> 'service'
             and p.min_stock > 0
             and (
               select coalesce(sum(st.quantity), 0)
                 from public.inventory_stocks st
                 join public.warehouses w
                   on w.id = st.warehouse_id
                  and w.tenant_id = st.tenant_id
                  and w.active = true
                where st.tenant_id = p.tenant_id
                  and st.product_id = p.id
             ) between 0.0001 and p.min_stock - 0.0001
           order by p.name
           limit 10
        ) low_rows;
      if coalesce((alert_item->>'count')::integer, 0) > 0 then
        alerts := alerts || jsonb_build_array(alert_item);
      end if;
    end if;

    select jsonb_build_object(
             'type', 'overdue_receivables',
             'severity', 'warning',
             'title', 'Créditos vencidos',
             'count', count(*)::integer,
             'amount', coalesce(sum(r.outstanding_amount), 0)::numeric(14,2),
             'currency', tenant_currency,
             'message', format(
               '%s crédito(s) vencido(s) por %s %s.',
               count(*),
               tenant_currency,
               to_char(coalesce(sum(r.outstanding_amount), 0), 'FM999999999999990D00')
             )
           )
      into alert_item
      from public.receivables r
     where r.tenant_id = tenant_row.id
       and r.status in ('open', 'partial')
       and r.outstanding_amount > 0
       and r.due_date is not null
       and r.due_date < target_summary_date;
    if coalesce((alert_item->>'count')::integer, 0) > 0 then
      alerts := alerts || jsonb_build_array(alert_item);
    end if;

    select jsonb_build_object(
             'type', 'receivables_due_soon',
             'severity', 'info',
             'title', 'Créditos por vencer',
             'count', count(*)::integer,
             'amount', coalesce(sum(r.outstanding_amount), 0)::numeric(14,2),
             'currency', tenant_currency,
             'message', format(
               '%s crédito(s) vencen en los próximos 3 días por %s %s.',
               count(*),
               tenant_currency,
               to_char(coalesce(sum(r.outstanding_amount), 0), 'FM999999999999990D00')
             )
           )
      into alert_item
      from public.receivables r
     where r.tenant_id = tenant_row.id
       and r.status in ('open', 'partial')
       and r.outstanding_amount > 0
       and r.due_date is not null
       and r.due_date >= target_summary_date
       and r.due_date <= target_summary_date + 3;
    if coalesce((alert_item->>'count')::integer, 0) > 0 then
      alerts := alerts || jsonb_build_array(alert_item);
    end if;

    select jsonb_build_object(
             'type', 'payables_due_soon',
             'severity', 'warning',
             'title', 'Cuentas por pagar',
             'count', count(*)::integer,
             'amount', coalesce(sum(p.outstanding_amount), 0)::numeric(14,2),
             'currency', tenant_currency,
             'message', format(
               '%s cuenta(s) por pagar vencen en los próximos 7 días por %s %s.',
               count(*),
               tenant_currency,
               to_char(coalesce(sum(p.outstanding_amount), 0), 'FM999999999999990D00')
             )
           )
      into alert_item
      from public.payables p
     where p.tenant_id = tenant_row.id
       and p.status in ('open', 'partial')
       and p.outstanding_amount > 0
       and p.due_date is not null
       and p.due_date <= target_summary_date + 7;
    if coalesce((alert_item->>'count')::integer, 0) > 0 then
      alerts := alerts || jsonb_build_array(alert_item);
    end if;

    -- Comparaciones: siempre contra la misma ventana horaria del período actual, de modo que
    -- un cierre parcial a las 8:00 pm se compare con ayer a esa misma hora y no con el día completo.
    previous_day_date := target_summary_date - 1;
    select coalesce(sum(s.total), 0)::numeric(14,2)
      into previous_day_total
      from public.sales s
     where s.tenant_id = tenant_row.id
       and s.status in ('completed', 'returned')
       and s.created_at >= period_start - interval '1 day'
       and s.created_at < period_end - interval '1 day';

    -- Promedio de los últimos 7 días usando la misma ventana horaria.
    select coalesce(round(avg(daily.day_total), 2), 0)::numeric(14,2)
      into average_last_7
      from generate_series(1, 7) as offsets(days_back)
      cross join lateral (
        select coalesce(sum(s.total), 0)::numeric as day_total
          from public.sales s
         where s.tenant_id = tenant_row.id
           and s.status in ('completed', 'returned')
           and s.created_at >= period_start - (offsets.days_back || ' days')::interval
           and s.created_at < period_start - (offsets.days_back || ' days')::interval + (window_seconds || ' seconds')::interval
      ) daily;

    -- Promedio del mismo día de la semana en las últimas 4 semanas.
    select coalesce(round(avg(daily.day_total), 2), 0)::numeric(14,2)
      into average_same_weekday
      from (values (7), (14), (21), (28)) as offsets(days_back)
      cross join lateral (
        select coalesce(sum(s.total), 0)::numeric as day_total
          from public.sales s
         where s.tenant_id = tenant_row.id
           and s.status in ('completed', 'returned')
           and s.created_at >= period_start - (offsets.days_back || ' days')::interval
           and s.created_at < period_start - (offsets.days_back || ' days')::interval + (window_seconds || ' seconds')::interval
      ) daily;

    comparison := jsonb_build_object(
      'previousDay', jsonb_build_object(
        'date', previous_day_date,
        'total', previous_day_total,
        'differencePercent', case when previous_day_total > 0 then round(((net_sales - previous_day_total) / previous_day_total) * 100, 2) else null end
      ),
      'sevenDayAverage', jsonb_build_object(
        'days', 7,
        'total', average_last_7,
        'differencePercent', case when average_last_7 > 0 then round(((net_sales - average_last_7) / average_last_7) * 100, 2) else null end
      ),
      'sameWeekdayAverage', jsonb_build_object(
        'weeks', 4,
        'total', average_same_weekday,
        'differencePercent', case when average_same_weekday > 0 then round(((net_sales - average_same_weekday) / average_same_weekday) * 100, 2) else null end
      ),
      'windowSeconds', window_seconds
    );

    content := jsonb_build_object(
      'tenantId', tenant_row.id,
      'summaryDate', target_summary_date,
      'timezone', tenant_timezone,
      'currency', tenant_currency,
      'partial', is_partial,
      'periodStart', period_start,
      'periodEnd', period_end,
      'generatedAt', generated_at,
      'sales', jsonb_build_object(
        'total', sales_total,
        'returns', returns_total,
        'net', net_sales,
        'count', sales_count,
        'averageTicket', average_ticket
      ),
      'profit', jsonb_build_object(
        'cogs', cogs_total,
        'gross', gross_profit,
        'expenses', expenses_total,
        'estimatedNet', estimated_net_profit,
        'marginPercent', margin_percent
      ),
      'topProducts', top_products,
      'alerts', alerts,
      'comparison', comparison
    );

    select not exists (
             select 1
               from public.daily_summaries existing
              where existing.tenant_id = tenant_row.id
                and existing.summary_date = target_summary_date
           )
      into is_new;

    insert into public.daily_summaries (
      tenant_id, summary_date, period_start, period_end, timezone, currency, partial,
      sales_total, returns_total, net_sales, sales_count, average_ticket,
      cogs_total, gross_profit, margin_percent, expenses_total, estimated_net_profit,
      top_product, top_products, alerts, comparison, content, generated_at, updated_at
    ) values (
      tenant_row.id, target_summary_date, period_start, period_end, tenant_timezone, tenant_currency, is_partial,
      sales_total, returns_total, net_sales, sales_count, average_ticket,
      cogs_total, gross_profit, margin_percent, expenses_total, estimated_net_profit,
      top_ranked, top_products, alerts, comparison, content, generated_at, generated_at
    )
    on conflict (tenant_id, summary_date) do update
      set period_start = excluded.period_start,
          period_end = excluded.period_end,
          timezone = excluded.timezone,
          currency = excluded.currency,
          partial = excluded.partial,
          sales_total = excluded.sales_total,
          returns_total = excluded.returns_total,
          net_sales = excluded.net_sales,
          sales_count = excluded.sales_count,
          average_ticket = excluded.average_ticket,
          cogs_total = excluded.cogs_total,
          gross_profit = excluded.gross_profit,
          margin_percent = excluded.margin_percent,
          expenses_total = excluded.expenses_total,
          estimated_net_profit = excluded.estimated_net_profit,
          top_product = excluded.top_product,
          top_products = excluded.top_products,
          alerts = excluded.alerts,
          comparison = excluded.comparison,
          content = excluded.content,
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at
    returning id
    into summary_id;

    summaries := summaries || jsonb_build_array(jsonb_build_object(
      'summaryId', summary_id,
      'tenantId', tenant_row.id,
      'summaryDate', target_summary_date,
      'partial', is_partial,
      'isNew', is_new,
      'content', content
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'generatedAt', generated_at,
    'summaries', summaries
  );
end;
$$;

revoke all on function public.generate_daily_summaries(uuid, date) from public, anon, authenticated;
grant execute on function public.generate_daily_summaries(uuid, date) to service_role;

comment on table public.daily_summaries is 'Resumen diario por empresa (ventas, ganancia aproximada, tickets, producto top, alertas y comparaciones) con estado de entrega por WhatsApp.';
comment on function public.generate_daily_summaries(uuid, date) is 'Genera o refresca el resumen diario de una empresa (o de todas) para una fecha local, a partir de ventas, devoluciones, kardex, gastos, cartera e inventario reales.';

commit;

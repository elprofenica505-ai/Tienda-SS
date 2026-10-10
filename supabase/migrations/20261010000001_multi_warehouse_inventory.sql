-- ============================================================================
-- FASE 1A — INVENTARIO MULTI-ALMACÉN: CAPA CANÓNICA EN SQL
-- ============================================================================
--
-- QUÉ HACE
--   1. Convierte `public.inventory_stocks` en la fuente canónica del stock por
--      almacén, añadiendo `in_transit_quantity` (unidades despachadas que aún no
--      se reciben en el almacén destino).
--   2. Crea el ciclo de vida de transferencias entre almacenes:
--      draft -> approved -> in_transit -> received  (+ cancelled), con recepción
--      parcial a nivel de línea.
--   3. Respalda (backfill) el stock legacy hacia `inventory_stocks` para todo
--      producto físico que todavía no tenga fila de stock.
--   4. Endurece `public.adjust_inventory` para que un conteo físico no pueda
--      dejar el stock por debajo de lo ya reservado.
--
-- QUÉ **NO** HACE (y por qué es seguro)
--   * NO crea `inventory_stocks`: la tabla ya existe desde
--     0002_erp_foundation.sql:68 y ya tiene `reserved_quantity`, `reorder_point`
--     y (desde 20260918000005) `average_cost`. Aquí sólo se le añade una columna
--     nueva con `if not exists` y valor por defecto 0.
--   * NO toca ninguna columna existente, NO cambia tipos, NO borra datos.
--   * NO reescribe `apply_inventory_movement`, `reserve_inventory`,
--     `receive_purchase_partial` ni ninguna otra RPC existente: las nuevas RPC de
--     transferencia reutilizan `apply_inventory_movement` para escribir el kárdex.
--   * NO modifica ninguna ruta de la aplicación. Las rutas se conectan a este
--     modelo en la Fase 1B; hasta entonces el backend sigue comportándose igual.
--   * Todo el bloque va dentro de `begin; ... commit;`: si algo falla en el SQL
--     Editor de Supabase, se revierte completo y no queda nada a medias.
--
-- SEMÁNTICA DE CANTIDADES (importante, queda fijada aquí)
--   quantity            = existencia física en el almacén
--   reserved_quantity   = unidades apartadas dentro de esa existencia (nunca > quantity)
--   in_transit_quantity = unidades despachadas hacia este almacén, aún sin recibir
--   disponible          = quantity - reserved_quantity
--   Es la misma semántica que ya usan `apply_inventory_movement`
--   (rechaza `reserved_quantity > after_qty`) y `app/api/inventory/route.ts`
--   (`available = quantity - reserved`). Las RPC de esta migración respetan esa
--   convención y no la duplican.
--
-- CONCURRENCIA
--   * Todo cambio de stock toma la fila de `inventory_stocks` con `for update`
--     (igual que `apply_inventory_movement` y `reserve_inventory`).
--   * Toda RPC de transferencia toma primero la fila de `stock_transfers` con
--     `for update` y luego recorre las líneas `order by product_id`, de modo que
--     dos transferencias simultáneas entre los mismos almacenes toman los
--     bloqueos en el mismo orden y no producen deadlock.
--   * La numeración de transferencias usa `pg_advisory_xact_lock` por tenant para
--     que dos creaciones simultáneas no choquen con `unique (tenant_id, transfer_number)`.
--
-- RLS
--   Las tablas nuevas nacen con RLS habilitado y sin privilegios para
--   anon/authenticated (mismo patrón que 20261007000001_quotes_crm_phase1.sql).
--   El backend entra con service_role (lib/supabase/server.ts), que tiene BYPASSRLS.
--
-- POR QUÉ LA GUARDA USA `session_user` Y NO `current_user`
--   Dentro de una función `security definer`, `current_user` pasa a ser el DUEÑO
--   de la función (en Supabase, `postgres`), no el rol que la invocó. Una guarda
--   escrita como `current_user <> 'service_role'` por lo tanto se cumple SIEMPRE y
--   bloquea incluso al backend. `session_user` no se ve afectada por
--   `security definer`, así que identifica de verdad al rol de la conexión.
--   Verificado ejecutando la migración completa sobre un PostgreSQL real: con
--   `current_user` el backend recibía FORBIDDEN; con `session_user` funciona y un
--   rol ajeno al tenant sigue recibiendo FORBIDDEN.
--
-- NOTA SOBRE `reserve_inventory` (0011_inventory_reservations.sql)
--   Esa función ya existente usa el patrón `current_user <> 'service_role'`. Por lo
--   explicado arriba, rechaza también al backend: ejecutada sobre un PostgreSQL real
--   con las 70 migraciones aplicadas, `select public.reserve_inventory(...)` devuelve
--   FORBIDDEN tanto con sesión `postgres` como con sesión `service_role` (el dueño de
--   la función es `postgres`, igual que cuando la migración se aplica desde el SQL
--   Editor de Supabase). No se modifica aquí por estar fuera del alcance de la
--   Fase 1A; queda reportado para tratarse en su propia corrección.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Inventario canónico por almacén: unidades en tránsito.
-- ---------------------------------------------------------------------------

alter table public.inventory_stocks
  add column if not exists in_transit_quantity numeric(14,4) not null default 0 check (in_transit_quantity >= 0);

comment on column public.inventory_stocks.in_transit_quantity is
  'Unidades despachadas hacia este almacén por una transferencia aún no recibida.';

-- ---------------------------------------------------------------------------
-- 2) Transferencias entre almacenes.
-- ---------------------------------------------------------------------------

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  transfer_number text not null,
  origin_branch_id uuid not null,
  origin_warehouse_id uuid not null,
  destination_branch_id uuid not null,
  destination_warehouse_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft','approved','in_transit','received','cancelled')),
  reason text not null default 'Transferencia entre almacenes',
  expected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  dispatched_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, transfer_number),
  constraint stock_transfers_distinct_warehouses check (origin_warehouse_id <> destination_warehouse_id),
  foreign key (origin_branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (origin_warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict,
  foreign key (destination_branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  foreign key (destination_warehouse_id, tenant_id) references public.warehouses(id, tenant_id) on delete restrict
);

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  transfer_id uuid not null,
  product_id uuid not null,
  requested_quantity numeric(14,4) not null check (requested_quantity > 0),
  shipped_quantity numeric(14,4) not null default 0 check (shipped_quantity >= 0),
  received_quantity numeric(14,4) not null default 0 check (received_quantity >= 0),
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (transfer_id, product_id),
  constraint stock_transfer_items_shipped_within_requested check (shipped_quantity <= requested_quantity),
  constraint stock_transfer_items_received_within_shipped check (received_quantity <= shipped_quantity),
  foreign key (transfer_id, tenant_id) references public.stock_transfers(id, tenant_id) on delete cascade,
  foreign key (product_id, tenant_id) references public.products(id, tenant_id) on delete restrict
);

create index if not exists stock_transfers_tenant_status_idx
  on public.stock_transfers (tenant_id, status, created_at desc);
create index if not exists stock_transfers_origin_idx
  on public.stock_transfers (tenant_id, origin_warehouse_id, created_at desc);
create index if not exists stock_transfers_destination_idx
  on public.stock_transfers (tenant_id, destination_warehouse_id, created_at desc);
create index if not exists stock_transfers_open_idx
  on public.stock_transfers (tenant_id, updated_at desc)
  where status in ('draft','approved','in_transit');
create index if not exists stock_transfer_items_transfer_idx
  on public.stock_transfer_items (tenant_id, transfer_id);
create index if not exists stock_transfer_items_product_idx
  on public.stock_transfer_items (tenant_id, product_id);

comment on table public.stock_transfers is
  'Transferencias entre almacenes: draft -> approved -> in_transit -> received.';
comment on table public.stock_transfer_items is
  'Líneas de una transferencia con cantidad solicitada, despachada y recibida.';

-- ---------------------------------------------------------------------------
-- 3) RLS: las tablas nuevas nacen protegidas (patrón de quotes_crm_phase1).
-- ---------------------------------------------------------------------------

alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;

revoke all on table public.stock_transfers, public.stock_transfer_items from anon, authenticated;
grant select, insert, update on table public.stock_transfers, public.stock_transfer_items to service_role;

drop policy if exists stock_transfers_tenant_select on public.stock_transfers;
create policy stock_transfers_tenant_select on public.stock_transfers
  for select to authenticated using (public.has_tenant_access(tenant_id));
drop policy if exists stock_transfer_items_tenant_select on public.stock_transfer_items;
create policy stock_transfer_items_tenant_select on public.stock_transfer_items
  for select to authenticated using (public.has_tenant_access(tenant_id));

-- ---------------------------------------------------------------------------
-- 4) Backfill del stock legacy hacia inventory_stocks.
--    Fuente real del legacy: products.metadata->>'initialStock'
--    (app/api/catalog/route.ts guarda ahí el "stock inicial" y
--     app/api/catalog/export/route.ts lo lee de ahí).
--    Si en la base existiera además una columna física products.stock, también se
--    usa: gana el mayor de los dos valores. Es idempotente: sólo toca productos
--    físicos que aún NO tienen ninguna fila en inventory_stocks.
-- ---------------------------------------------------------------------------

do $backfill$
declare
  has_legacy_stock_column boolean;
  candidate record;
  backfilled integer := 0;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'stock'
  ) into has_legacy_stock_column;

  create temporary table if not exists erp_legacy_stock_backfill (
    tenant_id uuid not null,
    product_id uuid not null,
    warehouse_id uuid not null,
    quantity numeric not null,
    reorder_point numeric not null
  ) on commit drop;

  truncate table erp_legacy_stock_backfill;

  -- Origen del legacy según lo que exista realmente en la base destino.
  if has_legacy_stock_column then
    execute $dyn$
      insert into erp_legacy_stock_backfill (tenant_id, product_id, warehouse_id, quantity, reorder_point)
      select p.tenant_id,
             p.id,
             w.id,
             greatest(coalesce(p.stock, 0), coalesce((p.metadata->>'initialStock')::numeric, 0), 0),
             greatest(coalesce(p.min_stock, 0), 0)
        from public.products p
        join lateral (
          select wh.id
            from public.warehouses wh
           where wh.tenant_id = p.tenant_id and wh.active
           order by wh.created_at, wh.code, wh.id
           limit 1
        ) w on true
       where coalesce(p.item_type, 'physical') <> 'service'
         and not exists (
           select 1 from public.inventory_stocks s
            where s.tenant_id = p.tenant_id and s.product_id = p.id
         )
    $dyn$;
  else
    insert into erp_legacy_stock_backfill (tenant_id, product_id, warehouse_id, quantity, reorder_point)
    select p.tenant_id,
           p.id,
           w.id,
           greatest(coalesce((p.metadata->>'initialStock')::numeric, 0), 0),
           greatest(coalesce(p.min_stock, 0), 0)
      from public.products p
      join lateral (
        select wh.id
          from public.warehouses wh
         where wh.tenant_id = p.tenant_id and wh.active
         order by wh.created_at, wh.code, wh.id
         limit 1
      ) w on true
     where coalesce(p.item_type, 'physical') <> 'service'
       and not exists (
         select 1 from public.inventory_stocks s
          where s.tenant_id = p.tenant_id and s.product_id = p.id
       );
  end if;

  -- El kárdex se escribe ANTES de crear la fila de stock: el trigger
  -- inventory_movement_kardex_guard lee el saldo actual, así ve 0 -> quantity.
  for candidate in
    select b.tenant_id, b.product_id, b.warehouse_id, b.quantity, b.reorder_point
      from erp_legacy_stock_backfill b
     where b.quantity > 0
     order by b.tenant_id, b.product_id
  loop
    insert into public.inventory_movements (
      tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, performed_by, metadata,
      previous_quantity, new_quantity, previous_average_cost, new_average_cost
    )
    values (
      candidate.tenant_id, candidate.product_id, candidate.warehouse_id, 'opening', candidate.quantity, 0,
      'legacy_stock_backfill', null, null,
      jsonb_build_object('source', 'fase1a_backfill', 'previous_quantity', 0, 'new_quantity', candidate.quantity),
      0, candidate.quantity, 0, 0
    );

    insert into public.inventory_stocks (
      tenant_id, product_id, warehouse_id, quantity, reserved_quantity, reorder_point, in_transit_quantity, updated_at
    )
    values (
      candidate.tenant_id, candidate.product_id, candidate.warehouse_id,
      candidate.quantity, 0, candidate.reorder_point, 0, now()
    )
    on conflict (tenant_id, product_id, warehouse_id) do nothing;

    backfilled := backfilled + 1;
  end loop;

  raise notice 'FASE1A_BACKFILL: % producto(s) con stock legacy respaldado en inventory_stocks', backfilled;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 5) Ajuste de stock endurecido: un conteo físico no puede quedar por debajo de
--    lo reservado. Misma firma y mismos códigos de error que antes; sólo añade
--    la validación de `reserved_quantity`.
-- ---------------------------------------------------------------------------

create or replace function public.adjust_inventory(
  target_tenant_id uuid,
  target_product_id uuid,
  target_warehouse_id uuid,
  target_movement_type text,
  target_quantity numeric,
  target_reason text,
  target_user_id uuid
) returns table(previous_quantity numeric, new_quantity numeric, delta numeric, movement_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_quantity numeric;
  current_reserved numeric;
  current_cost numeric;
  resulting_quantity numeric;
  calculated_delta numeric;
  new_movement_id uuid;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;
  if target_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if target_movement_type not in ('receive', 'remove', 'set') then raise exception 'INVALID_MOVEMENT_TYPE'; end if;
  if target_warehouse_id is null then raise exception 'WAREHOUSE_REQUIRED'; end if;
  if not exists (select 1 from public.products where id = target_product_id and tenant_id = target_tenant_id and active) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.warehouses where id = target_warehouse_id and tenant_id = target_tenant_id and active) then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;

  select quantity, reserved_quantity, average_cost
    into current_quantity, current_reserved, current_cost
    from public.inventory_stocks
   where tenant_id = target_tenant_id and product_id = target_product_id and warehouse_id = target_warehouse_id
   for update;
  current_quantity := coalesce(current_quantity, 0);
  current_reserved := coalesce(current_reserved, 0);
  current_cost := coalesce(current_cost, 0);

  resulting_quantity := case
    when target_movement_type = 'receive' then current_quantity + target_quantity
    when target_movement_type = 'remove' then current_quantity - target_quantity
    else target_quantity
  end;

  if resulting_quantity < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  if resulting_quantity < current_reserved then raise exception 'INSUFFICIENT_STOCK:RESERVED'; end if;

  calculated_delta := resulting_quantity - current_quantity;

  insert into public.inventory_stocks (tenant_id, product_id, warehouse_id, quantity, average_cost, updated_at)
  values (target_tenant_id, target_product_id, target_warehouse_id, resulting_quantity, current_cost, now())
  on conflict (tenant_id, product_id, warehouse_id)
    do update set quantity = excluded.quantity, average_cost = excluded.average_cost, updated_at = now();

  insert into public.inventory_movements (
    tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, performed_by, metadata,
    previous_quantity, new_quantity, previous_average_cost, new_average_cost
  )
  values (
    target_tenant_id, target_product_id, target_warehouse_id, 'adjustment', calculated_delta, current_cost,
    'manual', target_user_id,
    jsonb_build_object(
      'reason', target_reason,
      'operation', target_movement_type,
      'reserved_quantity', current_reserved,
      'previous_quantity', current_quantity,
      'new_quantity', resulting_quantity
    ),
    current_quantity, resulting_quantity, current_cost, current_cost
  )
  returning id into new_movement_id;

  return query select current_quantity, resulting_quantity, calculated_delta, new_movement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) RPC de creación: valida almacenes y líneas, y deja la transferencia en draft.
--    No aparta stock todavía: el apartado ocurre en la aprobación.
-- ---------------------------------------------------------------------------

create or replace function public.create_stock_transfer(
  target_tenant_id uuid,
  target_origin_warehouse_id uuid,
  target_destination_warehouse_id uuid,
  target_user_id uuid,
  target_items jsonb,
  target_reason text default 'Transferencia entre almacenes'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  origin_row public.warehouses%rowtype;
  destination_row public.warehouses%rowtype;
  product_row public.products%rowtype;
  item jsonb;
  product_id uuid;
  requested_quantity numeric;
  unit_cost_value numeric;
  transfer_id uuid := gen_random_uuid();
  transfer_number_value text;
  next_sequence integer;
  normalized_items jsonb := '[]'::jsonb;
  seen_products uuid[] := '{}';
  reason_value text := coalesce(nullif(left(coalesce(target_reason, ''), 300), ''), 'Transferencia entre almacenes');
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;
  if target_origin_warehouse_id is null or target_destination_warehouse_id is null then
    raise exception 'WAREHOUSE_REQUIRED';
  end if;
  if target_origin_warehouse_id = target_destination_warehouse_id then
    raise exception 'TRANSFER_SAME_WAREHOUSE';
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select * into origin_row from public.warehouses
   where id = target_origin_warehouse_id and tenant_id = target_tenant_id and active;
  if not found then raise exception 'ORIGIN_WAREHOUSE_NOT_FOUND'; end if;

  select * into destination_row from public.warehouses
   where id = target_destination_warehouse_id and tenant_id = target_tenant_id and active;
  if not found then raise exception 'DESTINATION_WAREHOUSE_NOT_FOUND'; end if;

  for item in select value from jsonb_array_elements(target_items) order by (value->>'productId') nulls last loop
    product_id := nullif(coalesce(item->>'productId', item->>'product_id', ''), '')::uuid;
    requested_quantity := coalesce(nullif(item->>'quantity', '')::numeric, nullif(item->>'qty', '')::numeric);
    unit_cost_value := nullif(item->>'unitCost', '')::numeric;

    if product_id is null or requested_quantity is null then
      raise exception 'INVALID_TRANSFER_ITEM';
    end if;
    if requested_quantity <= 0 or requested_quantity <> trunc(requested_quantity) then
      raise exception 'INVALID_TRANSFER_QUANTITY';
    end if;
    if product_id = any (seen_products) then
      raise exception 'TRANSFER_DUPLICATE_PRODUCT';
    end if;
    seen_products := array_append(seen_products, product_id);

    select * into product_row from public.products
     where id = product_id and tenant_id = target_tenant_id
     for share;
    if not found or not product_row.active then
      raise exception 'PRODUCT_NOT_FOUND:%', product_id::text;
    end if;
    if coalesce(product_row.item_type, 'physical') = 'service' then
      raise exception 'SERVICE_NOT_TRANSFERABLE:%', product_id::text;
    end if;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'productId', product_id,
      'quantity', requested_quantity,
      'unitCost', greatest(coalesce(unit_cost_value, product_row.cost, 0), 0)
    ));
  end loop;

  if jsonb_array_length(normalized_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  -- Numeración por tenant sin riesgo de choque bajo concurrencia.
  perform pg_advisory_xact_lock(hashtext('stock_transfers:' || target_tenant_id::text)::bigint);

  select coalesce(max(substring(transfer_number from 10)::int), 0) + 1
    into next_sequence
    from public.stock_transfers
   where tenant_id = target_tenant_id
     and transfer_number like 'TRF-' || to_char(now(), 'YYYY') || '-%';

  transfer_number_value := 'TRF-' || to_char(now(), 'YYYY') || '-' || lpad(next_sequence::text, 6, '0');

  insert into public.stock_transfers (
    id, tenant_id, transfer_number, origin_branch_id, origin_warehouse_id,
    destination_branch_id, destination_warehouse_id, status, reason, created_by
  )
  values (
    transfer_id, target_tenant_id, transfer_number_value, origin_row.branch_id, origin_row.id,
    destination_row.branch_id, destination_row.id, 'draft', reason_value, target_user_id
  );

  for item in select value from jsonb_array_elements(normalized_items) loop
    insert into public.stock_transfer_items (
      tenant_id, transfer_id, product_id, requested_quantity, shipped_quantity, received_quantity, unit_cost
    )
    values (
      target_tenant_id, transfer_id, (item->>'productId')::uuid,
      (item->>'quantity')::numeric, 0, 0, greatest(coalesce((item->>'unitCost')::numeric, 0), 0)
    );
  end loop;

  return jsonb_build_object(
    'transferId', transfer_id,
    'transferNumber', transfer_number_value,
    'status', 'draft',
    'originBranchId', origin_row.branch_id,
    'originWarehouseId', origin_row.id,
    'destinationBranchId', destination_row.branch_id,
    'destinationWarehouseId', destination_row.id,
    'items', normalized_items
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Aprobación: draft -> approved. Aparta (reserva) el stock en el origen.
-- ---------------------------------------------------------------------------

create or replace function public.approve_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  stock_row public.inventory_stocks%rowtype;
  available_quantity numeric;
  reserved_total numeric := 0;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status <> 'draft' then raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status; end if;

  if not exists (
    select 1 from public.warehouses
     where id = transfer_row.destination_warehouse_id and tenant_id = target_tenant_id and active
  ) then raise exception 'DESTINATION_WAREHOUSE_NOT_FOUND'; end if;

  -- Orden determinista por producto: evita deadlocks entre transferencias cruzadas.
  for item_row in
    select * from public.stock_transfer_items
     where transfer_id = transfer_row.id and tenant_id = target_tenant_id
     order by product_id
     for update
  loop
    select * into stock_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.origin_warehouse_id
     for update;
    if not found then
      raise exception 'INSUFFICIENT_WAREHOUSE_STOCK:%', item_row.product_id::text;
    end if;

    available_quantity := stock_row.quantity - stock_row.reserved_quantity;
    if available_quantity < item_row.requested_quantity then
      raise exception 'INSUFFICIENT_WAREHOUSE_STOCK:%', item_row.product_id::text;
    end if;

    update public.inventory_stocks
       set reserved_quantity = stock_row.reserved_quantity + item_row.requested_quantity,
           updated_at = now()
     where id = stock_row.id;

    reserved_total := reserved_total + item_row.requested_quantity;
  end loop;

  update public.stock_transfers
     set status = 'approved', approved_by = target_user_id, approved_at = now(), updated_at = now()
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', 'approved',
    'originWarehouseId', transfer_row.origin_warehouse_id,
    'destinationWarehouseId', transfer_row.destination_warehouse_id,
    'reservedQuantity', reserved_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Despacho: approved -> in_transit. Descuenta el origen y marca en tránsito.
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  stock_row public.inventory_stocks%rowtype;
  destination_row public.inventory_stocks%rowtype;
  shipped_total numeric := 0;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status <> 'approved' then raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status; end if;

  for item_row in
    select * from public.stock_transfer_items
     where transfer_id = transfer_row.id and tenant_id = target_tenant_id
     order by product_id
     for update
  loop
    select * into stock_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.origin_warehouse_id
     for update;
    if not found then raise exception 'TRANSFER_STOCK_ROW_NOT_FOUND:%', item_row.product_id::text; end if;
    if stock_row.reserved_quantity < item_row.requested_quantity then
      raise exception 'TRANSFER_NOT_APPROVED:%', item_row.product_id::text;
    end if;

    update public.inventory_stocks
       set reserved_quantity = stock_row.reserved_quantity - item_row.requested_quantity,
           updated_at = now()
     where id = stock_row.id;

    perform public.apply_inventory_movement(
      target_tenant_id, item_row.product_id, transfer_row.origin_warehouse_id,
      'transfer_out', -item_row.requested_quantity, item_row.unit_cost,
      'stock_transfer', transfer_row.id, target_user_id,
      jsonb_build_object('transferNumber', transfer_row.transfer_number, 'direction', 'out')
    );

    select * into destination_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.destination_warehouse_id
     for update;
    if not found then
      insert into public.inventory_stocks (
        tenant_id, product_id, warehouse_id, quantity, reserved_quantity, in_transit_quantity, updated_at
      )
      values (target_tenant_id, item_row.product_id, transfer_row.destination_warehouse_id, 0, 0, 0, now())
      returning * into destination_row;
    end if;

    update public.inventory_stocks
       set in_transit_quantity = destination_row.in_transit_quantity + item_row.requested_quantity,
           updated_at = now()
     where id = destination_row.id;

    update public.stock_transfer_items
       set shipped_quantity = item_row.requested_quantity, updated_at = now()
     where id = item_row.id;

    shipped_total := shipped_total + item_row.requested_quantity;
  end loop;

  update public.stock_transfers
     set status = 'in_transit', dispatched_by = target_user_id, dispatched_at = now(), updated_at = now()
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', 'in_transit',
    'originWarehouseId', transfer_row.origin_warehouse_id,
    'destinationWarehouseId', transfer_row.destination_warehouse_id,
    'shippedQuantity', shipped_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Recepción parcial: in_transit -> (sigue in_transit | received).
--    Cada línea admite varias recepciones mientras received < shipped.
-- ---------------------------------------------------------------------------

create or replace function public.receive_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid,
  target_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  destination_row public.inventory_stocks%rowtype;
  item jsonb;
  received_now numeric;
  pending_quantity numeric;
  received_total numeric := 0;
  remaining_lines integer;
  next_status text;
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status <> 'in_transit' then raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status; end if;

  for item in select value from jsonb_array_elements(target_items) loop
    received_now := coalesce(
      nullif(item->>'quantity', '')::numeric,
      nullif(item->>'receivedQuantity', '')::numeric
    );
    if received_now is null or received_now <= 0
       or received_now <> trunc(received_now) then
      raise exception 'INVALID_TRANSFER_QUANTITY';
    end if;

    -- La línea se identifica por transferItemId o, en su defecto, por productId.
    select * into item_row from public.stock_transfer_items
     where transfer_id = transfer_row.id
       and tenant_id = target_tenant_id
       and (
         (nullif(item->>'transferItemId', '')::uuid is not null and id = nullif(item->>'transferItemId', '')::uuid)
         or (nullif(item->>'transferItemId', '')::uuid is null and product_id = nullif(coalesce(item->>'productId', item->>'product_id', ''), '')::uuid)
       )
     order by product_id
     for update;
    if not found then raise exception 'TRANSFER_ITEM_NOT_FOUND'; end if;

    pending_quantity := item_row.shipped_quantity - item_row.received_quantity;
    if received_now > pending_quantity then
      raise exception 'RECEIPT_EXCEEDS_PENDING:%', item_row.product_id::text;
    end if;

    select * into destination_row from public.inventory_stocks
     where tenant_id = target_tenant_id
       and product_id = item_row.product_id
       and warehouse_id = transfer_row.destination_warehouse_id
     for update;
    if not found then
      insert into public.inventory_stocks (
        tenant_id, product_id, warehouse_id, quantity, reserved_quantity, in_transit_quantity, updated_at
      )
      values (target_tenant_id, item_row.product_id, transfer_row.destination_warehouse_id, 0, 0, 0, now())
      returning * into destination_row;
    end if;

    if destination_row.in_transit_quantity < received_now then
      raise exception 'TRANSFER_IN_TRANSIT_INCONSISTENT:%', item_row.product_id::text;
    end if;

    perform public.apply_inventory_movement(
      target_tenant_id, item_row.product_id, transfer_row.destination_warehouse_id,
      'transfer_in', received_now, item_row.unit_cost,
      'stock_transfer', transfer_row.id, target_user_id,
      jsonb_build_object('transferNumber', transfer_row.transfer_number, 'direction', 'in', 'partialReceipt', true)
    );

    update public.inventory_stocks
       set in_transit_quantity = destination_row.in_transit_quantity - received_now,
           updated_at = now()
     where id = destination_row.id;

    update public.stock_transfer_items
       set received_quantity = item_row.received_quantity + received_now,
           updated_at = now()
     where id = item_row.id;

    received_total := received_total + received_now;
  end loop;

  select count(*) into remaining_lines
    from public.stock_transfer_items
   where transfer_id = transfer_row.id
     and tenant_id = target_tenant_id
     and received_quantity < shipped_quantity;

  next_status := case when remaining_lines = 0 then 'received' else 'in_transit' end;

  update public.stock_transfers
     set status = next_status,
         received_by = target_user_id,
         received_at = case when next_status = 'received' then now() else received_at end,
         updated_at = now()
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', next_status,
    'destinationWarehouseId', transfer_row.destination_warehouse_id,
    'receivedQuantity', received_total,
    'pendingLines', remaining_lines
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) Cancelación: libera lo reservado (approved) o devuelve al origen lo que
--     sigue en tránsito (in_transit). Una transferencia ya recibida no se cancela.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_stock_transfer(
  target_tenant_id uuid,
  target_transfer_id uuid,
  target_user_id uuid,
  target_reason text default 'Transferencia cancelada'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item_row public.stock_transfer_items%rowtype;
  stock_row public.inventory_stocks%rowtype;
  in_transit_pending numeric;
  returned_total numeric := 0;
  reason_value text := coalesce(nullif(left(coalesce(target_reason, ''), 300), ''), 'Transferencia cancelada');
begin
  if session_user not in ('service_role', 'postgres', 'supabase_admin') and not public.has_tenant_access(target_tenant_id) then raise exception 'FORBIDDEN'; end if;

  if target_transfer_id is null then raise exception 'TRANSFER_REQUIRED'; end if;

  select * into transfer_row from public.stock_transfers
   where id = target_transfer_id and tenant_id = target_tenant_id
   for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if transfer_row.status not in ('draft','approved','in_transit') then
    raise exception 'INVALID_TRANSFER_STATUS:%', transfer_row.status;
  end if;

  for item_row in
    select * from public.stock_transfer_items
     where transfer_id = transfer_row.id and tenant_id = target_tenant_id
     order by product_id
     for update
  loop
    if transfer_row.status = 'approved' then
      select * into stock_row from public.inventory_stocks
       where tenant_id = target_tenant_id
         and product_id = item_row.product_id
         and warehouse_id = transfer_row.origin_warehouse_id
       for update;
      if not found or stock_row.reserved_quantity < item_row.requested_quantity then
        raise exception 'TRANSFER_STOCK_INCONSISTENT:%', item_row.product_id::text;
      end if;

      update public.inventory_stocks
         set reserved_quantity = stock_row.reserved_quantity - item_row.requested_quantity,
             updated_at = now()
       where id = stock_row.id;

    elsif transfer_row.status = 'in_transit' then
      in_transit_pending := item_row.shipped_quantity - item_row.received_quantity;
      if in_transit_pending > 0 then
        select * into stock_row from public.inventory_stocks
         where tenant_id = target_tenant_id
           and product_id = item_row.product_id
           and warehouse_id = transfer_row.destination_warehouse_id
         for update;
        if not found or stock_row.in_transit_quantity < in_transit_pending then
          raise exception 'TRANSFER_IN_TRANSIT_INCONSISTENT:%', item_row.product_id::text;
        end if;

        update public.inventory_stocks
           set in_transit_quantity = stock_row.in_transit_quantity - in_transit_pending,
               updated_at = now()
         where id = stock_row.id;

        perform public.apply_inventory_movement(
          target_tenant_id, item_row.product_id, transfer_row.origin_warehouse_id,
          'transfer_in', in_transit_pending, item_row.unit_cost,
          'stock_transfer', transfer_row.id, target_user_id,
          jsonb_build_object('transferNumber', transfer_row.transfer_number, 'direction', 'return', 'reason', reason_value)
        );

        returned_total := returned_total + in_transit_pending;
      end if;
    end if;
  end loop;

  update public.stock_transfers
     set status = 'cancelled',
         cancelled_by = target_user_id,
         cancelled_at = now(),
         updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelReason', reason_value)
   where id = transfer_row.id;

  return jsonb_build_object(
    'transferId', transfer_row.id,
    'transferNumber', transfer_row.transfer_number,
    'status', 'cancelled',
    'previousStatus', transfer_row.status,
    'returnedQuantity', returned_total,
    'reason', reason_value
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) Privilegios: las RPC nuevas sólo las ejecuta el backend (service_role).
-- ---------------------------------------------------------------------------

revoke all on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.approve_stock_transfer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.dispatch_stock_transfer(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.receive_stock_transfer(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_stock_transfer(uuid, uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.adjust_inventory(uuid, uuid, uuid, text, numeric, text, uuid) to service_role;
grant execute on function public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.approve_stock_transfer(uuid, uuid, uuid) to service_role;
grant execute on function public.dispatch_stock_transfer(uuid, uuid, uuid) to service_role;
grant execute on function public.receive_stock_transfer(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.cancel_stock_transfer(uuid, uuid, uuid, text) to service_role;

commit;

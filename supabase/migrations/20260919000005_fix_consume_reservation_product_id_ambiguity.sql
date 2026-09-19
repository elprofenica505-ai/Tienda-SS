-- Fix the reservation-consumption RPC used by presale checkout.
-- The previous implementation declared product_id and compared it to the
-- inventory_stocks.product_id column without qualification, which PostgreSQL
-- rejected as: column reference "product_id" is ambiguous.

create or replace function public.consume_inventory_reservation(
  target_tenant_id uuid,
  target_reservation_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  reservation_row public.inventory_reservations%rowtype;
  item jsonb;
  product_id_value uuid;
  consumed numeric;
  stock_row public.inventory_stocks%rowtype;
begin
  select r.* into reservation_row
    from public.inventory_reservations as r
   where r.id = target_reservation_id
     and r.tenant_id = target_tenant_id
   for update;

  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if reservation_row.status <> 'active' then raise exception 'RESERVATION_CLOSED'; end if;

  for item in select value from jsonb_array_elements(reservation_row.items) loop
    product_id_value := nullif(item->>'productId', '')::uuid;
    consumed := (item->>'quantity')::numeric;
    if product_id_value is null or consumed is null or consumed <= 0 then continue; end if;

    select s.* into stock_row
      from public.inventory_stocks as s
     where s.tenant_id = target_tenant_id
       and s.product_id = product_id_value
       and s.warehouse_id = reservation_row.warehouse_id
     for update;

    if not found or stock_row.reserved_quantity < consumed then
      raise exception 'RESERVATION_STOCK_INCONSISTENT';
    end if;

    update public.inventory_stocks as s
       set reserved_quantity = s.reserved_quantity - consumed,
           quantity = s.quantity - consumed,
           updated_at = now()
     where s.id = stock_row.id;

    insert into public.inventory_movements(
      tenant_id, product_id, warehouse_id, movement_type, quantity,
      unit_cost, reference_type, reference_id, performed_by, metadata
    ) values (
      target_tenant_id, product_id_value, reservation_row.warehouse_id, 'sale', -consumed,
      stock_row.average_cost, 'inventory_reservation', target_reservation_id, target_user_id,
      jsonb_build_object(
        'physical_quantity', stock_row.quantity,
        'previous_reserved', stock_row.reserved_quantity,
        'new_reserved', stock_row.reserved_quantity - consumed,
        'reason', reservation_row.reason
      )
    );
  end loop;

  update public.inventory_reservations as r
     set status = 'consumed',
         released_by = target_user_id,
         released_at = now(),
         updated_at = now()
   where r.id = target_reservation_id
     and r.tenant_id = target_tenant_id;

  return jsonb_build_object('reservationId', target_reservation_id, 'status', 'consumed');
end;
$function$;

revoke all on function public.consume_inventory_reservation(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_inventory_reservation(uuid, uuid, uuid) to service_role;

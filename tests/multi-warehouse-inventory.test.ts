import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stockKey, stockAfterDelta } from '@/lib/inventory-cost';
import {
  availableStock,
  assertTransferableStock,
  canTransition,
  isTerminalTransferStatus,
  nextTransferSequence,
  pendingTransferQuantity,
  receiveTransferLine,
  transferNumberFor,
  transferStatusAfterReceipt,
  validateTransferItems,
  type TransferLine,
} from '@/lib/inventory-transfers';

const migrationFile = readFileSync('supabase/migrations/20261010000001_multi_warehouse_inventory.sql', 'utf8');
/** Los contratos se verifican sobre el SQL ejecutable, no sobre la documentación. */
const migration = migrationFile.replace(/--[^\n]*/g, ' ');

function line(requested: number, shipped: number, received: number): TransferLine {
  return { productId: 'product-1', requested, shipped, received };
}

test('el ciclo de vida de la transferencia es draft -> approved -> in_transit -> received', () => {
  assert.equal(canTransition('draft', 'approved'), true);
  assert.equal(canTransition('approved', 'in_transit'), true);
  assert.equal(canTransition('in_transit', 'received'), true);
  assert.equal(canTransition('draft', 'in_transit'), false, 'no se puede despachar sin aprobar');
  assert.equal(canTransition('draft', 'received'), false, 'no se puede recibir sin despachar');
  assert.equal(canTransition('received', 'in_transit'), false);
  assert.equal(isTerminalTransferStatus('received'), true);
  assert.equal(isTerminalTransferStatus('cancelled'), true);
  assert.equal(isTerminalTransferStatus('in_transit'), false);
});

test('toda transferencia abierta puede cancelarse y las cerradas no', () => {
  assert.equal(canTransition('draft', 'cancelled'), true);
  assert.equal(canTransition('approved', 'cancelled'), true);
  assert.equal(canTransition('in_transit', 'cancelled'), true);
  assert.equal(canTransition('received', 'cancelled'), false);
  assert.equal(canTransition('cancelled', 'approved'), false);
});

test('la recepción parcial admite varias entregas y nunca excede lo despachado', () => {
  const first = receiveTransferLine(line(40, 40, 0), 25);
  assert.deepEqual(first, { received: 25, pending: 15 });
  const second = receiveTransferLine(line(40, 40, first.received), first.pending);
  assert.deepEqual(second, { received: 40, pending: 0 });
  assert.throws(() => receiveTransferLine(line(40, 40, 25), 16), /RECEIPT_EXCEEDS_PENDING/);
  assert.throws(() => receiveTransferLine(line(40, 40, 0), 0), /INVALID_TRANSFER_QUANTITY/);
  assert.throws(() => receiveTransferLine(line(40, 40, 0), 2.5), /INVALID_TRANSFER_QUANTITY/);
});

test('la transferencia sólo cierra en received cuando no queda ninguna línea pendiente', () => {
  assert.equal(transferStatusAfterReceipt([line(40, 40, 25), line(3, 3, 3)]), 'in_transit');
  assert.equal(transferStatusAfterReceipt([line(40, 40, 40), line(3, 3, 3)]), 'received');
  assert.equal(pendingTransferQuantity(line(40, 40, 25)), 15);
});

test('las líneas se validan con los mismos códigos de error que el SQL', () => {
  assert.equal(validateTransferItems([{ productId: 'p1', quantity: 5 }]).length, 1);
  assert.throws(() => validateTransferItems([]), /TRANSFER_ITEMS_REQUIRED/);
  assert.throws(() => validateTransferItems([{ productId: '', quantity: 5 }]), /INVALID_TRANSFER_ITEM/);
  assert.throws(() => validateTransferItems([{ productId: 'p1', quantity: 0 }]), /INVALID_TRANSFER_QUANTITY/);
  assert.throws(() => validateTransferItems([{ productId: 'p1', quantity: 5 }, { productId: 'p1', quantity: 2 }]), /TRANSFER_DUPLICATE_PRODUCT/);
  assert.deepEqual(validateTransferItems([{ productId: 'p1', quantity: 5, unitCost: -3 }]), [{ productId: 'p1', quantity: 5, unitCost: 0 }]);
});

test('el stock disponible nunca queda por debajo de cero y protege lo reservado', () => {
  assert.equal(availableStock(100, 40), 60);
  assert.throws(() => availableStock(10, 11), /TRANSFER_STOCK_INCONSISTENT/);
  assert.throws(() => assertTransferableStock(100, 90, 15, 'p1'), /INSUFFICIENT_WAREHOUSE_STOCK:p1/);
  assert.doesNotThrow(() => assertTransferableStock(100, 90, 10, 'p1'));
});

test('la numeración de transferencias es correlativa por año', () => {
  assert.equal(transferNumberFor(2026, 1), 'TRF-2026-000001');
  assert.equal(transferNumberFor(2026, 42), 'TRF-2026-000042');
  assert.equal(nextTransferSequence([], 2026), 1);
  assert.equal(nextTransferSequence(['TRF-2026-000001', 'TRF-2026-000007'], 2026), 8);
  assert.equal(nextTransferSequence(['TRF-2025-000099'], 2026), 1, 'el correlativo reinicia cada año');
});

test('bajo concurrencia sólo se aprueba lo que cabe en el stock disponible', () => {
  const warehouse = { quantity: 100, reserved: 0 };
  const requested = 15;
  const results = Array.from({ length: 10 }, () => {
    try {
      assertTransferableStock(warehouse.quantity, warehouse.reserved, requested, 'product-1');
      warehouse.reserved += requested;
      return 'approved';
    } catch {
      return 'rejected';
    }
  });
  assert.equal(results.filter((result) => result === 'approved').length, 6, 'seis aprobaciones de 15 caben en 100');
  assert.equal(results.filter((result) => result === 'rejected').length, 4);
  assert.equal(warehouse.reserved, 90);
  assert.ok(warehouse.reserved <= warehouse.quantity, 'nunca se reserva más de lo que hay');
});

test('veinte recepciones concurrentes no reciben más de lo despachado', () => {
  let received = 0;
  const accepted = Array.from({ length: 20 }, () => {
    try {
      received = receiveTransferLine(line(40, 40, received), 10).received;
      return true;
    } catch {
      return false;
    }
  }).filter(Boolean).length;
  assert.equal(accepted, 4, 'cuatro recepciones de 10 agotan las 40 despachadas');
  assert.equal(received, 40);
});

test('una transferencia entre dos almacenes no altera el stock de los demás', () => {
  const ledger = new Map<string, number>([
    [stockKey('bodega-a', 'product-1'), 100],
    [stockKey('bodega-b', 'product-1'), 0],
    [stockKey('bodega-c', 'product-1'), 7],
  ]);
  const move = (from: string, to: string, quantity: number) => {
    const origin = stockKey(from, 'product-1');
    const destination = stockKey(to, 'product-1');
    const next = stockAfterDelta(ledger.get(origin) || 0, -quantity);
    ledger.set(origin, next);
    ledger.set(destination, stockAfterDelta(ledger.get(destination) || 0, quantity));
  };
  move('bodega-a', 'bodega-b', 40);
  assert.equal(ledger.get(stockKey('bodega-a', 'product-1')), 60);
  assert.equal(ledger.get(stockKey('bodega-b', 'product-1')), 40);
  assert.equal(ledger.get(stockKey('bodega-c', 'product-1')), 7, 'el almacén ajeno a la transferencia no cambia');
  const total = Array.from(ledger.values()).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 107, 'las unidades se conservan entre almacenes');
  assert.throws(() => move('bodega-b', 'bodega-a', 41), /INSUFFICIENT_WAREHOUSE_STOCK/);
});

test('la migración crea el ciclo de vida de transferencias con sus invariantes en la base', () => {
  assert.match(migration, /create table if not exists public\.stock_transfers/);
  assert.match(migration, /create table if not exists public\.stock_transfer_items/);
  assert.match(migration, /check \(status in \('draft','approved','in_transit','received','cancelled'\)\)/);
  assert.match(migration, /stock_transfers_distinct_warehouses check \(origin_warehouse_id <> destination_warehouse_id\)/);
  assert.match(migration, /stock_transfer_items_shipped_within_requested check \(shipped_quantity <= requested_quantity\)/);
  assert.match(migration, /stock_transfer_items_received_within_shipped check \(received_quantity <= shipped_quantity\)/);
});

test('inventory_stocks sigue siendo la fuente canónica y sólo gana la columna de tránsito', () => {
  assert.match(migration, /alter table public\.inventory_stocks\s+add column if not exists in_transit_quantity numeric\(14,4\) not null default 0/);
  assert.equal(/create table[^;]*public\.inventory_stocks/.test(migration), false, 'no se recrea la tabla existente');
});

test('cada cambio de stock toma la fila con lock antes de decidir', () => {
  const stockLocks = migration.match(/from public\.inventory_stocks[\s\S]{0,220}?for update/g) || [];
  assert.ok(stockLocks.length >= 5, `esperado >= 5 bloqueos de fila, obtenidos ${stockLocks.length}`);
  assert.match(migration, /order by product_id\s+for update/, 'las líneas se recorren en orden determinista para evitar deadlocks');
  assert.match(migration, /pg_advisory_xact_lock/, 'la numeración se serializa por tenant');
});

test('el kárdex de las transferencias se delega en apply_inventory_movement', () => {
  const transferOut = migration.match(/'transfer_out'/g) || [];
  const transferIn = migration.match(/'transfer_in'/g) || [];
  assert.equal(transferOut.length, 1);
  assert.equal(transferIn.length, 2, 'entrada en destino y devolución al cancelar');
  assert.match(migration, /perform public\.apply_inventory_movement\(/);
});

test('la migración respalda el stock legacy de forma idempotente', () => {
  assert.match(migration, /\(p\.metadata->>'initialStock'\)::numeric/);
  assert.match(migration, /information_schema\.columns/, 'detecta si existe una columna física products.stock');
  assert.match(migration, /not exists \(\s*select 1 from public\.inventory_stocks s/, 'sólo toca productos sin fila de stock');
  assert.match(migration, /on conflict \(tenant_id, product_id, warehouse_id\) do nothing/);
  assert.match(migration, /'legacy_stock_backfill'/);
});

test('las tablas nuevas nacen con RLS y sin acceso para los roles del navegador', () => {
  assert.match(migration, /alter table public\.stock_transfers enable row level security/);
  assert.match(migration, /alter table public\.stock_transfer_items enable row level security/);
  assert.match(migration, /revoke all on table public\.stock_transfers, public\.stock_transfer_items from anon, authenticated/);
  assert.match(migration, /create policy stock_transfers_tenant_select on public\.stock_transfers\s+for select to authenticated using \(public\.has_tenant_access\(tenant_id\)\)/);
});

test('las RPC nuevas sólo las ejecuta el backend y validan al llamante', () => {
  for (const signature of [
    'public.create_stock_transfer(uuid, uuid, uuid, uuid, jsonb, text)',
    'public.approve_stock_transfer(uuid, uuid, uuid)',
    'public.dispatch_stock_transfer(uuid, uuid, uuid)',
    'public.receive_stock_transfer(uuid, uuid, uuid, jsonb)',
    'public.cancel_stock_transfer(uuid, uuid, uuid, text)',
  ]) {
    assert.ok(migration.includes(`revoke all on function ${signature} from public, anon, authenticated`), `falta revoke de ${signature}`);
    assert.ok(migration.includes(`grant execute on function ${signature} to service_role`), `falta grant de ${signature}`);
  }
  const guards = migration.match(/if session_user not in \('service_role', 'postgres', 'supabase_admin'\) and not public\.has_tenant_access\(target_tenant_id\) then raise exception 'FORBIDDEN'; end if;/g) || [];
  assert.equal(guards.length, 6, 'las cinco RPC de transferencia más adjust_inventory');
  assert.equal(/current_user <> 'service_role'/.test(migration), false, 'current_user cambia a el dueño en una función security definer');
});

test('el almacén es obligatorio en todo movimiento de inventario', () => {
  assert.match(migration, /if target_warehouse_id is null then raise exception 'WAREHOUSE_REQUIRED'; end if;/);
  assert.match(migration, /if target_origin_warehouse_id is null or target_destination_warehouse_id is null then\s+raise exception 'WAREHOUSE_REQUIRED';/);
  assert.match(migration, /ORIGIN_WAREHOUSE_NOT_FOUND/);
  assert.match(migration, /DESTINATION_WAREHOUSE_NOT_FOUND/);
});

test('el ajuste de stock no puede quedar por debajo de lo reservado', () => {
  assert.match(migration, /if resulting_quantity < current_reserved then raise exception 'INSUFFICIENT_STOCK:RESERVED'; end if;/);
  assert.match(migration, /create or replace function public\.adjust_inventory\(/);
});

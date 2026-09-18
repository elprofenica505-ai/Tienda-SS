import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const salesApi = readFileSync(new URL('../app/api/sales/route.ts', import.meta.url), 'utf8');
const presalesApi = readFileSync(new URL('../app/api/presales/checkout/route.ts', import.meta.url), 'utf8');
const presalesCreateApi = readFileSync(new URL('../app/api/presales/route.ts', import.meta.url), 'utf8');
const saleRpc = readFileSync(new URL('../lib/sale-rpc.ts', import.meta.url), 'utf8');

test('ventas y checkout de preventas comparten fallback para errores estructurados de Supabase', () => {
  for (const source of [salesApi, presalesApi]) {
    assert.match(source, /isMissingServerPricedRpc/);
    assert.match(source, /create_sale_with_payments/);
    assert.match(source, /create_sale'/);
    assert.match(source, /priceSaleItemsFromCatalog/);
  }
  assert.match(saleRpc, /'message' in error/);
  assert.match(saleRpc, /server_catalog_fallback|taxAmount/);
});

test('el fallback no reutiliza precio ni impuesto enviados por el cliente', () => {
  assert.match(salesApi, /target_items: fallbackPricing\.items/);
  assert.match(salesApi, /target_metadata: \{ \.\.\.metadata, taxAmount: fallbackPricing\.taxAmount/);
  assert.match(presalesApi, /target_items: fallbackPricing\.items/);
  assert.match(presalesApi, /target_metadata: \{ \.\.\.metadata, taxAmount: fallbackPricing\.taxAmount/);
});

test('ventas y preventas no seleccionan silenciosamente la primera sucursal', () => {
  assert.match(salesApi, /resolveAuthorizedBranchId\(context, requestedBranchId \|\| undefined\)/);
  assert.match(presalesCreateApi, /resolveAuthorizedBranchId\(context, requestedBranchId \|\| undefined\)/);
  assert.doesNotMatch(salesApi, /context\.branchIds\[0\]/);
  assert.doesNotMatch(presalesCreateApi, /context\.branchIds\[0\]/);
});

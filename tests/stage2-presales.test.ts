import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getApiPolicy } from '@/lib/api-policy';

const presalesApi = readFileSync('app/api/presales/route.ts', 'utf8');
const checkoutApi = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const sellerPage = readFileSync('app/workspace/presales/page.tsx', 'utf8');
const cashierPage = readFileSync('app/workspace/cashier/page.tsx', 'utf8');
const workspacePage = readFileSync('app/workspace/page.tsx', 'utf8');

test('la preventa tiene ticket, líneas, vendedor, estados y evidencia liviana', () => {
  assert.match(presalesApi, /ticketCode/);
  assert.match(presalesApi, /items: lines/);
  assert.match(presalesApi, /vendedorUid/);
  assert.match(presalesApi, /sent_to_cashier/);
  assert.match(presalesApi, /evidenceRefs/);
  assert.match(presalesApi, /\.limit\(21\)/);
  assert.match(presalesApi, /!item\.startsWith\('data:'\)/);
});

test('el checkout usa create_sale y marca paid de forma idempotente', () => {
  assert.match(checkoutApi, /supabase\.from\('presales'\)/);
  assert.match(checkoutApi, /presale\.status === 'paid'/);
  assert.match(checkoutApi, /rpc\('create_sale'/);
  assert.match(checkoutApi, /target_idempotency_key: `presale:\$\{presaleId\}`/);
  assert.match(checkoutApi, /status: 'paid'/);
  assert.match(checkoutApi, /INSUFFICIENT_STOCK/);
  assert.match(checkoutApi, /presaleId/);
});

test('los paneles de vendedor y caja están disponibles', () => {
  assert.match(sellerPage, /Enviar a caja/);
  assert.match(sellerPage, /capture="environment"/);
  assert.match(cashierPage, /Código de ticket/);
  assert.match(cashierPage, /Cobrar ticket/);
});

test('la API mantiene el aislamiento por tenant, sucursal y política de ventas', () => {
  assert.deepEqual(getApiPolicy('/api/presales', 'POST'), { module: 'sales', action: 'create' });
  assert.deepEqual(getApiPolicy('/api/presales/checkout', 'POST'), { module: 'sales', action: 'create' });
  assert.match(presalesApi, /\.eq\('tenant_id', context\.tenantId\)/);
  assert.match(presalesApi, /context\.branchIds\.includes\(branchId\)/);
  assert.match(checkoutApi, /assertBranchAccess\(context, branchId\)/);
});

test('la consulta de preventas usa orden descendente y cursor estable de Supabase', () => {
  assert.match(presalesApi, /\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
  assert.match(presalesApi, /created_at\.lt\.\$\{cursor\.createdAt\}/);
  assert.match(presalesApi, /created_at\.eq\.\$\{cursor\.createdAt\},id\.lt\.\$\{cursor\.id\}/);
  assert.match(presalesApi, /nextCursor/);
});

test('el dashboard no se cae si preventas responde con error', () => {
  assert.match(workspacePage, /if \(!presalesResponse\.ok\) setMessage/);
  assert.doesNotMatch(workspacePage, /if \(!presalesResponse\.ok\) throw/);
});

 test('la API de preventas valida productos y persiste con Supabase', () => {
  assert.match(presalesApi, /supabase\.from\('products'\)/);
  assert.match(presalesApi, /\.in\('id', productIds\)/);
  assert.match(presalesApi, /supabase\.from\('presales'\)\.insert/);
  assert.match(presalesApi, /writeImmutableAudit/);
});

 test('las transiciones de preventa quedan acotadas al tenant y al vendedor', () => {
  assert.match(presalesApi, /\.from\('presales'\)\.select\('id,status,seller_uid,total,branch_id,reservation_id'\)/);
  assert.match(presalesApi, /context\.role === 'vendedor' && currentResult\.data\.seller_uid !== context\.uid/);
  assert.match(presalesApi, /\.from\('presales'\)\.update\(\{ status: action/);
});

 test('el checkout usa la RPC de venta como única operación de stock', () => {
  assert.match(checkoutApi, /supabase\.rpc\('create_sale'/);
  assert.doesNotMatch(checkoutApi, /update_inventory|inventory_stocks.*update|delta: -quantity/);
});

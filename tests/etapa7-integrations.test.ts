import assert from 'node:assert/strict';
import test from 'node:test';
import { createFiscalSaleFields, formatFiscalNumber, validateFiscalFields } from '@/lib/fiscal-ni';
import { parseCsv } from '@/lib/csv';
import { createWebhookEnvelope, signWebhook, verifyWebhook } from '@/lib/integrations';

test('fiscalidad Nicaragua calcula base, IVA y numeración estable', () => {
  const fiscal = createFiscalSaleFields({ customerName: 'Cliente', customerRuc: 'J03100000-1' }, 100, 10);
  assert.equal(fiscal.taxableBase, 90);
  assert.equal(fiscal.taxAmount, 13.5);
  assert.equal(fiscal.total, 103.5);
  assert.equal(validateFiscalFields(fiscal), null);
  assert.equal(formatFiscalNumber('FAC', 7), 'FAC-00000007');
});

test('parser CSV tolera BOM, comillas y limita fórmulas', () => {
  const parsed = parseCsv('\uFEFFname,sku,price,stock\n"Producto, uno",P-1,10,2\n=mal,P-2,5,1');
  assert.deepEqual(parsed.headers, ['name', 'sku', 'price', 'stock']);
  assert.equal(parsed.rows[0].name, 'Producto, uno');
  assert.equal(parsed.rows[1].name, "'=mal");
  assert.equal(parsed.errors.length, 0);
});

test('webhook preview exige firma, tolerancia e idempotencia por envelope', () => {
  const payload = JSON.stringify(createWebhookEnvelope('tenant-a', 'sale.created', { saleId: 's1' }, 'evt-1'));
  const signature = signWebhook(payload, 'secret', 2_000);
  assert.equal(verifyWebhook(payload, signature, 'secret', 300, 2_100), true);
  assert.equal(verifyWebhook(payload, signature, 'secret', 300, 2_301), false);
  assert.equal(verifyWebhook(payload, signature, 'wrong', 300, 2_100), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { FISCAL_PROVIDERS, fiscalConfigForStorage, getFiscalAdapter, normalizeFiscalConfig, validateFiscalConfig } from '@/lib/fiscal-adapters';
import { readFileSync } from 'node:fs';

const configApi = readFileSync('app/api/fiscal/config/route.ts', 'utf8');
const salesApi = readFileSync('app/api/sales/route.ts', 'utf8');
const checkoutApi = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const cashierPage = readFileSync('app/workspace/cashier/page.tsx', 'utf8');

test('ofrece proveedores intercambiables sin acoplar el núcleo de ventas', () => {
  assert.ok(FISCAL_PROVIDERS.some((provider) => provider.id === 'manual'));
  assert.ok(FISCAL_PROVIDERS.some((provider) => provider.id === 'generic_api'));
  assert.ok(FISCAL_PROVIDERS.some((provider) => provider.id === 'dgi_nicaragua'));
  assert.ok(FISCAL_PROVIDERS.some((provider) => provider.id === 'custom'));
  assert.equal(getFiscalAdapter('manual').provider, 'manual');
});

test('normaliza configuración por empresa y no guarda secretos en la respuesta', () => {
  const config = normalizeFiscalConfig({ provider: 'generic_api', mode: 'sandbox', endpoint: 'https://provider.example/api', credentialRef: 'secret/ref/company-a', legalName: 'Empresa de Prueba', taxId: 'J0310000000000', documentTypes: ['invoice', 'credit_note'] });
  assert.equal(config.provider, 'generic_api');
  assert.equal(config.mode, 'sandbox');
  assert.equal(config.country, 'NI');
  assert.equal(validateFiscalConfig(config), null);
  assert.match(configApi, /credentialRef: config\.credentialRef \? 'configured'/);
});

test('rechaza emisión externa sin endpoint o referencia segura', () => {
  const config = normalizeFiscalConfig({ provider: 'generic_api', mode: 'production', legalName: 'Empresa de Prueba', taxId: 'J0310000000000' });
  assert.equal(validateFiscalConfig(config), 'El endpoint del proveedor es obligatorio fuera del modo manual.');
});

test('permite modo manual con RUC sin endpoint ni credenciales', () => {
  const config = normalizeFiscalConfig({ provider: 'manual', mode: 'manual', legalName: 'Empresa de Prueba', taxId: 'J0310000000000' });
  assert.equal(validateFiscalConfig(config), null);
  assert.equal(fiscalConfigForStorage(config).endpoint, undefined);
  assert.equal(fiscalConfigForStorage(config).credentialRef, undefined);
});

test('exige identidad legal del emisor también en modo manual', () => {
  const config = normalizeFiscalConfig({ provider: 'manual', mode: 'manual' });
  assert.equal(validateFiscalConfig(config), 'La razón social de la empresa es obligatoria.');
});

test('las ventas conservan los datos fiscales necesarios para emitir documentos', () => {
  assert.match(salesApi, /documentType/);
  assert.match(salesApi, /customerRuc/);
  assert.match(salesApi, /taxAmount/);
  assert.match(salesApi, /currency/);
});

test('la configuración exige rol responsable y vive bajo el tenant autenticado', () => {
  assert.match(configApi, /requireTenantMember/);
  assert.match(configApi, /MANAGERS\.includes/);
  assert.match(configApi, /from\('fiscal_configs'\)/);
  assert.match(configApi, /\.eq\('tenant_id', context\.tenantId\)/);
  assert.match(configApi, /upsert\(/);
  assert.match(configApi, /onConflict: 'tenant_id'/);
});

test('la máscara configured conserva la referencia segura existente', () => {
  const config = normalizeFiscalConfig({ provider: 'generic_api', credentialRef: 'configured' }, { provider: 'generic_api', mode: 'sandbox', credentialRef: 'secret/ref/company-a' });
  assert.equal(config.credentialRef, 'secret/ref/company-a');
});

test('el adaptador externo publica la venta en el endpoint con referencia segura', async () => {
  const config = normalizeFiscalConfig({ provider: 'dgi_nicaragua', mode: 'sandbox', endpoint: 'https://provider.example/fiscal', credentialRef: 'vault/company-a' });
  const previousFetch = globalThis.fetch;
  let request: RequestInit | undefined;
  try {
    globalThis.fetch = async (_input, init) => { request = init; return new Response(JSON.stringify({ status: 'accepted', externalId: 'DGI-123' }), { status: 200, headers: { 'content-type': 'application/json' } }); };
    const result = await getFiscalAdapter(config.provider, config).emit({ tenantId: 'tenant-1', saleId: 'sale-1', invoiceNumber: 'FAC-00000001', fields: { documentType: 'invoice', customerName: 'Cliente', customerRuc: '', customerAddress: '', taxRate: 0.15, taxableBase: 100, exemptAmount: 0, taxAmount: 15, total: 115, currency: 'NIO' }, items: [{ productId: 'p-1', quantity: 1 }], config });
    assert.equal(result.status, 'submitted');
    assert.equal(result.externalId, 'DGI-123');
    assert.equal((request?.headers as Record<string, string>)['x-credential-reference'], 'vault/company-a');
    assert.match(String(request?.body), /"invoiceNumber":"FAC-00000001"/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('el checkout usa el endpoint configurado y el ticket respeta showBarcode', () => {
  assert.match(checkoutApi, /getFiscalAdapter\(config\.provider, config\)/);
  assert.match(checkoutApi, /showBarcode: config\.showBarcode !== false/);
  assert.match(cashierPage, /receipt\.fiscal\?\.showBarcode !== false/);
  assert.match(cashierPage, /ticket-barcode/);
});

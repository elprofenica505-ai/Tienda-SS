import assert from 'node:assert/strict';
import test from 'node:test';
import { FISCAL_PROVIDERS, fiscalConfigForStorage, getFiscalAdapter, normalizeFiscalConfig, validateFiscalConfig } from '@/lib/fiscal-adapters';
import { readFileSync } from 'node:fs';

const configApi = readFileSync('app/api/fiscal/config/route.ts', 'utf8');
const salesApi = readFileSync('app/api/sales/route.ts', 'utf8');

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

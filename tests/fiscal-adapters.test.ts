import assert from 'node:assert/strict';
import test from 'node:test';
import { FISCAL_PROVIDERS, getFiscalAdapter, normalizeFiscalConfig, validateFiscalConfig } from '@/lib/fiscal-adapters';
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
  const config = normalizeFiscalConfig({ provider: 'generic_api', mode: 'sandbox', endpoint: 'https://provider.example/api', credentialRef: 'secret/ref/company-a', documentTypes: ['invoice', 'credit_note'] });
  assert.equal(config.provider, 'generic_api');
  assert.equal(config.mode, 'sandbox');
  assert.equal(config.country, 'NI');
  assert.equal(validateFiscalConfig(config), null);
  assert.match(configApi, /credentialRef: config\.credentialRef \? 'configured'/);
});

test('rechaza emisión externa sin endpoint o referencia segura', () => {
  const config = normalizeFiscalConfig({ provider: 'generic_api', mode: 'production' });
  assert.equal(validateFiscalConfig(config), 'El endpoint del proveedor es obligatorio fuera del modo manual.');
});

test('las ventas registran proveedor y modo fiscal del tenant', () => {
  assert.match(salesApi, /normalizeFiscalConfig/);
  assert.match(salesApi, /provider: fiscalConfig\.provider/);
  assert.match(salesApi, /mode: fiscalConfig\.mode/);
  assert.match(salesApi, /adapter-core-2026-09/);
});

test('la configuración exige rol responsable y vive bajo el tenant autenticado', () => {
  assert.match(configApi, /requireTenantMember/);
  assert.match(configApi, /MANAGERS\.includes/);
  assert.match(configApi, /tenants'\)\.doc\(context\.tenantId\)/);
});

test('la máscara configured conserva la referencia segura existente', () => {
  const config = normalizeFiscalConfig({ provider: 'generic_api', credentialRef: 'configured' }, { provider: 'generic_api', mode: 'sandbox', credentialRef: 'secret/ref/company-a' });
  assert.equal(config.credentialRef, 'secret/ref/company-a');
});

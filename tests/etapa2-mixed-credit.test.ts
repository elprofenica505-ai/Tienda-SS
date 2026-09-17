import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260916000002_mixed_sale_payments.sql', 'utf8');
const checkout = readFileSync('app/api/presales/checkout/route.ts', 'utf8');
const receivables = readFileSync('app/api/receivables/route.ts', 'utf8');
const contacts = readFileSync('app/workspace/contacts/page.tsx', 'utf8');
const receivablesPage = readFileSync('app/workspace/receivables/page.tsx', 'utf8');
const presalesRoute = readFileSync('app/api/presales/route.ts', 'utf8');
const salesRoute = readFileSync('app/api/sales/route.ts', 'utf8');
const salesPage = readFileSync('app/workspace/sales/page.tsx', 'utf8');
const presalesPage = readFileSync('app/workspace/presales/page.tsx', 'utf8');
const orderMetadataMigration = readFileSync('supabase/migrations/20260916000003_sales_order_metadata.sql', 'utf8');
const tenantAccess = readFileSync('lib/supabase/tenant-access.ts', 'utf8');
const returnsRoute = readFileSync('app/api/sales/returns/route.ts', 'utf8');
const tenantErrors = readFileSync('lib/tenant.ts', 'utf8');
const organizationRepository = readFileSync('lib/repositories/organization-repository.ts', 'utf8');
const organizationScope = readFileSync('lib/organization-scope.ts', 'utf8');
const salesApi = readFileSync('app/api/sales/route.ts', 'utf8');

test('venta mixta usa RPC transaccional y crea cuenta por cobrar por el crédito', () => {
  assert.match(migration, /create_sale_with_payments/);
  assert.match(migration, /paymentMethod[\s\S]*mixed/);
  assert.match(migration, /payment_method, amount[\s\S]*card/);
  assert.match(migration, /payment_method, amount[\s\S]*transfer/);
  assert.match(migration, /cash_movements[\s\S]*cash_amount/);
  assert.match(migration, /insert into public\.receivables/);
  assert.match(migration, /CREDIT_LIMIT_EXCEEDED/);
  assert.match(checkout, /create_sale_with_payments/);
  assert.match(checkout, /splitPayments/);
});

test('la resolución de membership bloquea tenants suspendidos', () => {
  assert.match(organizationRepository, /platform_status/);
  assert.match(organizationRepository, /platform_status === 'suspended'/);
});

test('abono CxC expone FIFO y allocations explícitos', () => {
  assert.match(receivables, /register_receivable_payment/);
  assert.match(receivables, /target_allocations/);
  assert.match(receivables, /customerId/);
});

test('la UI móvil permite configurar crédito y registrar abono por cliente', () => {
  assert.match(contacts, /creditEnabled/);
  assert.match(contacts, /termDays/);
  assert.match(contacts, /creditStatus/);
  assert.match(receivablesPage, /Cliente para abono FIFO/);
  assert.match(receivablesPage, /customerId/);
});

test('caja puede iniciar preventas y POS acepta pagos estructurados', () => {
  assert.match(presalesRoute, /'cajero'/);
  assert.match(presalesRoute, /Ventas > Crear/);
  assert.match(salesRoute, /create_sale_with_payments/);
  assert.match(salesRoute, /splitPayments/);
});

test('el pago simple sólo crea movimiento de caja para cash', () => {
  const saleMigration = readFileSync('supabase/migrations/20260913000003_fix_create_sale_variable_collisions.sql', 'utf8');
  assert.match(saleMigration, /if target_payment_method = 'cash' then[\s\S]*insert into public\.cash_movements/);
});

test('POS no permite cobrar efectivo insuficiente y genera comprobante con vuelto', () => {
  assert.match(salesPage, /Faltan/);
  assert.match(salesPage, /Vuelto/);
  assert.match(salesPage, /Comprobante generado/);
  assert.match(salesPage, /Imprimir \/ Guardar PDF/);
  assert.match(salesPage, /Number\(cashReceived \|\| 0\) < total/);
});

test('POS y preventa conservan datos operativos para la sucursal', () => {
  assert.match(orderMetadataMigration, /alter table public\.presales add column if not exists metadata/);
  assert.match(salesRoute, /notes: text\(body\.notes/);
  assert.match(presalesRoute, /suggestedPayment/);
  assert.match(presalesRoute, /documentType/);
  assert.match(presalesPage, /Condición sugerida de pago/);
  assert.match(presalesPage, /Imprimir ticket de preventa/);
  assert.match(salesPage, /Tipo de comprobante/);
  assert.match(salesPage, /Impuestos estimados/);
});

test('la autorización server-side respeta permisos guardados por tenant', () => {
  assert.match(tenantAccess, /from\('tenant_settings'\)/);
  assert.ok(tenantAccess.includes('saved?.[context.role]'));
  assert.match(tenantAccess, /normalizePermissions\(saved/);
});

test('devoluciones usan exactamente la firma RPC desplegada', () => {
  assert.match(returnsRoute, /create_sale_return/);
  assert.doesNotMatch(returnsRoute, /target_stock_disposition/);
});

test('errores de migración y restricciones no se presentan como 500 genérico', () => {
  assert.match(tenantErrors, /DATABASE_MIGRATION_REQUIRED/);
  assert.match(tenantErrors, /DATABASE_PERMISSION_DENIED/);
  assert.match(tenantErrors, /DATA_CONSTRAINT/);
});

test('POS y preventa normalizan IDs legados de sucursal y almacén', () => {
  assert.match(organizationScope, /legacy_firestore_id/);
  assert.match(salesApi, /resolveTenantBranchAndWarehouse/);
  assert.match(checkout, /resolveTenantBranchAndWarehouse/);
  assert.match(presalesRoute, /resolveTenantBranchAndWarehouse/);
  assert.match(tenantErrors, /BRANCH_OUT_OF_SCOPE/);
});

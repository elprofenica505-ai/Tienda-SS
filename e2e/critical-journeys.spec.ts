import { test, expect, type Page } from '@playwright/test';

const ownerEmail = process.env.E2E_OWNER_EMAIL || '';
const ownerPassword = process.env.E2E_OWNER_PASSWORD || '';
const mutationsEnabled = process.env.E2E_RUN_MUTATIONS === 'true' && Boolean(ownerEmail && ownerPassword);

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('tu@empresa.com').fill(ownerEmail);
  await page.getByPlaceholder('Mínimo 8 caracteres').fill(ownerPassword);
  await page.getByRole('button', { name: /Iniciar sesión/i }).click();
  await page.waitForURL(/\/workspace|\/onboarding/, { timeout: 30_000 });
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: /Entrar a mi espacio/i }).click();
    await page.waitForURL(/\/workspace/);
  }
}

test.describe('journeys críticos de producción', () => {
  test('registro de empresa muestra el flujo de alta', async ({ page }) => {
    test.skip(process.env.E2E_RUN_REGISTRATION !== 'true', 'Requiere E2E_RUN_REGISTRATION=true porque crea datos reales.');
    await page.goto('/register');
    await expect(page.getByText('Crear espacio')).toBeVisible();
    await expect(page.getByPlaceholder('Ej. Grupo Horizonte')).toBeVisible();
    await expect(page.getByRole('button', { name: /Crear mi empresa/i })).toBeVisible();
  });

  test('login, creación de producto y venta cobrada', async ({ page }) => {
    test.skip(!mutationsEnabled, 'Requiere credenciales E2E y E2E_RUN_MUTATIONS=true.');
    await login(page);
    await page.goto('/workspace/catalog');
    await page.getByRole('button', { name: /Nuevo producto/i }).click();
    const modal = page.locator('.catalog-modal');
    await modal.getByLabel('Nombre').fill(`E2E Producto ${Date.now()}`);
    await modal.getByLabel('Precio').fill('10');
    await modal.getByLabel('Stock inicial').fill('5');
    await modal.getByRole('button', { name: /Crear producto/i }).click();
    await expect(page.locator('.catalog-message')).toContainText(/creado/i);

    await page.goto('/workspace/sales');
    await page.locator('.sales-product').first().click();
    await page.getByRole('button', { name: /Cobrar venta/i }).click();
    await expect(page.locator('.catalog-message')).toContainText(/Venta .* registrada/i);
  });

  test('venta a crédito y abono se muestran en sus módulos', async ({ page }) => {
    test.skip(!mutationsEnabled || process.env.E2E_HAS_CUSTOMER !== 'true', 'Requiere tenant E2E con cliente y E2E_HAS_CUSTOMER=true.');
    await login(page);
    await page.goto('/workspace/sales');
    await expect(page.getByRole('button', { name: 'Crédito', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Crédito', exact: true }).click();
    await expect(page.getByText(/Cliente guardado/i)).toBeVisible();
    await page.goto('/workspace/receivables');
    await expect(page.getByText(/Cuentas por cobrar/i)).toBeVisible();
  });

  test('cambio de plan y portal de facturación están visibles', async ({ page }) => {
    test.skip(!mutationsEnabled, 'Requiere credenciales E2E y E2E_RUN_MUTATIONS=true.');
    await login(page);
    await page.goto('/workspace/billing');
    await expect(page.getByRole('heading', { name: /Planes y facturación/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Elegir este plan/i }).first()).toBeVisible();
  });

  test('invitación y aceptación pueden verificarse mediante el endpoint firmado', async ({ request }) => {
    test.skip(!process.env.E2E_INVITATION_TOKEN || !process.env.E2E_MEMBER_ID_TOKEN || !process.env.E2E_TENANT_ID, 'Requiere token de invitación, ID token de miembro y tenant de staging.');
    const response = await request.post('/api/invitations/accept', {
      headers: { Authorization: `Bearer ${process.env.E2E_MEMBER_ID_TOKEN}`, 'x-tenant-id': process.env.E2E_TENANT_ID! },
      data: { token: process.env.E2E_INVITATION_TOKEN, name: 'E2E Member', password: process.env.E2E_MEMBER_PASSWORD || 'Password123!' },
    });
    expect([200, 201, 409]).toContain(response.status());
  });
});

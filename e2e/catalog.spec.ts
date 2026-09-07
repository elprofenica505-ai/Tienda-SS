import { test, expect } from '@playwright/test';
import { enterWorkspaceFromOnboarding, loginAsE2EUser, requireE2ECredentials } from './fixtures';

test.describe('Catálogo', () => {
  test('crea un producto físico y lo deja archivado al finalizar', async ({ page }) => {
    test.skip(!requireE2ECredentials(), 'Requiere una cuenta Firebase E2E con empresa creada.');
    const suffix = Date.now().toString();
    const productName = `Producto E2E ${suffix}`;
    const sku = `E2E-${suffix}`;

    await loginAsE2EUser(page);
    await enterWorkspaceFromOnboarding(page);
    await page.goto('/workspace/catalog');
    await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();

    await page.getByRole('button', { name: /Nuevo producto|Agregar producto/ }).first().click();
    await page.getByLabel('Nombre', { exact: true }).fill(productName);
    await page.getByLabel('SKU').fill(sku);
    await page.getByLabel('Precio').fill('19.99');
    await page.getByLabel('Stock inicial').fill('7');
    await page.getByRole('button', { name: /Crear producto/ }).click();

    await expect(page.getByText('Producto creado.')).toBeVisible({ timeout: 20_000 });
    const productCard = page.locator('.product-card').filter({ hasText: productName });
    await expect(productCard).toBeVisible();
    await expect(productCard).toContainText(sku);
    await expect(productCard).toContainText('$19.99');

    await productCard.getByRole('button', { name: 'Archivar' }).click();
    await expect(page.getByText('Producto archivado.')).toBeVisible({ timeout: 20_000 });
  });
});

import { expect, type Page } from '@playwright/test';

export const e2eEmail = process.env.E2E_EMAIL;
export const e2ePassword = process.env.E2E_PASSWORD;

export function requireE2ECredentials() {
  return Boolean(e2eEmail && e2ePassword);
}

export async function loginAsE2EUser(page: Page) {
  if (!e2eEmail || !e2ePassword) throw new Error('Configura E2E_EMAIL y E2E_PASSWORD para ejecutar pruebas autenticadas.');

  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(e2eEmail);
  await page.getByLabel('Contraseña').fill(e2ePassword);
  await page.getByRole('button', { name: /Iniciar sesión/ }).click();

  await expect(page).toHaveURL(/\/(onboarding|workspace)(?:\/)?$/, { timeout: 30_000 });
  await expect(page.getByText(/Verifica tu correo electrónico/i)).toHaveCount(0);
}

export async function enterWorkspaceFromOnboarding(page: Page) {
  if (page.url().includes('/onboarding')) {
    await expect(page.getByRole('heading', { name: /Tu espacio está listo/i })).toBeVisible();
    await page.getByRole('button', { name: /Entrar a mi espacio/i }).click();
    await expect(page).toHaveURL(/\/workspace(?:\/)?$/, { timeout: 20_000 });
  }
}

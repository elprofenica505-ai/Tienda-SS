import { test, expect } from '@playwright/test';
import { e2eEmail, e2ePassword, loginAsE2EUser, requireE2ECredentials } from './fixtures';

test.describe('Login', () => {
  test('rechaza un correo con formato inválido sin enviar la solicitud', async ({ page }) => {
    await page.goto('/login');
    const email = page.getByLabel('Correo electrónico');
    await email.fill('correo-no-valido');
    await page.getByLabel('Contraseña').fill('una-clave-de-prueba');
    await page.getByRole('button', { name: /Iniciar sesión/ }).click();

    await expect(email).toHaveJSProperty('validity.valid', false);
    await expect(page.getByText('Introduce un correo válido.')).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });

  test('inicia sesión con la cuenta E2E y dirige al flujo de espacio', async ({ page }) => {
    test.skip(!requireE2ECredentials(), 'Requiere E2E_EMAIL y E2E_PASSWORD.');
    await loginAsE2EUser(page);
    await expect(page).toHaveURL(/\/(onboarding|workspace)(?:\/)?$/);
    expect(e2eEmail).toBeTruthy();
    expect(e2ePassword).toBeTruthy();
  });
});

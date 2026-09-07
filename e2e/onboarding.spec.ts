import { test, expect } from '@playwright/test';
import { enterWorkspaceFromOnboarding, loginAsE2EUser, requireE2ECredentials } from './fixtures';

test.describe('Onboarding', () => {
  test('carga el espacio y permite entrar al workspace', async ({ page }) => {
    test.skip(!requireE2ECredentials(), 'Requiere una cuenta Firebase E2E con empresa creada.');
    await loginAsE2EUser(page);
    await enterWorkspaceFromOnboarding(page);

    await expect(page).toHaveURL(/\/workspace(?:\/)?$/);
    await expect(page.getByText('Tu espacio de trabajo')).toBeVisible();
  });
});

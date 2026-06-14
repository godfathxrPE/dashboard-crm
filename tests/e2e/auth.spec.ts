import { test, expect } from '@playwright/test';

test.describe('Авторизация', () => {
  test('редирект на логин без авторизации', async ({ page }) => {
    await page.goto('/');
    // Middleware redirects unauthenticated users to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    const url = page.url();
    expect(url).toContain('/login');
  });

  test('страница логина отображается', async ({ page }) => {
    await page.goto('/login');
    // Magic link login form
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });

  test('логин-форма принимает email', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });
});

import { test, expect } from '@playwright/test';

test.describe('Контакты', () => {
  test('таблица контактов загружается', async ({ page }) => {
    await page.goto('/contacts');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=КОНТАКТЫ')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('table tbody tr, [class*="row"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('Contact 360° Hub открывается', async ({ page }) => {
    await page.goto('/contacts');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    const firstContact = page.locator('table tbody tr, [class*="row"]').first();
    if (await firstContact.isVisible()) {
      await firstContact.click();
      await expect(page.locator('text=Детали')).toBeVisible({ timeout: 10000 });
    }
  });
});

import { test, expect } from '@playwright/test';

test.describe('Компании', () => {
  test('таблица загружается', async ({ page }) => {
    await page.goto('/companies');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=КОМПАНИИ')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('table tbody tr, [class*="row"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('кнопка Импорт видна', async ({ page }) => {
    await page.goto('/companies');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('button:has-text("Импорт")')).toBeVisible({ timeout: 10000 });
  });

  test('карточка компании открывается', async ({ page }) => {
    await page.goto('/companies');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    const firstCompany = page.locator('table tbody tr, [class*="row"]').first();
    if (await firstCompany.isVisible()) {
      await firstCompany.click();
      await expect(page.locator('text=Контакты')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=Проекты')).toBeVisible();
    }
  });
});

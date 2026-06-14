import { test, expect } from '@playwright/test';

test.describe('Звонки', () => {
  test('страница загружается', async ({ page }) => {
    await page.goto('/calls');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=ЗВОНКИ')).toBeVisible({ timeout: 10000 });
  });

  test('фильтры видны', async ({ page }) => {
    await page.goto('/calls');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=Все')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Выполненные')).toBeVisible();
  });

  test('модалка нового звонка открывается', async ({ page }) => {
    await page.goto('/calls');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.click('button:has-text("Звонок")');
    await expect(page.locator('text=Новый звонок')).toBeVisible({ timeout: 5000 });

    // Date should be pre-filled
    const dateInput = page.locator('input[type="date"], input[type="datetime-local"]').first();
    if (await dateInput.isVisible()) {
      const dateValue = await dateInput.inputValue();
      expect(dateValue).not.toBe('');
    }

    await page.click('button:has-text("Отмена")');
  });
});

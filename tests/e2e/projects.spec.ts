import { test, expect } from '@playwright/test';

test.describe('Проекты', () => {
  test('канбан доска загружается', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=ПРОЕКТЫ')).toBeVisible({ timeout: 10000 });
  });

  test('колонки пайплайна видны', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    // Pipeline stages should be rendered as columns
    const columns = page.locator('[class*="column"], [class*="lane"], [data-column]');
    const count = await columns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('карточка проекта открывается', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    // Click first project card
    const card = page.locator('[class*="card"], [class*="deal-card"]').first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page).toHaveURL(/\/projects\//, { timeout: 5000 });
    }
  });
});

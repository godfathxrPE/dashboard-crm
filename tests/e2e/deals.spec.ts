import { test, expect } from '@playwright/test';

test.describe('Сделки (/deals)', () => {
  test('воронка сделок загружается', async ({ page }) => {
    await page.goto('/deals');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('h1:has-text("Воронка сделок")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=СДЕЛКИ')).toBeVisible();
  });

  test('таблица сделок доступна через ?view=table', async ({ page }) => {
    await page.goto('/deals?view=table');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('h1:has-text("Сделки")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Сделка")')).toBeVisible();
  });

  test('колонки воронки видны', async ({ page }) => {
    await page.goto('/deals');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    const columns = page.locator('[data-column], [class*="column"], [class*="lane"]');
    const count = await columns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('блок «Выиграно» раскрывается (если есть won-сделки)', async ({ page }) => {
    await page.goto('/deals');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    const wonBlock = page.locator('button:has-text("Выиграно:")');
    if (!(await wonBlock.isVisible())) return;

    await wonBlock.click();
    const spawnBtn = page.locator('button:has-text("Проект внедрения")').first();
    if (await spawnBtn.isVisible()) {
      await spawnBtn.click();
      await expect(page).toHaveURL(/\/deals\//, { timeout: 5000 });
    }
  });

  test('карточка сделки открывается на /deals/[id]', async ({ page }) => {
    await page.goto('/deals');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    const card = page.locator('[class*="card"], [class*="deal-card"], .group.rounded-lg.border').first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page).toHaveURL(/\/deals\//, { timeout: 5000 });
    }
  });
});
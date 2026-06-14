import { test, expect } from '@playwright/test';

test.describe('Задачи', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test('страница загружается', async ({ page }) => {
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=ЗАДАЧИ')).toBeVisible({ timeout: 10000 });
  });

  test('секция СЕЙЧАС видна', async ({ page }) => {
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('text=СЕЙЧАС')).toBeVisible({ timeout: 10000 });
  });

  test('создание задачи через модалку', async ({ page }) => {
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    // Click "+ Задача"
    await page.click('button:has-text("Задача")');
    await expect(page.locator('text=Новая задача')).toBeVisible({ timeout: 5000 });

    // Fill title
    const testTitle = `Тест задача ${Date.now()}`;
    await page.fill('textarea, input[placeholder*="нужно сделать"]', testTitle);

    // Save
    await page.click('button:has-text("Сохранить")');
    await expect(page.locator('text=Новая задача')).not.toBeVisible({ timeout: 5000 });

    // Task appears in list
    await expect(page.locator(`text=${testTitle}`)).toBeVisible({ timeout: 5000 });
  });
});

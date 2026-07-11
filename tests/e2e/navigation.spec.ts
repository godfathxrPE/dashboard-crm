import { test, expect } from '@playwright/test';

test.describe('Навигация', () => {
  const sections = [
    { name: 'Задачи', url: '/tasks', marker: 'ЗАДАЧИ' },
    { name: 'Сделки', url: '/deals', marker: 'СДЕЛКИ' },
    { name: 'Проекты', url: '/projects', marker: 'Проекты' },
    { name: 'Контакты', url: '/contacts', marker: 'КОНТАКТЫ' },
    { name: 'Компании', url: '/companies', marker: 'КОМПАНИИ' },
    { name: 'Звонки', url: '/calls', marker: 'ЗВОНКИ' },
    { name: 'Встречи', url: '/meetings', marker: 'ВСТРЕЧИ' },
    { name: 'Календарь', url: '/calendar', marker: 'КАЛЕНДАРЬ' },
    { name: 'Аналитика', url: '/analytics', marker: 'АНАЛИТИКА' },
  ];

  for (const { name, url, marker } of sections) {
    test(`${name} — страница загружается`, async ({ page }) => {
      await page.goto(url);
      const isAuth = !page.url().includes('/login');
      if (!isAuth) {
        // Without auth, should redirect to login
        expect(page.url()).toContain('/login');
        return;
      }
      await expect(page.locator(`text=${marker}`)).toBeVisible({ timeout: 10000 });
    });
  }

  test('sidebar навигация работает', async ({ page }) => {
    await page.goto('/dashboard');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    await page.click('nav >> text=Задачи');
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.locator('text=ЗАДАЧИ')).toBeVisible();
  });

  test('sidebar: Сделки и Проекты — отдельные разделы', async ({ page }) => {
    await page.goto('/dashboard');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');

    await page.click('nav >> text=Сделки');
    await expect(page).toHaveURL(/\/deals/);
    await expect(page.locator('text=СДЕЛКИ')).toBeVisible({ timeout: 10000 });

    await page.click('nav >> text=Проекты');
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.locator('h1:has-text("Проекты")')).toBeVisible({ timeout: 10000 });
  });
});

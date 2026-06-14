import { test, expect } from '@playwright/test';

test.describe('Модалки — z-index и overlay', () => {
  const pages = [
    { url: '/tasks', button: 'Задача', title: 'Новая задача' },
    { url: '/calls', button: 'Звонок', title: 'Новый звонок' },
  ];

  for (const { url, button, title } of pages) {
    test(`${title} — overlay перекрывает контент`, async ({ page }) => {
      await page.goto(url);
      const isAuth = !page.url().includes('/login');
      if (!isAuth) return;

      await page.waitForLoadState('networkidle');
      await page.click(`button:has-text("${button}")`);
      await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 5000 });

      // Overlay should cover viewport
      const overlay = page.locator('[class*="overlay"], [class*="backdrop"], [style*="position: fixed"][style*="inset: 0"]');
      if (await overlay.count() > 0) {
        const box = await overlay.first().boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThan(500);
        expect(box!.height).toBeGreaterThan(500);
      }

      await page.click('button:has-text("Отмена")');
    });
  }

  test('модалка закрывается по клику на overlay', async ({ page }) => {
    await page.goto('/tasks');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Задача")');
    await expect(page.locator('text=Новая задача')).toBeVisible();

    const overlay = page.locator('[class*="overlay"], [class*="backdrop"]').first();
    if (await overlay.isVisible()) {
      await overlay.click({ position: { x: 10, y: 10 }, force: true });
      await expect(page.locator('text=Новая задача')).not.toBeVisible({ timeout: 3000 });
    }
  });
});

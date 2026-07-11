import { test, expect } from '@playwright/test';

test.describe('Проекты внедрения (/projects)', () => {
  test('раздел «Проекты» загружается с табами', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await expect(page.locator('h1:has-text("Проекты")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Внедрение")')).toBeVisible();
    await expect(page.locator('button:has-text("Внутренние")')).toBeVisible();
  });

  test('вкладка «Внедрение» — 4 колонки состояний или empty state', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');

    const emptyState = page.locator('text=Пока нет проектов внедрения');
    const phaseColumn = page.locator('text=ИНИЦИИРОВАН');

    const hasEmpty = await emptyState.isVisible();
    const hasKanban = await phaseColumn.isVisible();

    expect(hasEmpty || hasKanban).toBe(true);

    if (hasKanban) {
      await expect(page.locator('text=ПЛАНИРУЕТСЯ')).toBeVisible();
      await expect(page.locator('text=ИСПОЛНЯЕТСЯ')).toBeVisible();
      await expect(page.locator('text=ЗАВЕРШЁН')).toBeVisible();
    }
  });

  test('вкладка «Внутренние» — список или empty state', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.click('button:has-text("Внутренние")');
    await page.waitForLoadState('networkidle');

    const empty = page.locator('text=Нет внутренних проектов');
    const createBtn = page.locator('button:has-text("Проект")');
    const table = page.locator('table, [role="table"]');

    const hasEmpty = await empty.isVisible();
    const hasTable = await table.isVisible();
    expect(hasEmpty || hasTable).toBe(true);
    await expect(createBtn).toBeVisible();
  });

  test('карточка delivery открывается на /projects/[id]', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');

    const emptyState = page.locator('text=Пока нет проектов внедрения');
    if (await emptyState.isVisible()) return;

    const card = page.locator('.group.rounded-lg.border').first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page).toHaveURL(/\/projects\//, { timeout: 5000 });
    }
  });

  test('empty state подсказывает spawn из won-сделки', async ({ page }) => {
    await page.goto('/projects');
    const isAuth = !page.url().includes('/login');
    if (!isAuth) return;

    await page.waitForLoadState('networkidle');
    const emptyState = page.locator('text=Пока нет проектов внедрения');
    if (!(await emptyState.isVisible())) return;

    await expect(
      page.locator('text=Создать проект внедрения'),
    ).toBeVisible();
  });
});
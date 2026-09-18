import { test, expect } from '@playwright/test';
import { loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('21. Empty State — No Holdings (TC-EMPTY)', () => {
  const testUser = 'empty-tester@terminus.local';

  test('TC-EMPTY-01 — Empty Portfolio Landing State Displays $0.00 KPIs & Functional Controls', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await page.goto('/');

    // Empty holdings row message
    const emptyRow = page.locator('[data-testid="empty-row"]');
    await expect(emptyRow).toBeVisible({ timeout: 10000 });
    await expect(emptyRow).toContainText('No positions');

    // Controls remain visible & interactive
    const toggleBtn = page.locator('[data-testid="toggle-add-button"]');
    await expect(toggleBtn).toBeVisible();
    await expect(page.locator('[data-testid="seed-demo-button"]')).toBeVisible();

    // Opening add form works
    await toggleBtn.click();
    await expect(page.locator('[data-testid="add-symbol-input"]')).toBeVisible();

    // Summary KPIs display zero
    await expect(page.locator('[data-testid="summary-total-value"]')).toContainText('$0.00');
    await expect(page.locator('[data-testid="summary-total-p/l"]')).toContainText('$0.00');
    await expect(page.locator('[data-testid="summary-day-p/l"]')).toContainText('$0.00');
  });

  test('TC-EMPTY-02 — All Tabs Graceful with Empty Portfolio without Crashing', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // 1. Stock News
    await page.locator('[data-testid="tab-stock-news-button"]').click();
    await expect(page.locator('[data-testid="stock-news-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="empty-news"]')).toBeVisible();

    // 2. Sentiment Tab
    await page.locator('[data-testid="tab-sentiment-button"]').click();
    await expect(page.locator('[data-testid="sentiment-tab"]')).toBeVisible();
    await expect(page.locator('text=Add positions in Portfolio tab to see per-symbol sentiment.')).toBeVisible();

    // 3. Insider Flow Tab
    await page.locator('[data-testid="tab-insider-button"]').click();
    await expect(page.locator('[data-testid="insider-flow-tab"]')).toBeVisible();
    await page.locator('[data-testid="insider-tab-held"]').click();
    await expect(page.locator('text=No recent congress trades in your portfolio symbols.')).toBeVisible();

    // 4. Alpha Tab
    await page.locator('[data-testid="tab-alpha-button"]').click();
    await expect(page.locator('[data-testid="alpha-tab"]')).toBeVisible();
    await expect(page.locator('text=No holdings. Add positions to see signals.')).toBeVisible();

    // App shell remains intact throughout
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('8. Portfolio — Demo Seed (TC-DEMO)', () => {
  const testUser = 'demo-tester@terminus.local';

  test('TC-DEMO-01 — Seed Demo Portfolio Loads 12 Preset Positions', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);
    await page.reload();

    // Click "Load Demo" button
    const seedBtn = page.locator('[data-testid="seed-demo-button"]');
    await expect(seedBtn).toBeVisible({ timeout: 15000 });
    await seedBtn.click();

    // Wait for toast or table rows
    await expect(page.locator('text=Loaded demo portfolio')).toBeVisible({ timeout: 10000 });

    // Verify key demo holdings appear in the table
    const table = page.locator('[data-testid="holdings-table"]');
    await expect(table).toBeVisible();
    await expect(page.locator('[data-testid="holding-row-AAPL"]')).toBeVisible();
    await expect(page.locator('[data-testid="holding-row-NVDA"]')).toBeVisible();
    await expect(page.locator('[data-testid="holding-row-BTC-USD"]')).toBeVisible();
    await expect(page.locator('[data-testid="holding-row-VOO"]')).toBeVisible();

    // Verify backend response directly
    const res = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    expect(data.holdings.length).toBe(12);
  });
});

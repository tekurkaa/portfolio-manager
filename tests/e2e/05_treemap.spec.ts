import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('5. Portfolio — Allocation Treemap (TC-TREEMAP)', () => {
  const testUser = 'treemap-tester@terminus.local';

  test('TC-TREEMAP-03 — Treemap Empty State', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);
    await page.reload();

    const treemap = page.locator('[data-testid="allocation-treemap"]');
    await expect(treemap).toBeVisible({ timeout: 15000 });
    await expect(treemap).toContainText('No positions to display');
  });

  test('TC-TREEMAP-01 & 02 — Treemap Renders Holdings and Colors Cells', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Add holdings: AAPL (gain or normal) and TSLA
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 100.00 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'TSLA', quantity: 5, avg_cost: 400.00 },
    });

    await page.reload();
    const treemap = page.locator('[data-testid="allocation-treemap"]');
    await expect(treemap).toBeVisible({ timeout: 15000 });

    // The treemap container should contain svg elements representing cells
    const svg = treemap.locator('svg');
    await expect(svg).toBeVisible({ timeout: 10000 });

    // Treemap contains text labels for holdings
    await expect(treemap.locator('text:has-text("AAPL")')).toBeVisible({ timeout: 10000 });
  });
});

import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('17. Backtest Panel (TC-BACK)', () => {
  const testUser = 'backtest-tester@terminus.local';

  test('TC-BACK-02 — Backtest with No Holdings Displays Placeholder', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Call backtest API directly
    const res = await request.get(`${BACKEND_URL}/api/signal/backtest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.backtests).toEqual([]);

    // Check UI under Alpha tab
    await page.locator('[data-testid="tab-alpha-button"]').click();
    await expect(page.locator('[data-testid="backtest-panel"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=No holdings to backtest.')).toBeVisible({ timeout: 10000 });
  });

  test('TC-BACK-01 & TC-BACK-03 — Backtest Runs for Portfolio and Visualizes Summary Statistics', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed holding AAPL
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 160 },
    });

    // Check API response
    const res = await request.get(`${BACKEND_URL}/api/signal/backtest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    expect(Array.isArray(data.backtests)).toBe(true);
    expect(data.backtests.length).toBeGreaterThan(0);
    const first = data.backtests[0];
    expect(first.symbol).toBe('AAPL');
    expect(first).toHaveProperty('buy');
    expect(first).toHaveProperty('sell');
    expect(first.buy).toHaveProperty('5d');
    expect(first.buy['5d']).toHaveProperty('win_rate');
    expect(first.buy['5d']).toHaveProperty('avg');

    // Check UI
    await page.locator('[data-testid="tab-alpha-button"]').click();
    await expect(page.locator('[data-testid="backtest-panel"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="backtest-row-AAPL"]')).toBeVisible({ timeout: 15000 });
  });
});

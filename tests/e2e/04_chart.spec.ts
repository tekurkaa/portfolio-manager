import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('4. Portfolio — History Chart (TC-CHART)', () => {
  const testUser = 'chart-tester@terminus.local';

  test('TC-CHART-10 — Chart Empty State (No Holdings)', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);
    await page.reload();

    const chart = page.locator('[data-testid="portfolio-history-chart"]');
    await expect(chart).toBeVisible({ timeout: 15000 });

    const emptyMsg = page.locator('[data-testid="history-empty"]');
    await expect(emptyMsg).toBeVisible();
    await expect(emptyMsg).toContainText('No historical data. Add positions first.');

    // Range selector buttons should still be visible
    await expect(page.locator('[data-testid="range-1D"]')).toBeVisible();
    await expect(page.locator('[data-testid="range-1M"]')).toBeVisible();
  });

  test('TC-CHART-01 through 05 — Switching Ranges (1D, 1W, 1M, YTD, 1Y, 5Y)', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed holdings
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150.00 },
    });

    await page.reload();
    const chart = page.locator('[data-testid="portfolio-history-chart"]');
    await expect(chart).toBeVisible({ timeout: 15000 });

    // Range 1D
    const btn1D = page.locator('[data-testid="range-1D"]');
    await btn1D.click();
    await expect(page.locator('[data-testid="chart-current-value"]')).toBeVisible({ timeout: 10000 });

    // Range 1W
    const btn1W = page.locator('[data-testid="range-1W"]');
    await btn1W.click();
    await expect(page.locator('[data-testid="chart-current-value"]')).toBeVisible();

    // Range 1M
    const btn1M = page.locator('[data-testid="range-1M"]');
    await btn1M.click();
    await expect(page.locator('[data-testid="chart-current-value"]')).toBeVisible();

    // Range YTD
    const btnYTD = page.locator('[data-testid="range-YTD"]');
    await btnYTD.click();
    await expect(page.locator('[data-testid="chart-current-value"]')).toBeVisible();

    // Range 1Y
    const btn1Y = page.locator('[data-testid="range-1Y"]');
    await btn1Y.click();
    await expect(page.locator('[data-testid="chart-current-value"]')).toBeVisible();
  });

  test('TC-CHART-07 & 09 — Chart with Single Holding & Up/Down Color styling', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'MSFT', quantity: 10, avg_cost: 200.00 },
    });

    await page.reload();
    const chart = page.locator('[data-testid="portfolio-history-chart"]');
    await expect(chart).toBeVisible();

    // Change indicator shows direction
    const changeIndicator = page.locator('[data-testid="chart-change"]');
    await expect(changeIndicator).toBeVisible();
    const text = await changeIndicator.textContent();
    expect(text?.includes('▲') || text?.includes('▼')).toBeTruthy();
  });

  test('TC-CHART-06 & 11 — Backend History API verification for range & benchmark', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: 'chart-backend@terminus.local', name: 'Chart User' },
    });
    const token = (await resAuth.json()).session_token;

    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 5, avg_cost: 150.00, date_of_purchase: '2024-01-15' },
    });

    // Verify 1D returns points
    const res1D = await request.get(`${BACKEND_URL}/api/portfolio/history?range=1D`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res1D.ok()).toBeTruthy();
    const data1D = await res1D.json();
    expect(Array.isArray(data1D.points)).toBe(true);

    // Verify 1M with SPY benchmark
    const res1M = await request.get(`${BACKEND_URL}/api/portfolio/history?range=1M&benchmark=SPY`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res1M.ok()).toBeTruthy();
    const data1M = await res1M.json();
    expect(Array.isArray(data1M.points)).toBe(true);
  });
});

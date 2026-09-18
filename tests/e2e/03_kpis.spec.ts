import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldings, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('3. Portfolio — Summary KPIs (TC-KPI)', () => {
  const testUser = 'kpi-tester@terminus.local';

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, testUser);
    await resetHoldings(page);
  });

  test('TC-KPI-01 & 02 & 03 — Calculations for Value, Cost Basis, P&L, Day Change', async ({ page, request }) => {
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Insert 2 holdings directly with known avg_cost
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 180.00 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'MSFT', quantity: 5, avg_cost: 350.00 },
    });

    const res = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const summary = data.summary;

    // Expected total_cost = (10 * 180) + (5 * 350) = 1800 + 1750 = 3550
    expect(summary.total_cost).toBe(3550);
    expect(summary.total_value).toBeGreaterThan(0);
    expect(typeof summary.total_pl).toBe('number');
    expect(typeof summary.total_pl_pct).toBe('number');
    expect(typeof summary.day_change).toBe('number');

    // Verify UI reflects KPI cards
    await page.reload();
    await expect(page.locator('[data-testid="summary-total-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-total-p/l"]')).toBeVisible();
    await expect(page.locator('[data-testid="summary-day-p/l"]')).toBeVisible();
  });

  test('TC-KPI-04 — Fallback to Avg Cost When No Live Quote', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: 'fallback-quote@terminus.local', name: 'Fallback User' },
    });
    const token = (await resAuth.json()).session_token;

    // Add an obscure fake symbol
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'ZZZZNOTREAL99', quantity: 10, avg_cost: 25.50 },
    });

    const res = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const holding = data.holdings.find((h: any) => h.symbol === 'ZZZZNOTREAL99');
    expect(holding).toBeTruthy();
    expect(holding.price).toBe(25.50);
    expect(holding.pl).toBe(0);
    expect(holding.pl_pct).toBe(0);
    expect(holding.quote_source).toBe('cost');
    expect(holding.live).toBe(false);
  });

  test('TC-KPI-05 — Cost Basis Zero Guard (Division by Zero)', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: 'zero-cost@terminus.local', name: 'Zero Cost User' },
    });
    const token = (await resAuth.json()).session_token;

    // Add holding with 0 avg cost
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'GIFT', quantity: 10, avg_cost: 0 },
    });

    const res = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const holding = data.holdings.find((h: any) => h.symbol === 'GIFT');
    expect(holding.pl_pct).toBe(0);
    expect(Number.isNaN(data.summary.total_pl_pct)).toBe(false);
    expect(Number.isFinite(data.summary.total_pl_pct)).toBe(true);
  });

  test('TC-KPI-06 — Asset Type Counts', async ({ page, request }) => {
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    await resetHoldingsViaApi(request, token);

    // 1 Stock, 1 ETF, 1 Crypto
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 5, avg_cost: 150 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'VOO', quantity: 2, avg_cost: 400 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'BTC-USD', quantity: 0.1, avg_cost: 30000 },
    });

    const res = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const s = data.summary;

    expect(s.count).toBe(3);
    expect(s.stock_count).toBe(1);
    expect(s.etf_count).toBe(1);
    expect(s.crypto_count).toBe(1);
  });
});

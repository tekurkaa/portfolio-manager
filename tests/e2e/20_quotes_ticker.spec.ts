import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('20. Market Quotes & Ticker Bar (TC-QUOTE)', () => {
  test('TC-QUOTE-01 & TC-QUOTE-04 — Market Indices Load & Render in Top Ticker Bar', async ({ page, request }) => {
    // Verify API
    const res = await request.get(`${BACKEND_URL}/api/market/indices`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('indices');
    expect(Array.isArray(data.indices)).toBe(true);
    expect(data.indices.length).toBeGreaterThan(0);

    const first = data.indices[0];
    expect(first).toHaveProperty('symbol');
    expect(first).toHaveProperty('price');
    expect(first).toHaveProperty('change');
    expect(first).toHaveProperty('change_percent');

    // Verify UI
    await loginViaUI(page, 'ticker-tester@terminus.local');
    const tickerBar = page.locator('[data-testid="ticker-bar"]');
    await expect(tickerBar).toBeVisible({ timeout: 10000 });
    await expect(tickerBar).toContainText('S&P 500');
  });

  test('TC-QUOTE-02 — Individual Quote Lookup Returns Live/Cached Price Data', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/market/quote/AAPL`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.symbol).toBe('AAPL');
    expect(data.price).toBeGreaterThan(0);
    expect(data).toHaveProperty('previous_close');
    expect(data).toHaveProperty('change_percent');
  });

  test('TC-QUOTE-03 — Quote for Invalid Symbol Returns 404 Not Found', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/market/quote/NOTREAL`);
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.detail).toContain('NOTREAL');
  });

  test('TC-QUOTE-05 — US Market Session Status & Countdown Pill Render in Top Ticker Bar', async ({ page, request }) => {
    // 1. Verify backend endpoint
    const res = await request.get(`${BACKEND_URL}/api/market/status`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('state');
    expect(['OPEN', 'PRE_MARKET', 'AFTER_HOURS', 'CLOSED']).toContain(data.state);
    expect(data).toHaveProperty('seconds_remaining');

    // 2. Verify UI badge
    await loginViaUI(page, 'market-status-tester@terminus.local');
    const statusBadge = page.locator('[data-testid="market-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });
  });

  test('TC-QUOTE-06 — Stock Detail Modal Opens on Ticker Click with Live Quotes, Chart, and Stats', async ({ page, request }) => {
    // 1. Verify backend details & history endpoints
    const detailsRes = await request.get(`${BACKEND_URL}/api/market/details/AAPL`);
    expect(detailsRes.ok()).toBeTruthy();
    const details = await detailsRes.json();
    expect(details.symbol).toBe('AAPL');
    expect(details.price).toBeGreaterThan(0);

    const historyRes = await request.get(`${BACKEND_URL}/api/market/history/AAPL?range=1D`);
    expect(historyRes.ok()).toBeTruthy();
    const history = await historyRes.json();
    expect(history.points.length).toBeGreaterThan(0);

    // 2. Verify UI interaction: click ticker in TopTickerBar
    await loginViaUI(page, 'stock-modal-tester@terminus.local');
    const tickerItem = page.locator('[data-testid^="ticker-item-"]').first();
    await expect(tickerItem).toBeVisible({ timeout: 10000 });
    await tickerItem.click({ force: true });

    // 3. Modal opens
    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="stock-modal-price"]')).toBeVisible();

    // 4. Test timeframe range buttons
    const range1W = page.locator('[data-testid="chart-range-1W"]');
    if (await range1W.isVisible()) {
      await range1W.click();
    }

    // 5. Close modal
    const closeBtn = page.locator('[data-testid="close-stock-modal-btn"]');
    await closeBtn.click();
    await expect(modal).toBeHidden({ timeout: 5000 });
  });
});


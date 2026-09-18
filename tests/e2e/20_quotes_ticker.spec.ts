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
});

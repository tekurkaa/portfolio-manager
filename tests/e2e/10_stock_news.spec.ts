import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('10. Stock News Tab (TC-NEWS)', () => {
  const testUser = 'news-tester@terminus.local';

  test('TC-NEWS-03 — News with No Holdings shows Empty State', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Switch to Stock News tab
    await page.locator('[data-testid="tab-stock-news-button"]').click();
    await expect(page.locator('[data-testid="stock-news-tab"]')).toBeVisible({ timeout: 10000 });

    const emptyMsg = page.locator('[data-testid="empty-news"]');
    await expect(emptyMsg).toBeVisible({ timeout: 15000 });
    await expect(emptyMsg).toContainText('Add positions in Portfolio tab to get filtered news.');
  });

  test('TC-NEWS-01 & 02 & 04 — News Loads for Held Symbols, Crypto Stripped, Deduplication', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed AAPL and BTC-USD
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'BTC-USD', quantity: 0.5, avg_cost: 30000 },
    });

    // Check backend endpoint directly
    const res = await request.get(`${BACKEND_URL}/api/news/stocks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.articles).toBeTruthy();
    expect(Array.isArray(data.articles)).toBe(true);

    // TC-NEWS-02: Crypto stripped of -USD
    expect(data.symbols).toContain('BTC');
    expect(data.symbols).toContain('AAPL');

    // TC-NEWS-04: URLs deduplicated
    const urls = data.articles.map((a: any) => a.url);
    const uniqueUrls = new Set(urls);
    expect(urls.length).toBe(uniqueUrls.size);

    // Verify UI displays articles
    await page.locator('[data-testid="tab-stock-news-button"]').click();
    await expect(page.locator('[data-testid="stock-news-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="news-articles-list"]')).toBeVisible();
  });
});

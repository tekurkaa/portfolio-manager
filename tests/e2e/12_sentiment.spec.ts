import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('12. Sentiment Tab (TC-SENT)', () => {
  const testUser = 'sentiment-tester@terminus.local';

  test('TC-SENT-03 — Average Score with Empty Portfolio Defaults to 50 & Neutral', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Call portfolio sentiment endpoint directly
    const res = await request.get(`${BACKEND_URL}/api/sentiment/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.average_score).toBe(50);
    expect(data.per_symbol).toEqual([]);
    expect(data.fear_greed).toBeTruthy();

    // Verify UI reflects empty state
    await page.locator('[data-testid="tab-sentiment-button"]').click();
    await expect(page.locator('[data-testid="sentiment-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Add positions in Portfolio tab to see per-symbol sentiment.')).toBeVisible({ timeout: 10000 });
  });

  test('TC-SENT-01 & TC-SENT-02 — Portfolio Sentiment Loads with Score Bounds [0, 100]', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed a holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 15, avg_cost: 175 },
    });

    // Check portfolio sentiment API
    const res = await request.get(`${BACKEND_URL}/api/sentiment/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    expect(data.average_score).toBeGreaterThanOrEqual(0);
    expect(data.average_score).toBeLessThanOrEqual(100);

    expect(data.fear_greed).toBeTruthy();
    expect(data.fear_greed.score).toBeGreaterThanOrEqual(0);
    expect(data.fear_greed.score).toBeLessThanOrEqual(100);

    expect(Array.isArray(data.per_symbol)).toBe(true);
    for (const item of data.per_symbol) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(item.bull_pct).toBeGreaterThanOrEqual(0);
      expect(item.bull_pct).toBeLessThanOrEqual(100);
      expect(item.bear_pct).toBeGreaterThanOrEqual(0);
      expect(item.bear_pct).toBeLessThanOrEqual(100);
    }

    // Verify UI displays sentiment
    await page.locator('[data-testid="tab-sentiment-button"]').click();
    await expect(page.locator('[data-testid="sentiment-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="portfolio-sentiment-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="fear-greed-card"]')).toBeVisible();
  });

  test('TC-SENT-04 — Individual Symbol Sentiment', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/sentiment/AAPL`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    expect(data.symbol).toBe('AAPL');
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);
    expect(data).toHaveProperty('label');
    expect(data).toHaveProperty('bull_pct');
    expect(data).toHaveProperty('bear_pct');
  });
});

import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('16. Alpha Signal Tab (TC-ALPHA)', () => {
  const testUser = 'alpha-tester@terminus.local';

  test('TC-ALPHA-03 — Alpha with Empty Portfolio shows Empty State Prompt', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Call alpha API directly
    const res = await request.get(`${BACKEND_URL}/api/signal/alpha`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.signals).toEqual([]);

    // Check UI
    await page.locator('[data-testid="tab-alpha-button"]').click();
    await expect(page.locator('[data-testid="alpha-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=No holdings. Add positions to see signals.')).toBeVisible({ timeout: 10000 });
  });

  test('TC-ALPHA-01 & TC-ALPHA-02 — Alpha Signals Load with Score Consistency [0, 100]', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed holdings
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'NVDA', quantity: 10, avg_cost: 110 },
    });

    // Verify API response
    const res = await request.get(`${BACKEND_URL}/api/signal/alpha`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.signals)).toBe(true);
    expect(data.signals.length).toBeGreaterThan(0);

    for (const sig of data.signals) {
      expect(sig).toHaveProperty('symbol');
      expect(sig).toHaveProperty('composite');
      expect(sig).toHaveProperty('signal');
      expect(sig).toHaveProperty('momentum');
      expect(sig).toHaveProperty('sentiment');

      // Score consistency
      expect(sig.composite).toBeGreaterThanOrEqual(0);
      expect(sig.composite).toBeLessThanOrEqual(100);
      expect(['BUY', 'HOLD', 'SELL', 'STRONG BUY']).toContain(sig.signal);
    }

    // Verify UI display
    await page.locator('[data-testid="tab-alpha-button"]').click();
    await expect(page.locator('[data-testid="alpha-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="alpha-signals-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="signal-row-NVDA"]')).toBeVisible();
  });
});

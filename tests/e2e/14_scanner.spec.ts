import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('14. Scanner Tab — Breakout Scanner (TC-SCAN)', () => {
  const testUser = 'scanner-tester@terminus.local';

  test('TC-SCAN-01 — Breakout Candidates Load with Technical Metrics', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Check scanner endpoint directly
    const res = await request.get(`${BACKEND_URL}/api/scanner/breakouts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    expect(data).toHaveProperty('candidates');
    expect(Array.isArray(data.candidates)).toBe(true);
    expect(data.universe_size).toBeGreaterThan(0);

    if (data.candidates.length > 0) {
      const first = data.candidates[0];
      expect(first).toHaveProperty('symbol');
      expect(first).toHaveProperty('price');
      expect(first).toHaveProperty('composite');
      expect(first).toHaveProperty('momentum_5d');
      expect(first).toHaveProperty('vol_surge');
    }

    // Switch to Scanner tab in UI
    await page.locator('[data-testid="tab-scanner-button"]').click();
    await expect(page.locator('[data-testid="scanner-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="scanner-table"]')).toBeVisible();
  });

  test('TC-SCAN-02 — Watchlist Symbols Included in Scan Universe', async ({ request }) => {
    // Dev login for API
    const authRes = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: 'scanner-wl-user@terminus.local', name: 'WL Scanner User' },
    });
    const { session_token } = await authRes.json();

    // Add unique stock to watchlist that is not in the standard UNIVERSE list (e.g. BABA)
    await request.post(`${BACKEND_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { symbol: 'BABA' },
    });

    const scanRes = await request.get(`${BACKEND_URL}/api/scanner/breakouts`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(scanRes.ok()).toBeTruthy();
    const scanData = await scanRes.json();

    // Universe size should be at least standard universe (63) + 1
    expect(scanData.universe_size).toBeGreaterThanOrEqual(64);
  });

  test('TC-SCAN-03 — Scanner with No Breakouts Found Displays Empty State', async ({ page }) => {
    await loginViaUI(page, testUser);

    // Mock empty candidates response
    await page.route('**/api/scanner/breakouts', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ candidates: [], universe_size: 60, scanned: 60 }),
      });
    });

    await page.locator('[data-testid="tab-scanner-button"]').click();
    await expect(page.locator('[data-testid="scanner-tab"]')).toBeVisible({ timeout: 10000 });

    // Verify empty state text
    await expect(page.locator('text=No candidates. Try again during market hours.')).toBeVisible({ timeout: 10000 });
  });
});

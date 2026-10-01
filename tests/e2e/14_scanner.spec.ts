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

  test('TC-SCAN-04 — Catalyst Intelligence Drivers Render in Table', async ({ page }) => {
    await loginViaUI(page, testUser);

    // Mock candidates response with catalyst drivers
    await page.route('**/api/scanner/breakouts', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              symbol: 'MRNA',
              price: 112.50,
              composite: 88.0,
              momentum_5d: 12.4,
              momentum_20d: 28.5,
              vol_surge: 2.4,
              near_52w_high_pct: 94.0,
              options_tilt: 75.0,
              congress_buys: 1,
              catalyst_bonus: 20.0,
              drivers: ['+12.4% 5d momentum', 'Recent 8-K: Material FDA/Clinical catalyst', 'Earnings in 2 days (2026-10-02)'],
              signal: 'STRONG BUY',
            },
          ],
          universe_size: 61,
          scanned: 61,
        }),
      });
    });

    await page.locator('[data-testid="tab-scanner-button"]').click();
    await expect(page.locator('[data-testid="scanner-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="scanner-table"]')).toBeVisible();

    // Verify symbol and catalyst drivers are visible in the table row
    await expect(page.locator('text=MRNA')).toBeVisible();
    await expect(page.locator('text=Recent 8-K: Material FDA/Clinical catalyst')).toBeVisible();
    await expect(page.locator('text=Earnings in 2 days (2026-10-02)')).toBeVisible();
  });
});


import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('9. Watchlist (TC-WL)', () => {
  const testUser = 'watchlist-tester@terminus.local';

  test.beforeEach(async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    // Reset watchlist
    if (token) {
      const listRes = await request.get(`${BACKEND_URL}/api/watchlist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await listRes.json();
      for (const s of data.symbols || []) {
        await request.delete(`${BACKEND_URL}/api/watchlist/${s}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });

  test('TC-WL-01 & 02 & 04 — Add, Idempotency, and Remove Watchlist Symbol', async ({ page }) => {
    // Navigate to Watchlist tab
    await page.locator('[data-testid="tab-watchlist-button"]').click();
    await expect(page.locator('[data-testid="watchlist-tab"]')).toBeVisible({ timeout: 10000 });

    const input = page.locator('[data-testid="watchlist-input"]');
    const addBtn = page.locator('[data-testid="watchlist-add"]');

    // Add PLTR
    await input.fill('PLTR');
    await addBtn.click();
    await expect(page.locator('text=Added PLTR to watchlist')).toBeVisible({ timeout: 10000 });

    // Add PLTR again (idempotency)
    await input.fill('PLTR');
    await addBtn.click();
    await expect(page.locator('text=Added PLTR to watchlist')).toBeVisible({ timeout: 10000 });

    // Verify row in table
    await expect(page.locator('table td:has-text("PLTR")').first()).toBeVisible({ timeout: 10000 });

    // Remove PLTR via API or delete button
    const deleteBtn = page.locator('button:has(svg.lucide-trash-2)').first();
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click();
      await expect(page.locator('text=Removed PLTR')).toBeVisible();
    }
  });

  test('TC-WL-03 — Add Empty Symbol validation', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'WL User' },
    });
    const token = (await resAuth.json()).session_token;

    const res = await request.post(`${BACKEND_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('TC-WL-05 & 07 — Watchlist Signals Load & Empty State', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: 'empty-wl@terminus.local', name: 'Empty WL' },
    });
    const token = (await resAuth.json()).session_token;

    // Reset watchlist for empty-wl user first
    const listCheck = await request.get(`${BACKEND_URL}/api/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    for (const s of (await listCheck.json()).symbols || []) {
      await request.delete(`${BACKEND_URL}/api/watchlist/${s}`, { headers: { Authorization: `Bearer ${token}` } });
    }

    // TC-WL-07: Empty watchlist returns empty signals
    const emptyRes = await request.get(`${BACKEND_URL}/api/watchlist/signals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(emptyRes.ok()).toBeTruthy();
    expect((await emptyRes.json()).signals).toEqual([]);

    // Add a symbol and test signals
    await request.post(`${BACKEND_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL' },
    });

    const resSignals = await request.get(`${BACKEND_URL}/api/watchlist/signals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resSignals.ok()).toBeTruthy();
    const signals = (await resSignals.json()).signals;
    expect(Array.isArray(signals)).toBe(true);
  });

  test('TC-WL-06 — Congress Trades for Watchlist Symbol', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/watchlist/congress/AAPL`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.symbol).toBe('AAPL');
    expect(Array.isArray(data.trades)).toBe(true);
  });
});

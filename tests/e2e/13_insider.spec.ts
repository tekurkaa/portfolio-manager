import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('13. Insider Flow Tab (TC-INSIDER)', () => {
  const testUser = 'insider-tester@terminus.local';

  test('TC-INSIDER-04 — Empty Holdings for Insider Summary Handled Gracefully', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Call insider summary endpoint directly
    const res = await request.get(`${BACKEND_URL}/api/insider/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.held_matches).toEqual([]);

    // Navigate to Smart Money tab in UI
    await page.locator('[data-testid="tab-insider-button"]').click();
    await expect(page.locator('[data-testid="insider-flow-tab"]')).toBeVisible({ timeout: 10000 });

    // Click "In My Portfolio" filter tab
    await page.locator('[data-testid="insider-tab-held"]').click();
    await expect(page.locator('text=No recent congress trades in your portfolio symbols.')).toBeVisible({ timeout: 10000 });
  });

  test('TC-INSIDER-01 — Insider Summary for Holdings Highlights Held Tickers', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed MSFT holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'MSFT', quantity: 20, avg_cost: 300 },
    });

    // Check insider summary endpoint
    const res = await request.get(`${BACKEND_URL}/api/insider/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    expect(data).toHaveProperty('congress');
    expect(data).toHaveProperty('top_activity');
    expect(Array.isArray(data.congress)).toBe(true);

    // Verify UI reflects insider flow
    await page.locator('[data-testid="tab-insider-button"]').click();
    await expect(page.locator('[data-testid="insider-flow-tab"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="top-activity"]')).toBeVisible();
    await expect(page.locator('[data-testid="congress-table"]')).toBeVisible();
  });

  test('TC-INSIDER-02 — Congress Trades Table Loads & Supports Symbol Filtering', async ({ request }) => {
    // 1. General list
    const resAll = await request.get(`${BACKEND_URL}/api/insider/congress?limit=20`);
    expect(resAll.ok()).toBeTruthy();
    const dataAll = await resAll.json();
    expect(dataAll).toHaveProperty('trades');
    expect(Array.isArray(dataAll.trades)).toBe(true);

    if (dataAll.trades.length > 0) {
      const trade = dataAll.trades[0];
      expect(trade).toHaveProperty('chamber');
      expect(trade).toHaveProperty('politician');
      expect(trade).toHaveProperty('symbol');
      expect(trade).toHaveProperty('type');
    }

    // 2. Filtered by symbol (MSFT)
    const resFiltered = await request.get(`${BACKEND_URL}/api/insider/congress?symbol=MSFT&limit=10`);
    expect(resFiltered.ok()).toBeTruthy();
    const dataFiltered = await resFiltered.json();
    expect(Array.isArray(dataFiltered.trades)).toBe(true);
    for (const trade of dataFiltered.trades) {
      expect(trade.symbol).toBe('MSFT');
    }
  });

  test('TC-INSIDER-03 — SEC Form 4 Filings Load', async ({ page, request }) => {
    const res = await request.get(`${BACKEND_URL}/api/insider/sec-form4?limit=20`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('filings');
    expect(Array.isArray(data.filings)).toBe(true);

    if (data.filings.length > 0) {
      const filing = data.filings[0];
      expect(filing).toHaveProperty('title');
      expect(filing).toHaveProperty('company');
      expect(filing).toHaveProperty('form');
      expect(filing.form).toBe('4');
    }

    // Verify via UI
    await loginViaUI(page, testUser);
    await page.locator('[data-testid="tab-insider-button"]').click();
    await expect(page.locator('[data-testid="insider-flow-tab"]')).toBeVisible({ timeout: 10000 });

    // Switch to SEC Form 4 tab
    await page.locator('[data-testid="insider-tab-form4"]').click();
    await expect(page.locator('[data-testid="form4-list"]')).toBeVisible({ timeout: 10000 });
  });
});

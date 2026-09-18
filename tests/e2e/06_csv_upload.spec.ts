import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('6. Portfolio — CSV Upload (Simple) (TC-CSV)', () => {
  const testUser = 'csv-tester@terminus.local';

  test.beforeEach(async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);
    await page.reload();
  });

  test('TC-CSV-01 & 05 — Valid CSV Upload with Currency Symbols', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'CSV Tester' },
    });
    const token = (await resAuth.json()).session_token;

    const csvContent = `symbol,quantity,average cost\nAAPL,10,$152.30\nMSFT,5,$305.10\n`;
    const res = await request.post(`${BACKEND_URL}/api/portfolio/upload-csv`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'portfolio.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8'),
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.count).toBe(2);
    expect(data.imported).toContain('AAPL');
    expect(data.imported).toContain('MSFT');

    // Verify avg_cost was parsed without '$'
    const holdingsRes = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const holdings = (await holdingsRes.json()).holdings;
    const aapl = holdings.find((h: any) => h.symbol === 'AAPL');
    expect(aapl.avg_cost).toBe(152.30);
  });

  test('TC-CSV-02 — CSV with Alternate Column Names (ticker, shares, price)', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'CSV Tester' },
    });
    const token = (await resAuth.json()).session_token;

    const csvContent = `ticker,shares,price\nNVDA,8,420.50\nAMZN,12,135.00\n`;
    const res = await request.post(`${BACKEND_URL}/api/portfolio/upload-csv`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'alternate.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8'),
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.count).toBe(2);
    expect(data.imported).toContain('NVDA');
    expect(data.imported).toContain('AMZN');
  });

  test('TC-CSV-03 & 04 — Invalid Rows and Zero/Negative Quantities Skipped', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'CSV Tester' },
    });
    const token = (await resAuth.json()).session_token;

    const csvContent = `symbol,quantity,avg_cost\nGOOD,10,100\nZEROQTY,0,50\nNEGQTY,-5,50\nMISSINGSYM,,50\n`;
    const res = await request.post(`${BACKEND_URL}/api/portfolio/upload-csv`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'bad_rows.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8'),
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // Only GOOD should be imported
    expect(data.imported).toEqual(['GOOD']);
  });

  test('TC-CSV-06 — Non-CSV / Corrupt File Handled Gracefully', async ({ page }) => {
    // Attempt UI upload
    const fileInput = page.locator('[data-testid="csv-file-input"]');
    await fileInput.setInputFiles({
      name: 'corrupt.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('this is not a structured csv at all', 'utf-8'),
    });

    // Should not crash the UI
    await expect(page.locator('[data-testid="portfolio-tab"]')).toBeVisible({ timeout: 10000 });
  });
});

import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

const SAMPLE_ROBINHOOD_CSV = (
  "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n" +
  "8/19/26,8/19/26,8/20/26,NVDA,NVDA 8/28/2026 Call $255.00,STC,1,$0.29,$28.94\n" +
  "8/17/26,8/17/26,8/18/26,VOO,Vanguard S&P 500 ETF,Buy,0.5,$700.00,($350.00)\n" +
  "8/17/26,8/17/26,8/18/26,,ACH Deposit,ACH,,,$150.00\n" +
  "8/10/26,8/10/26,8/10/26,BTC,Bitcoin,Buy,0.01,$60000.00,($600.00)\n" +
  "8/7/26,8/7/26,8/7/26,GME,GameStop,Buy,10,$20.00,($200.00)\n" +
  "8/8/26,8/8/26,8/9/26,GME,GameStop,Sell,10,$25.00,$250.00\n"
);

test.describe('7. Portfolio — Trade Activity Importer (Robinhood) (TC-IMPORT)', () => {
  const testUser = 'importer-tester@terminus.local';

  test.beforeEach(async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);
    await page.reload();
  });

  test('TC-IMPORT-01 & 02 — Preview Robinhood CSV & Closed Positions Excluded', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'Trade Importer' },
    });
    const token = (await resAuth.json()).session_token;

    const res = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/preview`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'robinhood_activity.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(SAMPLE_ROBINHOOD_CSV, 'utf-8'),
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.holdings).toBeTruthy();

    const symbols = data.holdings.map((h: any) => h.symbol);
    // VOO and BTC should be active
    expect(symbols).toContain('VOO');
    expect(symbols).toContain('BTC');

    // TC-IMPORT-02: GME was fully sold (bought 10, sold 10), so qty = 0, excluded from active holdings
    expect(symbols).not.toContain('GME');
  });

  test('TC-IMPORT-03 — Confirm Stage: Replace Mode', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'Trade Importer' },
    });
    const token = (await resAuth.json()).session_token;

    // Seed old holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'OLD_ASSET', quantity: 1, avg_cost: 10 },
    });

    // Preview
    const previewRes = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/preview`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'robinhood_activity.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(SAMPLE_ROBINHOOD_CSV, 'utf-8'),
        },
      },
    });
    const previewData = await previewRes.json();

    // Confirm with replace mode
    const confirmRes = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/confirm`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        holdings: previewData.holdings,
        trades: previewData.trades,
        mode: 'replace',
      },
    });
    expect(confirmRes.ok()).toBeTruthy();
    const confirmData = await confirmRes.json();
    expect(confirmData.ok).toBe(true);
    expect(confirmData.mode).toBe('replace');

    // Verify OLD_ASSET is deleted and VOO exists
    const holdingsRes = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const holdings = (await holdingsRes.json()).holdings;
    const symbols = holdings.map((h: any) => h.symbol);
    expect(symbols).not.toContain('OLD_ASSET');
    expect(symbols).toContain('VOO');
  });

  test('TC-IMPORT-04 — Confirm Stage: Merge Mode', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'Trade Importer' },
    });
    const token = (await resAuth.json()).session_token;

    // Pre-existing holding AAPL
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 5, avg_cost: 170 },
    });

    const newHolding = {
      symbol: 'ETH',
      name: 'Ethereum',
      quantity: 1.5,
      avg_cost: 2500,
      asset_type: 'crypto',
      active_lots: [{ symbol: 'ETH', quantity: 1.5, price: 2500 }],
    };

    const confirmRes = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/confirm`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        holdings: [newHolding],
        mode: 'merge',
      },
    });
    expect(confirmRes.ok()).toBeTruthy();

    const holdingsRes = await request.get(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const symbols = (await holdingsRes.json()).holdings.map((h: any) => h.symbol);
    expect(symbols).toContain('AAPL');
    expect(symbols).toContain('ETH');
  });

  test('TC-IMPORT-05 — Confirm with Empty Holdings List returns 400', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'Trade Importer' },
    });
    const token = (await resAuth.json()).session_token;

    const res = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/confirm`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { holdings: [], mode: 'replace' },
    });
    expect(res.status()).toBe(400);
  });

  test('TC-IMPORT-06 — Symbol with qty <= 0 is skipped', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'Trade Importer' },
    });
    const token = (await resAuth.json()).session_token;

    const res = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/confirm`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        holdings: [{ symbol: 'ZERO', quantity: 0, avg_cost: 100 }],
        mode: 'replace',
      },
    });
    const data = await res.json();
    expect(data.imported_count).toBe(0);
  });

  test('TC-IMPORT-07 — Malformed Robinhood CSV Returns 400', async ({ request }) => {
    const resAuth = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: testUser, name: 'Trade Importer' },
    });
    const token = (await resAuth.json()).session_token;

    const res = await request.post(`${BACKEND_URL}/api/portfolio/import-activity/preview`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'bad.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('Col1,Col2\nVal1,Val2', 'utf-8'),
        },
      },
    });
    expect(res.status()).toBe(400);
  });
});

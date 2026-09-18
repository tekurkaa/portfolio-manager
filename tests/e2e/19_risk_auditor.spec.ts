import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('19. Portfolio Risk Auditor (TC-RISK)', () => {
  const testUser = 'risk-tester@terminus.local';

  test('TC-RISK-05 — Risk Auditor Empty State without Holdings', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await page.goto('/');
    await expect(page.locator('[data-testid="holdings-table"]')).toBeVisible();

    // Risk auditor should not render or crash when zero holdings
    const riskAuditor = page.locator('[data-testid="portfolio-risk-auditor"]');
    await expect(riskAuditor).not.toBeVisible();
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
  });

  test('TC-RISK-01 & TC-RISK-02 & TC-RISK-04 — Risk Report, High Concentration & Dividend Cash Flow', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed 1 huge holding (>50% concentration) and 1 smaller holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 100, avg_cost: 150 }, // $15,000+
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'JPM', quantity: 2, avg_cost: 150 },   // $300
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="portfolio-risk-auditor"]')).toBeVisible({ timeout: 15000 });

    // TC-RISK-01: Health score ring & Risk auditor card
    await expect(page.locator('[data-testid="risk-auditor-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-score"]')).toBeVisible();

    // TC-RISK-02: Concentration warning badge
    const concWarn = page.locator('[data-testid="conc-warn"]');
    await expect(concWarn).toBeVisible();
    await expect(concWarn).toContainText('AAPL');

    // TC-RISK-04: Projected Annual Cash Flow KPI
    const divCard = page.locator('[data-testid="summary-projected-annual-cash-flow"]');
    await expect(divCard).toBeVisible();
    await expect(divCard).toContainText('/ yr');
  });

  test('TC-RISK-03 — All-Crypto Portfolio Triggers High Exposure Alert', async ({ page, request }) => {
    await loginViaUI(page, 'crypto-risk@terminus.local');
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // 100% crypto holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'BTC-USD', quantity: 1, avg_cost: 50000 },
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="portfolio-risk-auditor"]')).toBeVisible({ timeout: 15000 });

    const concWarn = page.locator('[data-testid="conc-warn"]');
    await expect(concWarn).toBeVisible();
    await expect(concWarn).toContainText('BTC-USD');
    await expect(concWarn).toContainText('crypto');
  });
});

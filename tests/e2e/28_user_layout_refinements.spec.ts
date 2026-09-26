import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.ts';

test.describe('28. User Layout Refinements: Risk Warnings & KPI Fixed Structure (TC-LAYOUT)', () => {
  const testUser = 'layout-refinements-tester@terminus.local';

  test('TC-LAYOUT-01 — Risk Diversification Single-Asset Exposure: Only Triangle Warning, No Second Yellow Square Badge', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed holdings that trigger yellow warning (GLD > 5% satellite threshold, e.g. 8% of total)
    // SPY: $9200 (92%), GLD: $800 (8%)
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'SPY', quantity: 20, avg_cost: 460 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'GLD', quantity: 4, avg_cost: 200 },
    });

    await page.goto('/');
    const riskAuditor = page.locator('[data-testid="portfolio-risk-auditor"]');
    await expect(riskAuditor).toBeVisible({ timeout: 15000 });

    const concWarn = page.locator('[data-testid="conc-warn"]');
    await expect(concWarn).toBeVisible({ timeout: 10000 });

    // Assert that the alert item has the triangle warning icon
    const alertRow = concWarn.locator('div').filter({ hasText: 'GLD' }).first();
    await expect(alertRow).toBeVisible();

    // Verify triangle warning exists
    const triangle = alertRow.locator('svg');
    await expect(triangle.first()).toBeVisible();

    // Verify there is NO second yellow square warning badge ("■ WARNING")
    const squareBadge = alertRow.locator('text="■ WARNING"');
    await expect(squareBadge).toHaveCount(0);
    const textContent = await alertRow.textContent();
    expect(textContent).not.toContain('■ WARNING');
  });

  test('TC-LAYOUT-02 — Sector Balance Warning: Keep Yellow Triangle, Remove Yellow Square', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed overweight sector (>20%)
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 20, avg_cost: 150 },
    });

    await page.goto('/');
    const sectorWarn = page.locator('[data-testid="sector-warn"]');
    await expect(sectorWarn).toBeVisible({ timeout: 15000 });

    // Triangle icon must be present
    const triangleIcon = sectorWarn.locator('svg').first();
    await expect(triangleIcon).toBeVisible();

    // Text must contain Sector Overweight, but MUST NOT contain the yellow square "■"
    const textContent = await sectorWarn.textContent();
    expect(textContent).toContain('Sector Overweight');
    expect(textContent).not.toContain('■');
  });

  test('TC-LAYOUT-03 — Summary KPI Cards: Fixed Structure, Single-Line Titles, Aligned Values & Subscripts', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');
    const summaryGrid = page.locator('[data-testid="summary-grid"]');
    await expect(summaryGrid).toBeVisible({ timeout: 15000 });

    // Check all 6 cards
    const cards = summaryGrid.locator('> div');
    const cardCount = await cards.count();
    expect(cardCount).toBe(6);

    // The 6th card label should be "Annual Cash Flow" (not wrapping "Projected Annual Cash Flow")
    const cashFlowCard = page.locator('[data-testid="summary-projected-annual-cash-flow"]');
    await expect(cashFlowCard).toBeVisible();
    await expect(cashFlowCard).toContainText('Annual Cash Flow');
    await expect(cashFlowCard).not.toContainText('Projected Annual Cash Flow');

    // Each card's title header must have single-line height (h-5)
    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      const header = card.locator('> div').first();
      const headerClasses = await header.getAttribute('class');
      expect(headerClasses).toContain('h-5');

      // Value container must have fixed height alignment (h-8)
      const valueContainer = card.locator('> div').nth(1);
      const valueClasses = await valueContainer.getAttribute('class');
      expect(valueClasses).toContain('h-8');
      expect(valueClasses).toContain('items-baseline');

      // Subscript container must have consistent min-height
      const subContainer = card.locator('> div').nth(2);
      const subClasses = await subContainer.getAttribute('class');
      expect(subClasses).toContain('min-h-');
    }

    // Verify click on cash flow card still navigates to Dividends tab
    await cashFlowCard.click();
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible({ timeout: 10000 });
  });

  test('TC-LAYOUT-04 — Single-Asset High Exposure (RED): Only Warning Triangle on Left, No Second HIGH EXPOSURE Badge on Right', async ({ page, request }) => {
    await loginViaUI(page, 'red-exposure-tester@terminus.local');
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed SOXL exceeding hard ceiling (15% limit): SOXL $200 (20%), SPY $800 (80%)
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'SPY', quantity: 2, avg_cost: 400 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'SOXL', quantity: 10, avg_cost: 20 },
    });

    await page.goto('/');
    const riskAuditor = page.locator('[data-testid="portfolio-risk-auditor"]');
    await expect(riskAuditor).toBeVisible({ timeout: 15000 });

    const concWarn = page.locator('[data-testid="conc-warn"]');
    await expect(concWarn).toBeVisible({ timeout: 10000 });

    const alertRow = concWarn.locator('div').filter({ hasText: 'SOXL' }).first();
    await expect(alertRow).toBeVisible();

    // Verify triangle warning icon is present on the left
    const triangle = alertRow.locator('svg');
    await expect(triangle.first()).toBeVisible();
    await expect(alertRow).toContainText('High Exposure: SOXL');

    // Verify there is NO second "HIGH EXPOSURE" badge on the right
    const highExposureBadge = alertRow.locator('text="▲ HIGH EXPOSURE"');
    await expect(highExposureBadge).toHaveCount(0);
    const textContent = await alertRow.textContent();
    expect(textContent).not.toContain('▲ HIGH EXPOSURE');
    expect(textContent).not.toContain('HIGH EXPOSURE');
  });
});


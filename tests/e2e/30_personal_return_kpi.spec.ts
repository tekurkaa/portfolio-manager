import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.ts';

test.describe('30. Personal Return (MWR / XIRR) Summary KPI Card (TC-MWR)', () => {
  const testUser = 'mwr-tester@terminus.local';

  test.beforeEach(async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed sample holdings so summary KPIs render
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'SPY', quantity: 5, avg_cost: 450 },
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="summary-grid"]')).toBeVisible({ timeout: 15000 });
  });

  test('TC-MWR-01 — Card Header and Subtitle Updated to Personal Return (MWR) & Annualized (XIRR)', async ({ page }) => {
    const mwrCard = page.locator('[data-testid="summary-personal-return"]');
    await expect(mwrCard).toBeVisible({ timeout: 10000 });

    // Assert header displays PERSONAL RETURN without truncation (...)
    const header = mwrCard.locator('> div').first();
    const headerText = await header.textContent();
    const labelSpan = header.locator('span').first();
    const labelText = await labelSpan.textContent();
    expect(labelText?.trim()).toBe('Personal Return');
    expect(headerText?.toUpperCase()).toContain('PERSONAL RETURN');
    expect(headerText).not.toContain('(MWR)');
    expect(headerText?.toUpperCase()).not.toContain('PORTFOLIO XIRR');

    // Assert subtitle displays Annualized (XIRR)
    const subContainer = mwrCard.locator('> div').nth(2);
    const subText = await subContainer.textContent();
    expect(subText).toContain('Annualized (XIRR)');
    expect(subText).not.toContain('annualized money-weighted');

    // Assert value and trendline icon remain present
    const valueContainer = mwrCard.locator('> div').nth(1);
    await expect(valueContainer).toBeVisible();
    const icon = header.locator('svg').last();
    await expect(icon).toBeVisible();
  });

  test('TC-MWR-02 — Info Tooltip Displays Money-Weighted Return Definition on Hover/Focus', async ({ page }) => {
    const mwrCard = page.locator('[data-testid="summary-personal-return"]');
    await expect(mwrCard).toBeVisible();

    const infoBtn = mwrCard.locator('[data-testid="summary-card-info-btn"]');
    await expect(infoBtn).toBeVisible();

    const tooltip = mwrCard.locator('[data-testid="summary-card-tooltip"]');

    // Hover over the info button
    await infoBtn.hover();
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    const expectedText =
      'Personal Return (Money-Weighted / XIRR) calculates your annualized rate of return factoring in the exact timing and dollar amount of all deposits, withdrawals, and current portfolio balance.';
    const tooltipText = await tooltip.textContent();
    expect(tooltipText).toContain(expectedText);
  });

  test('TC-MWR-03 — Card Preserves 3-Tier Grid Alignment and Single-Line Constraints', async ({ page }) => {
    const summaryGrid = page.locator('[data-testid="summary-grid"]');
    await expect(summaryGrid).toBeVisible();

    const cards = summaryGrid.locator('> div');
    const count = await cards.count();
    expect(count).toBe(6);

    const mwrCard = page.locator('[data-testid="summary-personal-return"]');
    const header = mwrCard.locator('> div').first();
    const headerClasses = await header.getAttribute('class');
    expect(headerClasses).toContain('h-5');

    const valueContainer = mwrCard.locator('> div').nth(1);
    const valueClasses = await valueContainer.getAttribute('class');
    expect(valueClasses).toContain('h-8');
    expect(valueClasses).toContain('items-baseline');

    const subContainer = mwrCard.locator('> div').nth(2);
    const subClasses = await subContainer.getAttribute('class');
    expect(subClasses).toContain('min-h-');
  });

  test('TC-MWR-04 — Mobile Viewport Renders Cleanly Without Horizontal Overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const mwrCard = page.locator('[data-testid="summary-personal-return"]');
    await expect(mwrCard).toBeVisible({ timeout: 15000 });

    const box = await mwrCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.width).toBeLessThanOrEqual(375);
  });

  test('TC-MWR-05 — Cost Basis Card has Dollar Sign ($) Icon for Consistent Header Symmetry', async ({ page }) => {
    const costBasisCard = page.locator('[data-testid="summary-cost-basis"]');
    await expect(costBasisCard).toBeVisible({ timeout: 10000 });

    const header = costBasisCard.locator('> div').first();
    const icon = header.locator('svg');
    await expect(icon).toHaveCount(1);
    await expect(icon).toBeVisible();

    // Verify all 6 cards in summary-grid now have an icon in their header row
    const summaryGrid = page.locator('[data-testid="summary-grid"]');
    const cards = summaryGrid.locator('> div');
    const count = await cards.count();
    expect(count).toBe(6);
    for (let i = 0; i < count; i++) {
      const cardHeader = cards.nth(i).locator('> div').first();
      await expect(cardHeader.locator('svg').last()).toBeVisible();
    }
  });
});


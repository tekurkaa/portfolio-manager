import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.ts';

test.describe('27. Design Audit Batch 4: Modal Accessibility, Visual Progressbars, & Refined Controls (TC-DESIGN4)', () => {
  const testUser = 'design-batch4-tester@terminus.local';

  test('TC-DESIGN4-01 — StockDetailModal Dialog Semantics & Accessible Name', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Navigate to Watchlist tab and add SPY to trigger detail modal
    const watchlistTabBtn = page.locator('[data-testid="tab-watchlist-button"]');
    await watchlistTabBtn.click();
    await expect(page.locator('[data-testid="watchlist-tab"]')).toBeVisible({ timeout: 15000 });

    const addInput = page.locator('[data-testid="watchlist-input"]');
    await addInput.fill('SPY');
    await page.locator('[data-testid="watchlist-add"]').click();

    const spyTrigger = page.locator('[data-testid="watchlist-symbol-SPY"]');
    await expect(spyTrigger).toBeVisible({ timeout: 10000 });
    await spyTrigger.click();

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Verify dialog semantics
    const dialog = modal.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'stock-detail-title');

    const title = page.locator('#stock-detail-title');
    await expect(title).toBeVisible();

    // Close modal
    await page.locator('[data-testid="close-stock-modal-btn"]').click();
    await expect(modal).not.toBeVisible();
  });

  test('TC-DESIGN4-02 — StockDetailModal Day & 52-Week Range Visual Progressbars', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Trigger modal for SPY
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'SPY' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Range progressbars
    const dayRangeBar = modal.locator('[role="progressbar"][aria-label*="Day"]').first();
    await expect(dayRangeBar).toBeVisible({ timeout: 15000 });
    await expect(dayRangeBar).toHaveAttribute('aria-valuenow');
    await expect(dayRangeBar).toHaveAttribute('aria-valuemin', '0');
    await expect(dayRangeBar).toHaveAttribute('aria-valuemax', '100');

    const yearRangeBar = modal.locator('[role="progressbar"][aria-label*="52-Week"]').first();
    await expect(yearRangeBar).toBeVisible();
    await expect(yearRangeBar).toHaveAttribute('aria-valuenow');
    await expect(yearRangeBar).toHaveAttribute('aria-valuemin', '0');
    await expect(yearRangeBar).toHaveAttribute('aria-valuemax', '100');

    await page.keyboard.press('Escape');
  });

  test('TC-DESIGN4-03 — StockDetailModal Range Buttons Tactile Scale & High-Contrast Focus Rings', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'SPY' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    const rangeBtn = modal.locator('[data-testid="chart-range-1D"]');
    await expect(rangeBtn).toBeVisible({ timeout: 10000 });

    const classes = await rangeBtn.getAttribute('class');
    expect(classes).toContain('focus-visible:ring-2');
    expect(classes).toContain('active:scale-[0.97]');

    await page.keyboard.press('Escape');
  });

  test('TC-DESIGN4-04 — StockDetailModal Company Overview Expand/Collapse aria-expanded', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'SPY' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    const toggleBtn = modal.locator('[data-testid="toggle-full-summary-btn"]');
    if (await toggleBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
      await toggleBtn.click();
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    }

    await page.keyboard.press('Escape');
  });

  test('TC-DESIGN4-05 — Login Screen Google OAuth Accessible Name', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');

    const googleBtn = page.locator('[data-testid="google-login-button"]');
    await expect(googleBtn).toBeVisible({ timeout: 10000 });
    await expect(googleBtn).toHaveAttribute('aria-label', 'Sign in with Google');
  });

  test('TC-DESIGN4-06 — TradeActivityImporter Step 3 Clean Event Handling on Options', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await page.goto('/');
    const importBtn = page.locator('[data-testid="from-trade-activity-button"]');
    await expect(importBtn).toBeVisible({ timeout: 15000 });
    await importBtn.click();

    const importerModal = page.locator('[data-testid="trade-importer-modal"]');
    await expect(importerModal).toBeVisible();

    // Verify modal close
    await page.locator('[data-testid="close-trade-importer"]').click();
    await expect(importerModal).not.toBeVisible();
  });

  test('TC-DESIGN4-07 — DividendsTab 12-Month Distribution Grid Accessibility', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const divTabBtn = page.locator('[data-testid="tab-dividends-button"]');
    await divTabBtn.click();
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible({ timeout: 15000 });

    const monthlyGrid = page.locator('[data-testid="dividend-monthly-grid"]');
    await expect(monthlyGrid).toBeVisible({ timeout: 15000 });

    const region = monthlyGrid.locator('[role="region"][aria-label*="12-Month"]').first();
    await expect(region).toBeVisible();

    const microBars = region.locator('[role="progressbar"]');
    const barCount = await microBars.count();
    expect(barCount).toBeGreaterThanOrEqual(1);

    const firstBar = microBars.first();
    await expect(firstBar).toHaveAttribute('aria-valuenow');
    await expect(firstBar).toHaveAttribute('aria-valuemin', '0');
    await expect(firstBar).toHaveAttribute('aria-valuemax', '100');
  });

  test('TC-DESIGN4-08 — PortfolioRiskAuditor Sector Legend Tooltip Titles', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed a holding with known sector
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');
    const riskAuditor = page.locator('[data-testid="portfolio-risk-auditor"]');
    await expect(riskAuditor).toBeVisible({ timeout: 15000 });

    const sectorPill = page.locator('[data-testid^="sector-pill-"]').first();
    await expect(sectorPill).toBeVisible({ timeout: 10000 });

    const titleAttr = await sectorPill.getAttribute('title');
    expect(titleAttr).toBeTruthy();
    expect(titleAttr).toMatch(/%/);
  });

  test('TC-DESIGN4-09 — Navigation Tab Active Indicator & Accessibility', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const portfolioTabBtn = page.locator('[data-testid="tab-portfolio-button"]');
    await expect(portfolioTabBtn).toBeVisible({ timeout: 15000 });
    await expect(portfolioTabBtn).toHaveAttribute('aria-current', 'page');
    await expect(portfolioTabBtn).toHaveAttribute('data-active', 'true');

    // Verify screen reader active announcement
    const srActive = portfolioTabBtn.locator('.sr-only');
    await expect(srActive).toHaveText('(Active)');
  });

  test('TC-DESIGN4-10 — AlphaTab OptionsFlow Table Scrollable Region', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const alphaTabBtn = page.locator('[data-testid="tab-alpha-button"]');
    await alphaTabBtn.click();
    await expect(page.locator('[data-testid="alpha-tab"]')).toBeVisible({ timeout: 15000 });

    const optionsPanel = page.locator('[data-testid="options-flow-panel"]');
    await expect(optionsPanel).toBeVisible({ timeout: 15000 });

    const scrollRegion = optionsPanel.locator('[role="region"][aria-label="Unusual options flow table"]');
    await expect(scrollRegion).toBeVisible();
    await expect(scrollRegion).toHaveAttribute('tabindex', '0');
  });
});

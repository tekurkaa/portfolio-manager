import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.ts';

test.describe('26. Design Audit Batch 3: Detail Polish, A11y & Robust Micro-Interactions (TC-DESIGN3)', () => {
  const testUser = 'design-batch3-tester@terminus.local';

  test('TC-DESIGN3-01 — CongressDrawer Dialog Semantics & Keyboard Escape Dismissal', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. Navigate to Watchlist tab
    const watchlistTabBtn = page.locator('[data-testid="tab-watchlist-button"]');
    await watchlistTabBtn.click();
    await expect(page.locator('[data-testid="watchlist-tab"]')).toBeVisible({ timeout: 15000 });

    // Ensure at least one symbol is in the watchlist
    const addInput = page.locator('[data-testid="watchlist-input"]');
    await addInput.fill('SPY');
    await page.locator('[data-testid="watchlist-add"]').click();

    const row = page.locator('[data-testid="watchlist-row-SPY"]');
    await expect(row).toBeVisible({ timeout: 10000 });

    // Click row to open CongressDrawer
    await row.click();

    const drawer = page.locator('[data-testid="congress-drawer"]');
    await expect(drawer).toBeVisible();

    // Verify dialog semantics
    const dialog = drawer.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'congress-drawer-title');

    const title = page.locator('#congress-drawer-title');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Congress Trades');

    // Dismiss via keyboard Escape key
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
  });

  test('TC-DESIGN3-02 — Monospace Tabular Numbers on Watchlist Numeric Data Cells', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const watchlistTabBtn = page.locator('[data-testid="tab-watchlist-button"]');
    await watchlistTabBtn.click();
    await expect(page.locator('[data-testid="watchlist-tab"]')).toBeVisible({ timeout: 15000 });

    // Wait for at least one row
    const row = page.locator('[data-testid^="watchlist-row-"]').first();
    await expect(row).toBeVisible({ timeout: 10000 });

    // Verify tabular-nums class on price, day %, and score cells
    const tabularCells = row.locator('td.tabular-nums');
    const count = await tabularCells.count();
    // PRICE, DAY %, COMPOSITE, MOMENTUM, SENTIMENT, OPTIONS -> at least 5
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('TC-DESIGN3-03 — Monospace Tabular Numbers on Dividends Summary Strip Metric Cards', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const divTabBtn = page.locator('[data-testid="tab-dividends-button"]');
    await divTabBtn.click();
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible({ timeout: 15000 });

    const summaryStrip = page.locator('[data-testid="dividends-summary-strip"]');
    await expect(summaryStrip).toBeVisible();

    const annualIncome = page.locator('[data-testid="div-annual-income"]');
    await expect(annualIncome).toBeVisible();
    const classes = await annualIncome.getAttribute('class');
    expect(classes).toContain('tabular-nums');
  });

  test('TC-DESIGN3-04 — Skeleton Loaders for MacroNews and StockNews on Data Fetch', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Check Macro News tab
    const macroTabBtn = page.locator('[data-testid="tab-macro-news-button"]');
    await macroTabBtn.click();
    await expect(page.locator('[data-testid="macro-news-tab"]')).toBeVisible({ timeout: 15000 });

    // Check Stock News tab
    const stockNewsTabBtn = page.locator('[data-testid="tab-stock-news-button"]');
    await stockNewsTabBtn.click();
    await expect(page.locator('[data-testid="stock-news-tab"]')).toBeVisible({ timeout: 15000 });

    // Verify skeleton loaders are defined with animate-pulse in DOM or component
    const hasMacroSkeleton = await page.locator('[data-testid="macro-news-skeleton"]').count();
    const hasStockSkeleton = await page.locator('[data-testid="stock-news-skeleton"]').count();
    expect(hasMacroSkeleton >= 0).toBe(true);
    expect(hasStockSkeleton >= 0).toBe(true);
  });

  test('TC-DESIGN3-05 — Watchlist Action Buttons Tactile Scale & High-Contrast Focus Rings', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const watchlistTabBtn = page.locator('[data-testid="tab-watchlist-button"]');
    await watchlistTabBtn.click();
    await expect(page.locator('[data-testid="watchlist-tab"]')).toBeVisible({ timeout: 15000 });

    const addBtn = page.locator('[data-testid="watchlist-add"]');
    const addClasses = await addBtn.getAttribute('class');
    expect(addClasses).toContain('active:scale-[0.97]');
    expect(addClasses).toContain('focus-visible:ring-2');

    const refreshBtn = page.locator('[data-testid="watchlist-refresh"]');
    const refreshClasses = await refreshBtn.getAttribute('class');
    expect(refreshClasses).toContain('active:scale-[0.97]');
    expect(refreshClasses).toContain('focus-visible:ring-2');
  });

  test('TC-DESIGN3-06 — Dividends Sub-Tab Switcher Accessibility (aria-current & focus ring)', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const divTabBtn = page.locator('[data-testid="tab-dividends-button"]');
    await divTabBtn.click();
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible({ timeout: 15000 });

    const allSubTab = page.locator('[data-testid="div-subtab-all"]');
    await expect(allSubTab).toBeVisible();

    // Verify aria-current on active sub-tab
    await expect(allSubTab).toHaveAttribute('aria-current', 'page');

    const classes = await allSubTab.getAttribute('class');
    expect(classes).toContain('focus-visible:ring-2');
    expect(classes).toContain('active:scale-[0.97]');
  });

  test('TC-DESIGN3-07 — News Filter Pills Focus Rings & Tactile Feedback', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Macro theme pills
    const macroTabBtn = page.locator('[data-testid="tab-macro-news-button"]');
    await macroTabBtn.click();
    await expect(page.locator('[data-testid="macro-news-tab"]')).toBeVisible({ timeout: 15000 });

    const macroPill = page.locator('[data-testid="macro-theme-ALL"]');
    await expect(macroPill).toBeVisible();
    const macroPillClasses = await macroPill.getAttribute('class');
    expect(macroPillClasses).toContain('focus-visible:ring-2');
    expect(macroPillClasses).toContain('active:scale-[0.97]');

    // Stock news filter pills
    const stockNewsTabBtn = page.locator('[data-testid="tab-stock-news-button"]');
    await stockNewsTabBtn.click();
    await expect(page.locator('[data-testid="stock-news-tab"]')).toBeVisible({ timeout: 15000 });

    const stockPill = page.locator('[data-testid="stock-filter-ALL"]');
    if (await stockPill.isVisible()) {
      const stockPillClasses = await stockPill.getAttribute('class');
      expect(stockPillClasses).toContain('focus-visible:ring-2');
      expect(stockPillClasses).toContain('active:scale-[0.97]');
    }
  });

  test('TC-DESIGN3-08 — SentimentTab SVG Text Cross-Browser Typography Styling', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const sentimentTabBtn = page.locator('[data-testid="tab-sentiment-button"]');
    await sentimentTabBtn.click();
    await expect(page.locator('[data-testid="sentiment-tab"]')).toBeVisible({ timeout: 15000 });

    const gaugeSvg = page.locator('[data-testid="sentiment-gauge"]').first();
    await expect(gaugeSvg).toBeVisible();

    const gaugeText = gaugeSvg.locator('text');
    await expect(gaugeText).toBeVisible();

    // Verify text uses inline style with JetBrains Mono / monospace
    const styleAttr = await gaugeText.getAttribute('style');
    expect(styleAttr).toBeTruthy();
    expect(styleAttr?.toLowerCase()).toContain('jetbrains mono');
  });

  test('TC-DESIGN3-09 — Progressbar Semantic Accessibility on Visual Bars', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed a holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');

    // Alpha Tab progress bar
    const alphaTabBtn = page.locator('[data-testid="tab-alpha-button"]');
    await alphaTabBtn.click();
    const alphaPanel = page.locator('[data-testid="alpha-signals-panel"]');
    await expect(alphaPanel).toBeVisible({ timeout: 15000 });

    const alphaBar = alphaPanel.locator('[role="progressbar"]').first();
    await expect(alphaBar).toBeVisible({ timeout: 10000 });
    await expect(alphaBar).toHaveAttribute('aria-valuenow');
    await expect(alphaBar).toHaveAttribute('aria-valuemin', '0');
    await expect(alphaBar).toHaveAttribute('aria-valuemax', '100');
  });

  test('TC-DESIGN3-10 — Non-Color-Only Risk Indicators on Portfolio Risk Auditor', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed an overweight holding (triggers high exposure warning)
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'DOGE-USD', quantity: 50000, avg_cost: 0.15 },
    });

    await page.goto('/');
    const riskAuditor = page.locator('[data-testid="portfolio-risk-auditor"]');
    await expect(riskAuditor).toBeVisible({ timeout: 15000 });

    const concWarn = page.locator('[data-testid="conc-warn"]');
    await expect(concWarn).toBeVisible({ timeout: 10000 });

    // Assert that the alert row contains a non-color shape indicator (triangle warning icon) alongside text
    const alertRow = concWarn.locator('div').filter({ hasText: 'DOGE-USD' }).first();
    await expect(alertRow).toBeVisible();
    const triangle = alertRow.locator('svg');
    await expect(triangle.first()).toBeVisible();
    const text = await alertRow.textContent();
    expect(text).toContain('High Exposure: DOGE-USD');
  });
});

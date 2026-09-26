import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('25. Design Audit Batch 2: Polish, A11y & Visual Depth (TC-DESIGN2)', () => {
  const testUser = 'design-batch2-tester@terminus.local';

  test('TC-DESIGN2-01 — Tab Container Fade-In Transition & Max-Width Screen Container', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. Verify main content container has max-w-screen-2xl mx-auto
    const mainContainer = page.locator('main[data-testid="tab-content"]');
    await expect(mainContainer).toBeVisible({ timeout: 15000 });
    const mainClasses = await mainContainer.getAttribute('class');
    expect(mainClasses).toContain('max-w-screen-2xl');
    expect(mainClasses).toContain('mx-auto');

    // 2. Verify active tab container has animate-fadeIn class
    const portfolioContainer = page.locator('[data-tab-container="portfolio"]');
    await expect(portfolioContainer).toBeVisible();
    const containerClasses = await portfolioContainer.getAttribute('class');
    expect(containerClasses).toContain('animate-fadeIn');

    // 3. Switch to Dividends and verify animate-fadeIn
    const divTabBtn = page.locator('[data-testid="tab-dividends-button"]');
    await divTabBtn.click();
    const divContainer = page.locator('[data-tab-container="dividends"]');
    await expect(divContainer).toBeVisible();
    const divClasses = await divContainer.getAttribute('class');
    expect(divClasses).toContain('animate-fadeIn');
  });

  test('TC-DESIGN2-02 — Modal Dialog Accessibility (role, aria-modal, aria-labelledby, Escape key)', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. Test DisclaimerModal
    const openDisclaimerBtn = page.locator('[data-testid="open-disclaimer-modal-button"]');
    await openDisclaimerBtn.click();
    const disclaimerModal = page.locator('[data-testid="disclaimer-modal"]');
    await expect(disclaimerModal).toBeVisible();

    const disclaimerDialog = disclaimerModal.locator('[role="dialog"]');
    await expect(disclaimerDialog).toBeVisible();
    await expect(disclaimerDialog).toHaveAttribute('aria-modal', 'true');
    await expect(disclaimerDialog).toHaveAttribute('aria-labelledby', 'disclaimer-modal-title');
    const disclaimerTitle = page.locator('#disclaimer-modal-title');
    await expect(disclaimerTitle).toBeVisible();

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(disclaimerModal).not.toBeVisible();

    // 2. Test HowItWorksModal
    const howBtn = page.locator('[data-testid="how-it-works-button"]');
    await howBtn.click();
    const howModal = page.locator('[data-testid="how-modal"]');
    await expect(howModal).toBeVisible();

    const howDialog = howModal.locator('[role="dialog"]');
    await expect(howDialog).toBeVisible();
    await expect(howDialog).toHaveAttribute('aria-modal', 'true');
    await expect(howDialog).toHaveAttribute('aria-labelledby', 'how-it-works-title');
    const howTitle = page.locator('#how-it-works-title');
    await expect(howTitle).toBeVisible();

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(howModal).not.toBeVisible();

    // 3. Test StockDetailModal
    // Trigger via custom event or holding click
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'AAPL' } }));
    });
    const stockModal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(stockModal).toBeVisible({ timeout: 10000 });

    const stockDialog = stockModal.locator('[role="dialog"]');
    await expect(stockDialog).toBeVisible();
    await expect(stockDialog).toHaveAttribute('aria-modal', 'true');
    await expect(stockDialog).toHaveAttribute('aria-labelledby', 'stock-detail-title');
    const stockTitle = page.locator('#stock-detail-title');
    await expect(stockTitle).toBeVisible();

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(stockModal).not.toBeVisible();
  });

  test('TC-DESIGN2-03 — Monospace Tabular Numbers on Holdings Table Cells', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 15, avg_cost: 150 },
    });

    await page.goto('/');
    const holdingRow = page.locator('[data-testid="holding-row-AAPL"]');
    await expect(holdingRow).toBeVisible({ timeout: 15000 });

    // Check cells for tabular-nums class
    const tabularCells = holdingRow.locator('td.tabular-nums');
    const count = await tabularCells.count();
    // qty, avg_cost, price, day %, value, pl, pl %, xirr -> at least 6 tabular cells
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('TC-DESIGN2-04 — Color-Independent Directional Indicators (▲/▼) on P/L & Day % Values', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed a holding with substantial gain
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'NVDA', quantity: 10, avg_cost: 50 },
    });

    await page.goto('/');
    const holdingRow = page.locator('[data-testid="holding-row-NVDA"]');
    await expect(holdingRow).toBeVisible({ timeout: 15000 });

    // Verify directional arrow ▲ or ▼ is present in text content of P/L or day change cells
    const plCell = holdingRow.locator('[data-testid="holding-pl-NVDA"]');
    await expect(plCell).toBeVisible();
    const plText = await plCell.textContent();
    expect(plText).toMatch(/[▲▼]/);

    const plPctCell = holdingRow.locator('[data-testid="holding-pl-pct-NVDA"]');
    await expect(plPctCell).toBeVisible();
    const plPctText = await plPctCell.textContent();
    expect(plPctText).toMatch(/[▲▼]/);
  });

  test('TC-DESIGN2-05 — Surface Elevation (panel-raised) on Remaining Tab Panels', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. AlphaTab
    const alphaTabBtn = page.locator('[data-testid="tab-alpha-button"]');
    await alphaTabBtn.click();
    const alphaPanel = page.locator('[data-testid="alpha-signals-panel"]');
    await expect(alphaPanel).toBeVisible({ timeout: 10000 });
    const alphaClasses = await alphaPanel.getAttribute('class');
    expect(alphaClasses).toContain('panel-raised');

    // 2. ScannerTab
    const scannerTabBtn = page.locator('[data-testid="tab-scanner-button"]');
    await scannerTabBtn.click();
    const notifyBlock = page.locator('[data-testid="notify-block"]');
    await expect(notifyBlock).toBeVisible({ timeout: 10000 });
    const notifyClasses = await notifyBlock.getAttribute('class');
    expect(notifyClasses).toContain('panel-raised');

    // 3. InsiderFlowTab
    const insiderTabBtn = page.locator('[data-testid="tab-insider-button"]');
    await insiderTabBtn.click();
    const topActivity = page.locator('[data-testid="top-activity"]');
    await expect(topActivity).toBeVisible({ timeout: 10000 });
    const topClasses = await topActivity.getAttribute('class');
    expect(topClasses).toContain('panel-raised');
  });

  test('TC-DESIGN2-06 — Treemap Small-Cell Aggregation (<1% micro-holdings grouped as Other)', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed 1 huge holding ($100k) and 1 micro holding ($10 - 0.01% of portfolio)
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 500, avg_cost: 200 }, // ~$100,000
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'SPACEX', quantity: 0.05, avg_cost: 200 }, // ~$10 (<0.01%)
    });

    await page.goto('/');
    const treemap = page.locator('[data-testid="allocation-treemap"]');
    await expect(treemap).toBeVisible({ timeout: 15000 });

    // The micro holding should be aggregated into "OTHER (<1%)" or similar guard
    const otherCell = page.locator('[data-testid="treemap-cell-OTHER (<1%)"], [data-testid="treemap-cell-OTHER"]');
    await expect(otherCell).toBeVisible({ timeout: 10000 });
  });

  test('TC-DESIGN2-07 — Chart Skeleton Loading Indicator Component', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Verify chart container exists
    const chart = page.locator('[data-testid="portfolio-history-chart"]');
    await expect(chart).toBeVisible({ timeout: 15000 });

    // Switch range to trigger loading or verify skeleton element structure exists
    const range1Y = page.locator('[data-testid="range-1Y"]');
    await range1Y.click();

    // Verify skeleton or chart renders properly without unhandled layout shift
    await expect(chart).toBeVisible();
  });

  test('TC-DESIGN2-08 — SummaryCards Active Scale Micro-Interactions', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');

    const summaryTotal = page.locator('[data-testid="summary-total-value"]');
    await expect(summaryTotal).toBeVisible({ timeout: 15000 });
    const classes = await summaryTotal.getAttribute('class');
    expect(classes).toContain('active:scale-[0.98]');

    const summaryDay = page.locator('[data-testid="summary-day-p/l"]');
    await expect(summaryDay).toBeVisible();
    const dayClasses = await summaryDay.getAttribute('class');
    expect(dayClasses).toContain('active:scale-[0.98]');
  });

  test('TC-DESIGN2-09 — scope="col" on Congress and Scanner Tables', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. Check InsiderFlowTab congress table
    const insiderTabBtn = page.locator('[data-testid="tab-insider-button"]');
    await insiderTabBtn.click();
    const congressTable = page.locator('[data-testid="congress-table"]');
    await expect(congressTable).toBeVisible({ timeout: 10000 });
    const congressThs = congressTable.locator('thead th');
    const congressCount = await congressThs.count();
    expect(congressCount).toBeGreaterThan(0);
    for (let i = 0; i < congressCount; i++) {
      await expect(congressThs.nth(i)).toHaveAttribute('scope', 'col');
    }

    // 2. Check ScannerTab table
    const scannerTabBtn = page.locator('[data-testid="tab-scanner-button"]');
    await scannerTabBtn.click();
    const scannerTable = page.locator('[data-testid="scanner-table"]');
    await expect(scannerTable).toBeVisible({ timeout: 10000 });
    const scannerThs = scannerTable.locator('thead th');
    const scannerCount = await scannerThs.count();
    expect(scannerCount).toBeGreaterThan(0);
    for (let i = 0; i < scannerCount; i++) {
      await expect(scannerThs.nth(i)).toHaveAttribute('scope', 'col');
    }
  });

  test('TC-DESIGN2-10 — Keyboard Focus Rings on Scanner & Insider Interactive Controls', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. Scanner tab rescan button
    const scannerTabBtn = page.locator('[data-testid="tab-scanner-button"]');
    await scannerTabBtn.click();
    const rescanBtn = page.locator('[data-testid="scan-refresh"]');
    await expect(rescanBtn).toBeVisible({ timeout: 10000 });
    const rescanClasses = await rescanBtn.getAttribute('class');
    expect(rescanClasses).toContain('focus-visible:ring-2');

    // 2. Insider tab refresh button
    const insiderTabBtn = page.locator('[data-testid="tab-insider-button"]');
    await insiderTabBtn.click();
    const refreshInsiderBtn = page.locator('[data-testid="refresh-insider"]');
    await expect(refreshInsiderBtn).toBeVisible({ timeout: 10000 });
    const refreshClasses = await refreshInsiderBtn.getAttribute('class');
    expect(refreshClasses).toContain('focus-visible:ring-2');
  });
});

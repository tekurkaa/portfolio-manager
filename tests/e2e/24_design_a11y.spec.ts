import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('24. Design Audit Top 10 Fixes & Accessibility (TC-DESIGN)', () => {
  const testUser = 'design-audit-tester@terminus.local';

  test('TC-DESIGN-01 — Accessible Buttons & Active Navigation Tab Indicator', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // 1. Verify aria-current="page" on active tab, and absent on inactive tabs
    const portfolioTab = page.locator('[data-testid="tab-portfolio-button"]');
    await expect(portfolioTab).toBeVisible({ timeout: 15000 });
    await expect(portfolioTab).toHaveAttribute('aria-current', 'page');

    const watchlistTab = page.locator('[data-testid="tab-watchlist-button"]');
    await expect(watchlistTab).not.toHaveAttribute('aria-current', 'page');

    // Switch tab to dividends
    const dividendsTab = page.locator('[data-testid="tab-dividends-button"]');
    await dividendsTab.click();
    await expect(dividendsTab).toHaveAttribute('aria-current', 'page');
    await expect(portfolioTab).not.toHaveAttribute('aria-current', 'page');

    // 2. Verify logout button has aria-label="Sign out"
    const logoutBtn = page.locator('[data-testid="logout-button"]');
    await expect(logoutBtn).toHaveAttribute('aria-label', 'Sign out');

    // 3. Verify dividends refresh button has aria-label
    const divRefreshBtn = page.locator('[data-testid="dividends-refresh-btn"]');
    await expect(divRefreshBtn).toHaveAttribute('aria-label', 'Refresh dividend schedule');

    // 4. Verify watchlist congress drawer close button has aria-label
    await watchlistTab.click();
    const trigger = page.locator('[data-testid^="watchlist-congress-"]').first();
    if (await trigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await trigger.click();
      const closeBtn = page.locator('[data-testid="close-drawer"]');
      await expect(closeBtn).toBeVisible();
      await expect(closeBtn).toHaveAttribute('aria-label', 'Close congress drawer');
      await closeBtn.click();
    }

    // 5. Verify sentiment gauge SVG has accessible role, label, and title
    const sentimentTab = page.locator('[data-testid="tab-sentiment-button"]');
    await sentimentTab.click();
    const gauges = page.locator('[data-testid="sentiment-gauge"]');
    const gauge = gauges.first();
    await expect(gauge).toBeVisible();
    await expect(gauge).toHaveAttribute('role', 'img');
    const ariaLabel = await gauge.getAttribute('aria-label');
    expect(ariaLabel).toContain('Market Sentiment Gauge');
    const titleText = await gauge.locator('title').textContent();
    expect(titleText).toContain('Market Sentiment Gauge');
  });

  test('TC-DESIGN-02 — Login Form Email Input Attributes & Label Association', async ({ page }) => {
    // Clear storage and navigate to login screen
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');

    const loginScreen = page.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 15000 });

    const emailInput = page.locator('#email-input');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(emailInput).toHaveAttribute('autocomplete', 'email');

    const emailLabel = page.locator('label[for="email-input"]');
    await expect(emailLabel).toBeVisible();
    await expect(emailLabel).toContainText('Account Email');
  });

  test('TC-DESIGN-03 — AddHoldingForm Visible Labels & ID Association', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Ensure on portfolio tab
    await page.locator('[data-testid="tab-portfolio-button"]').click();

    // Toggle add form
    const toggleAddBtn = page.locator('[data-testid="toggle-add-button"]');
    await toggleAddBtn.click();

    // Verify visible labels and corresponding inputs
    const symbolLabel = page.locator('label[for="add-symbol-input"]');
    await expect(symbolLabel).toBeVisible();
    await expect(symbolLabel).toContainText('Symbol');
    await expect(page.locator('#add-symbol-input')).toBeVisible();

    const qtyLabel = page.locator('label[for="add-quantity-input"]');
    await expect(qtyLabel).toBeVisible();
    await expect(qtyLabel).toContainText('Quantity');
    await expect(page.locator('#add-quantity-input')).toBeVisible();

    const costLabel = page.locator('label[for="add-cost-input"]');
    await expect(costLabel).toBeVisible();
    await expect(costLabel).toContainText('Avg Cost');
    await expect(page.locator('#add-cost-input')).toBeVisible();

    const nameLabel = page.locator('label[for="add-name-input"]');
    await expect(nameLabel).toBeVisible();
    await expect(nameLabel).toContainText('Name');
    await expect(page.locator('#add-name-input')).toBeVisible();
  });

  test('TC-DESIGN-04 — Navigation Focus-Visible Rings', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    const portfolioTab = page.locator('[data-testid="tab-portfolio-button"]');
    await expect(portfolioTab).toBeVisible({ timeout: 15000 });

    const classNames = await portfolioTab.getAttribute('class');
    expect(classNames).toContain('focus-visible:ring-2');
    expect(classNames).toContain('focus-visible:ring-amber-500');
  });

  test('TC-DESIGN-05 — Table Accessibility (scope="col") & Tabular Numbers', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed test holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');
    const holdingsTable = page.locator('[data-testid="holdings-table"]');
    await expect(holdingsTable).toBeVisible({ timeout: 15000 });

    // Verify all <th> have scope="col"
    const ths = holdingsTable.locator('thead th');
    const thCount = await ths.count();
    expect(thCount).toBeGreaterThan(0);
    for (let i = 0; i < thCount; i++) {
      await expect(ths.nth(i)).toHaveAttribute('scope', 'col');
    }

    // Verify numeric <td> has tabular-nums class
    const holdingRow = page.locator('[data-testid="holding-row-AAPL"]');
    await expect(holdingRow).toBeVisible();

    const numCells = holdingRow.locator('td.tabular-nums');
    const numCellsCount = await numCells.count();
    expect(numCellsCount).toBeGreaterThanOrEqual(4);
  });

  test('TC-DESIGN-06 — Card Elevation (panel-raised) & Micro-Interactions (active:scale)', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed test holding to populate summary grid
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');

    const summaryCard = page.locator('[data-testid="summary-total-value"]');
    await expect(summaryCard).toBeVisible({ timeout: 15000 });

    const classNames = await summaryCard.getAttribute('class');
    expect(classNames).toContain('panel-raised');
    expect(classNames).toContain('active:scale-[0.98]');
  });

  test('TC-DESIGN-07 — Recharts Dark Terminal Tooltip Custom Component', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });

    await page.goto('/');

    const chart = page.locator('[data-testid="portfolio-history-chart"]');
    await expect(chart).toBeVisible({ timeout: 15000 });

    const wrapper = chart.locator('.recharts-wrapper');
    await expect(wrapper).toBeVisible({ timeout: 10000 });
    const box = await wrapper.boundingBox();
    if (box) {
      await wrapper.hover({ position: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) } });
      const customTooltip = page.locator('[data-testid="chart-custom-tooltip"]');
      await expect(customTooltip).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-DESIGN-08 — Inline Clear All Confirmation (No window.confirm alert)', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed test holding
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'MSFT', quantity: 5, avg_cost: 300 },
    });

    await page.goto('/');

    // Track if any window dialog opens (we expect NONE)
    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    const clearBtn = page.locator('[data-testid="clear-all-button"]');
    await expect(clearBtn).toBeVisible({ timeout: 15000 });

    // Step 1: Click "Clear" -> should show inline confirmation, no dialog
    await clearBtn.click();
    expect(dialogFired).toBe(false);

    const confirmBtn = page.locator('[data-testid="confirm-clear-button"]');
    const cancelBtn = page.locator('[data-testid="cancel-clear-button"]');
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Step 2: Cancel should revert without clearing
    await cancelBtn.click();
    await expect(clearBtn).toBeVisible();
    await expect(confirmBtn).not.toBeVisible();
    await expect(page.locator('[data-testid="holding-row-MSFT"]')).toBeVisible();

    // Step 3: Click Clear again, then click Confirm Clear
    await clearBtn.click();
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify holdings cleared and empty state displayed
    await expect(page.locator('[data-testid="empty-row"]')).toBeVisible({ timeout: 10000 });
    expect(dialogFired).toBe(false);
  });

  test('TC-DESIGN-09 — Motion Safety: ticker-scroll and pulses disabled under prefers-reduced-motion', async ({ page }) => {
    await loginViaUI(page, testUser);
    // Normal motion
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const ticker = page.locator('.ticker-scroll').first();
    await expect(ticker).toBeVisible({ timeout: 15000 });
    const normalAnim = await ticker.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(normalAnim).toBe('ticker-scroll');

    // Reduced motion enabled
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();

    const reducedTicker = page.locator('.ticker-scroll').first();
    await expect(reducedTicker).toBeVisible({ timeout: 15000 });
    const reducedAnim = await reducedTicker.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(reducedAnim).toBe('none');
  });
});

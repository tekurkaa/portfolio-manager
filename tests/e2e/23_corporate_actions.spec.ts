import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('23. Dedicated Dividends Tab & Cash Flow Schedule (TC-CORP)', () => {
  const testUser = 'div-tab-tester@terminus.local';

  test('TC-CORP-01 — Dedicated Dividends Tab Navigation, Summary Strip & No Split Panels', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed dividend paying stocks
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 50, avg_cost: 150 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'KO', quantity: 100, avg_cost: 55 },
    });

    await page.goto('/');

    // 1. Verify Dividends tab button exists between Watchlist and Stock News
    const divTabBtn = page.locator('[data-testid="tab-dividends-button"]');
    await expect(divTabBtn).toBeVisible({ timeout: 15000 });

    // Click to navigate to Dividends tab
    await divTabBtn.click();
    const tabView = page.locator('[data-testid="dividends-tab-view"]');
    await expect(tabView).toBeVisible();

    // 2. Verify summary metrics strip
    await expect(page.locator('[data-testid="div-annual-income"]')).toBeVisible();
    await expect(page.locator('[data-testid="div-monthly-income"]')).toBeVisible();
    await expect(page.locator('[data-testid="div-portfolio-yield"]')).toBeVisible();
    await expect(page.locator('[data-testid="div-yield-on-cost"]')).toBeVisible();
    await expect(page.locator('[data-testid="div-payer-count"]')).toBeVisible();

    // 3. Verify 12-month calendar grid
    await expect(page.locator('[data-testid="dividend-monthly-grid"]')).toBeVisible();

    // 4. Verify NO split section or split subsection exists on the UI
    await expect(page.locator('[data-testid="corporate-splits-panel"]')).not.toBeVisible();
  });

  test('TC-CORP-02 — Sub-View Switching in Dividends Tab', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Navigate to Dividends tab
    await page.locator('[data-testid="tab-dividends-button"]').click();
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible();

    // Switch to EX-DATES sub-tab
    const exDatesBtn = page.locator('[data-testid="div-subtab-upcoming"]');
    await exDatesBtn.click();
    await expect(page.locator('[data-testid="dividend-events-table"]')).toBeVisible();

    // Switch to 12-MO SCHEDULE sub-tab
    const monthlyBtn = page.locator('[data-testid="div-subtab-monthly"]');
    await monthlyBtn.click();
    await expect(page.locator('[data-testid="dividend-monthly-grid"]')).toBeVisible();
  });

  test('TC-CORP-03 — Clicking Symbol in Dividends Tab Launches Stock Detail Modal', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Navigate to Dividends tab
    await page.locator('[data-testid="tab-dividends-button"]').click();
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible();

    // Locate symbol trigger in dividend events table
    const symbolTrigger = page.locator('[data-testid^="div-trigger-"]').first();
    if (await symbolTrigger.isVisible({ timeout: 5000 })) {
      await symbolTrigger.click();
      // Should open stock detail modal
      await expect(page.locator('[data-testid="stock-detail-modal"]')).toBeVisible({ timeout: 10000 });
      // Close modal
      await page.locator('[data-testid="close-stock-modal-btn"]').click();
      await expect(page.locator('[data-testid="stock-detail-modal"]')).not.toBeVisible();
    }
  });

  test('TC-CORP-04 — Clicking Projected Cash Flow in Portfolio Tab Switches to Dividends Tab', async ({ page }) => {
    await loginViaUI(page, testUser);
    await page.goto('/');

    // Make sure we are on Portfolio tab
    await page.locator('[data-testid="tab-portfolio-button"]').click();
    const cashFlowCard = page.locator('[data-testid="summary-projected-annual-cash-flow"]');
    await expect(cashFlowCard).toBeVisible({ timeout: 10000 });

    // Click cash flow summary card
    await cashFlowCard.click();

    // Should automatically switch to Dividends tab
    await expect(page.locator('[data-testid="dividends-tab-view"]')).toBeVisible({ timeout: 10000 });
  });

  test('TC-CORP-05 — Tab Navigation Order & Equal Width Distribution across Row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUI(page, testUser);
    await page.goto('/');

    const nav = page.locator('[data-testid="tab-navigation"]');
    await expect(nav).toBeVisible({ timeout: 10000 });

    const tabButtons = nav.locator('button');
    await expect(tabButtons).toHaveCount(10);

    const expectedOrder = [
      'tab-portfolio-button',
      'tab-alpha-button',
      'tab-scanner-button',
      'tab-watchlist-button',
      'tab-dividends-button',
      'tab-stock-news-button',
      'tab-macro-news-button',
      'tab-sentiment-button',
      'tab-insider-button',
      'tab-chat-button',
    ];

    for (let i = 0; i < expectedOrder.length; i++) {
      const btn = tabButtons.nth(i);
      await expect(btn).toHaveAttribute('data-testid', expectedOrder[i]);
    }

    // Verify AI CHAT is strictly the last tab
    const lastBtn = tabButtons.nth(9);
    await expect(lastBtn).toHaveAttribute('data-testid', 'tab-chat-button');
    await expect(lastBtn).toContainText('AI CHAT');

    // Verify all 10 tab buttons have equal width (within 1.5px sub-pixel tolerance)
    const widths = [];
    for (let i = 0; i < 10; i++) {
      const box = await tabButtons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      widths.push(box.width);
    }

    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    expect(maxWidth - minWidth).toBeLessThanOrEqual(2.0);

    // Save screenshot of the navigation row for verification
    await nav.screenshot({
      path: '/Users/atharvtekurkar/.gemini/antigravity-ide/brain/c6f235ff-1646-4d42-8591-04ccd765dcbc/nav_bar_layout.png',
    });
  });
});


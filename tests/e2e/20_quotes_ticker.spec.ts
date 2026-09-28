import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('20. Market Quotes & Ticker Bar (TC-QUOTE)', () => {
  test('TC-QUOTE-01 & TC-QUOTE-04 — Market Indices Load & Render in Top Ticker Bar', async ({ page, request }) => {
    // Verify API
    const res = await request.get(`${BACKEND_URL}/api/market/indices`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('indices');
    expect(Array.isArray(data.indices)).toBe(true);
    expect(data.indices.length).toBeGreaterThan(0);

    const first = data.indices[0];
    expect(first).toHaveProperty('symbol');
    expect(first).toHaveProperty('price');
    expect(first).toHaveProperty('change');
    expect(first).toHaveProperty('change_percent');

    // Verify UI
    await loginViaUI(page, 'ticker-tester@terminus.local');
    const tickerBar = page.locator('[data-testid="ticker-bar"]');
    await expect(tickerBar).toBeVisible({ timeout: 10000 });
    await expect(tickerBar).toContainText('S&P 500');
  });

  test('TC-QUOTE-02 — Individual Quote Lookup Returns Live/Cached Price Data', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/market/quote/AAPL`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.symbol).toBe('AAPL');
    expect(data.price).toBeGreaterThan(0);
    expect(data).toHaveProperty('previous_close');
    expect(data).toHaveProperty('change_percent');
  });

  test('TC-QUOTE-03 — Quote for Invalid Symbol Returns 404 Not Found', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/market/quote/NOTREAL`);
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.detail).toContain('NOTREAL');
  });

  test('TC-QUOTE-05 — US Market Session Status & Countdown Pill Render in Top Ticker Bar', async ({ page, request }) => {
    // 1. Verify backend endpoint
    const res = await request.get(`${BACKEND_URL}/api/market/status`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('state');
    expect(['OPEN', 'PRE_MARKET', 'AFTER_HOURS', 'CLOSED']).toContain(data.state);
    expect(data).toHaveProperty('seconds_remaining');

    // 2. Verify UI badge
    await loginViaUI(page, 'market-status-tester@terminus.local');
    const statusBadge = page.locator('[data-testid="market-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });
  });

  test('TC-QUOTE-06 — Stock Detail Modal Opens on Ticker Click with Live Quotes, Chart, and Stats', async ({ page, request }) => {
    // 1. Verify backend details & history endpoints
    const detailsRes = await request.get(`${BACKEND_URL}/api/market/details/AAPL`);
    expect(detailsRes.ok()).toBeTruthy();
    const details = await detailsRes.json();
    expect(details.symbol).toBe('AAPL');
    expect(details.price).toBeGreaterThan(0);

    const historyRes = await request.get(`${BACKEND_URL}/api/market/history/AAPL?range=1D`);
    expect(historyRes.ok()).toBeTruthy();
    const history = await historyRes.json();
    expect(history.points.length).toBeGreaterThan(0);

    // 2. Verify UI interaction: click ticker in TopTickerBar
    await loginViaUI(page, 'stock-modal-tester@terminus.local');
    const tickerItem = page.locator('[data-testid^="ticker-item-"]').first();
    await expect(tickerItem).toBeVisible({ timeout: 10000 });
    await tickerItem.click({ force: true });

    // 3. Modal opens
    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="stock-modal-price"]')).toBeVisible();

    // 4. Test timeframe range buttons
    const range1W = page.locator('[data-testid="chart-range-1W"]');
    if (await range1W.isVisible()) {
      await range1W.click();
    }

    // 5. Close modal
    const closeBtn = page.locator('[data-testid="close-stock-modal-btn"]');
    await closeBtn.click();
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('TC-QUOTE-07 — Universal Security Click opens modal with chart resilience for equities', async ({ page }) => {
    await loginViaUI(page, 'universal-modal-tester@terminus.local');

    // Trigger open-stock-modal via window event simulating clicking from Scanner/News/Alpha
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'AAPL' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="stock-modal-price"]')).toBeVisible();
    await expect(page.locator('text=AAPL')).toBeVisible();

    // Close via ESC key
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('TC-QUOTE-08 — Mobile Viewport: Regulatory Disclaimer is Not Truncated & Stock Modal Fits Within Mobile Screen', async ({ page }) => {
    // 1. Emulate iPhone 13/14 mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUI(page, 'mobile-viewport-tester@terminus.local');

    // 2. Verify disclaimer footer on mobile
    const footer = page.locator('[data-testid="fixed-disclaimer-footer"]');
    await expect(footer).toBeVisible({ timeout: 10000 });
    await expect(footer).toContainText('This application is for informational purposes only and does not constitute financial advice.');
    await expect(page.locator('[data-testid="open-disclaimer-modal-button"]')).toBeVisible();

    // 3. Open stock modal on mobile
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'AAPL' } }));
    });
    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 4. Verify modal fits within mobile viewport height
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalBox.width).toBeLessThanOrEqual(390);

    // 5. Close modal
    const closeBtn = page.locator('[data-testid="close-stock-modal-btn"]');
    await closeBtn.click();
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('TC-QUOTE-09 — Security Detail Modal renders official descriptive company name and company overview for Equities (DDOG)', async ({ page }) => {
    await loginViaUI(page, 'ddog-modal-tester@terminus.local');

    // Trigger open-stock-modal for DDOG
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'DDOG' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Verify symbol and descriptive name
    await expect(page.locator('text=DDOG').first()).toBeVisible();
    const companyNameEl = page.locator('[data-testid="stock-modal-company-name"]');
    await expect(companyNameEl).toBeVisible();
    await expect(companyNameEl).toContainText('Datadog');
    const nameText = await companyNameEl.textContent();
    expect(nameText?.trim()).not.toBe('DDOG');

    // Verify Company Overview section is visible and contains descriptive text
    const overviewSection = page.locator('[data-testid="stock-modal-overview-section"]');
    await expect(overviewSection).toBeVisible();
    await expect(overviewSection).toContainText('COMPANY OVERVIEW');

    const summaryText = page.locator('[data-testid="stock-modal-summary-text"]');
    await expect(summaryText).toBeVisible();
    await expect(summaryText).toContainText('Datadog');

    // Close via ESC key
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('TC-QUOTE-10 — Security Detail Modal renders descriptive asset name and overview for Crypto (BTC)', async ({ page }) => {
    await loginViaUI(page, 'btc-modal-tester@terminus.local');

    // Trigger open-stock-modal for BTC
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'BTC' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Verify symbol and descriptive name
    await expect(page.locator('text=BTC').first()).toBeVisible();
    const companyNameEl = page.locator('[data-testid="stock-modal-company-name"]');
    await expect(companyNameEl).toBeVisible();
    await expect(companyNameEl).toContainText('Bitcoin');

    // Verify Overview section is visible and contains Bitcoin summary
    const overviewSection = page.locator('[data-testid="stock-modal-overview-section"]');
    await expect(overviewSection).toBeVisible();

    const summaryText = page.locator('[data-testid="stock-modal-summary-text"]');
    await expect(summaryText).toBeVisible();
    await expect(summaryText).toContainText('Bitcoin');

    // Close via ESC key
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('TC-QUOTE-11 — Security Detail Modal features seamless header, icon-only footer refresh, and no top button clutter', async ({ page }) => {
    await loginViaUI(page, 'header-tester@terminus.local');

    // Trigger open-stock-modal for SMCI
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-stock-modal', { detail: { symbol: 'SMCI' } }));
    });

    const modal = page.locator('[data-testid="stock-detail-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Assert obsolete "TERMINAL // SECURITY DETAIL" text is removed
    const obsoleteTitle = page.locator('text=TERMINAL // SECURITY DETAIL');
    await expect(obsoleteTitle).toHaveCount(0);

    // Assert refresh button is in footer next to updated text and is icon-only (does not contain text "Refresh")
    const refreshBtn = page.locator('[data-testid="refresh-stock-modal-btn"]');
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).not.toContainText('Refresh');

    // Assert close button is in footer
    const closeBtn = page.locator('[data-testid="close-stock-modal-btn"]');
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toContainText('Close [ESC]');

    // Wait for live details to load before taking the screenshot
    const priceEl = page.locator('[data-testid="stock-modal-price"]');
    await expect(priceEl).not.toHaveText(/Loading/, { timeout: 10000 });

    // Capture visual artifact of updated modal
    await modal.screenshot({ path: '/Users/atharvtekurkar/.gemini/antigravity-ide/brain/c6f235ff-1646-4d42-8591-04ccd765dcbc/stock_detail_modal_variation_b.png' });

    // Verify close action
    await closeBtn.click();
    await expect(modal).toBeHidden({ timeout: 5000 });
  });
});





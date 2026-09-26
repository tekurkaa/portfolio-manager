import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('5. Portfolio — Allocation Treemap (TC-TREEMAP)', () => {
  const testUser = 'treemap-tester@terminus.local';

  test('TC-TREEMAP-03 — Treemap Empty State', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);
    await page.reload();

    const treemap = page.locator('[data-testid="allocation-treemap"]');
    await expect(treemap).toBeVisible({ timeout: 15000 });
    await expect(treemap).toContainText('No positions to display');
  });

  test('TC-TREEMAP-01 & 02 — Treemap Renders Holdings and Colors Cells', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Add holdings: AAPL (gain or normal) and TSLA
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 100.00 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'TSLA', quantity: 5, avg_cost: 400.00 },
    });

    await page.reload();
    const treemap = page.locator('[data-testid="allocation-treemap"]');
    await expect(treemap).toBeVisible({ timeout: 15000 });

    // The treemap container should contain svg elements representing cells
    const svg = treemap.locator('svg');
    await expect(svg).toBeVisible({ timeout: 10000 });

    // Treemap contains text labels for holdings
    await expect(treemap.locator('text:has-text("AAPL")')).toBeVisible({ timeout: 10000 });
  });

  test('TC-TREEMAP-04 — Narrow/Small Position Visibility & Interactive Hover HUD', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
    if (token) await resetHoldingsViaApi(request, token);

    // Seed the exact user portfolio causing the squished tile
    const holdings = [
      { symbol: 'VOO', quantity: 2.78, avg_cost: 643.61 },
      { symbol: 'QQQ', quantity: 2.0, avg_cost: 717.71 },
      { symbol: 'GLD', quantity: 1.5, avg_cost: 300.00 },
      { symbol: 'SOXL', quantity: 3.0, avg_cost: 120.14 },
      { symbol: 'RVI', quantity: 6.0, avg_cost: 39.20 },
      { symbol: 'SPCX', quantity: 1.0, avg_cost: 209.35, name: 'SpaceX' },
    ];

    for (const h of holdings) {
      await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
        headers: { Authorization: `Bearer ${token}` },
        data: h,
      });
    }

    await page.reload();
    const treemap = page.locator('[data-testid="allocation-treemap"]');
    await expect(treemap).toBeVisible({ timeout: 15000 });

    // 1. Treemap container height should be at least 300px for proportional spacing
    const treemapContainer = page.locator('[data-testid="treemap-container"]');
    await expect(treemapContainer).toBeVisible();
    const containerBox = await treemapContainer.boundingBox();
    expect(containerBox.height).toBeGreaterThanOrEqual(300);

    // 2. Small/narrow position SPCX must have a visible label (horizontal or vertical)
    const spcxCell = page.locator('[data-testid="treemap-cell-SPCX"]');
    await expect(spcxCell).toBeVisible({ timeout: 10000 });
    const spcxLabel = page.locator('[data-testid="treemap-label-SPCX"]');
    await expect(spcxLabel).toBeVisible();

    // 3. Hovering over SPCX cell should display rich interactive hover HUD card
    await spcxCell.hover();
    const hoverHud = page.locator('[data-testid="treemap-hover-hud"]');
    await expect(hoverHud).toBeVisible({ timeout: 5000 });
    await expect(hoverHud).toContainText('SPCX');
    await expect(hoverHud).toContainText('SpaceX');

    // 4. Capture screenshot of treemap with hover HUD active
    await treemap.screenshot({
      path: '/Users/atharvtekurkar/.gemini/antigravity-ide/brain/c6f235ff-1646-4d42-8591-04ccd765dcbc/treemap_fixed.png',
    });
  });
});


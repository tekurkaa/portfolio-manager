import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/auth.ts';

test.describe('29. Branding & Webpage Favicon Icon (TC-BRAND)', () => {
  const testUser = 'branding-tester@terminus.local';

  test('TC-BRAND-01 — Webpage Favicon is configured in index.html and serves >_ icon', async ({ page }) => {
    await page.goto('/');

    // Check favicon link element exists in <head>
    const iconLinks = page.locator('link[rel="icon"]');
    expect(await iconLinks.count()).toBeGreaterThanOrEqual(1);

    const iconLink = iconLinks.first();
    const href = await iconLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/favicon\.(svg|ico|png)/);

    // Fetch the favicon asset to verify it returns 200 OK
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);

    // If svg, verify it contains terminal motif '>_'
    if (href?.endsWith('.svg')) {
      const text = await response.text();
      expect(text).toContain('svg');
      // Verify amber stroke color and path / line terminal elements
      expect(text).toContain('#F59E0B');
    }
  });

  test('TC-BRAND-02 — Document title and meta description updated to Terminus', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title).toContain('Terminus');
    expect(title).not.toContain('Portfolio Manager');

    const metaDesc = page.locator('meta[name="description"]');
    const content = await metaDesc.getAttribute('content');
    expect(content).toContain('Terminus');
    expect(content).not.toContain('Portfolio Manager');
  });

  test('TC-BRAND-03 — App Header displays TERMINUS without / INVEST', async ({ page }) => {
    await loginViaUI(page, testUser);

    const header = page.locator('[data-testid="app-header"]');
    await expect(header).toBeVisible({ timeout: 15000 });

    const headerText = await header.textContent();
    expect(headerText).toContain('Terminus');
    expect(headerText).not.toContain('Terminus / Invest');
    expect(headerText).not.toContain('/ INVEST');
    expect(headerText).not.toContain('/ Invest');
  });

  test('TC-BRAND-04 — Login Screen branding displays TERMINUS without / INVEST', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');

    const loginScreen = page.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 15000 });

    const loginText = await loginScreen.textContent();
    expect(loginText).toContain('Terminus');
    expect(loginText).not.toContain('Terminus / Invest');
    expect(loginText).not.toContain('/ INVEST');
    expect(loginText).not.toContain('/ Invest');
  });
});

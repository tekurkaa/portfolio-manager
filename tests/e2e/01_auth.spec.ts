import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('1. Authentication (TC-AUTH)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
  });

  test('TC-AUTH-01 — Google OAuth Login button redirects to auth service', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="login-screen"]')).toBeVisible({ timeout: 15000 });

    const googleBtn = page.locator('[data-testid="google-login-button"]');
    await expect(googleBtn).toBeVisible();

    // Intercept navigation or check redirect destination
    const [navigation] = await Promise.all([
      page.waitForNavigation({ url: (url) => url.hostname.includes('auth.emergentagent.com'), timeout: 10000 }).catch(() => null),
      googleBtn.click(),
    ]);

    if (!navigation) {
      // In case navigation was prevented or caught before unload, check URL
      expect(page.url()).toContain('auth.emergentagent.com');
    }
  });

  test('TC-AUTH-02 — Dev Login sets session cookie and /api/auth/me succeeds', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: 'dev-tester@terminus.local', name: 'Dev Tester' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.email).toBe('dev-tester@terminus.local');
    expect(data.name).toBe('Dev Tester');
    expect(data.session_token).toBeTruthy();

    // Verify /api/auth/me returns valid session with Bearer token
    const meRes = await request.get(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.session_token}` },
    });
    expect(meRes.ok()).toBeTruthy();
    const meData = await meRes.json();
    expect(meData.email).toBe('dev-tester@terminus.local');
  });

  test('TC-AUTH-03 — Session Persistence Across Page Reload', async ({ page }) => {
    const testUser = 'persist-trader@terminus.local';
    await loginViaUI(page, testUser);

    // Verify logged in
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-badge"]')).toContainText(testUser);

    // Reload page
    await page.reload();

    // Still logged in
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="user-badge"]')).toContainText(testUser);
  });

  test('TC-AUTH-04 — Logout clears session and redirects to Login screen', async ({ page }) => {
    const testUser = 'logout-trader@terminus.local';
    await loginViaUI(page, testUser);
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();

    // Click logout
    const logoutBtn = page.locator('[data-testid="logout-button"]');
    await logoutBtn.click();

    // Verify redirected to login screen
    await expect(page.locator('[data-testid="login-screen"]')).toBeVisible({ timeout: 10000 });
  });

  test('TC-AUTH-05 — Expired / Invalid Session Cookie / Token leads to Login screen', async ({ page }) => {
    await page.goto('/');
    // Set invalid token
    await page.evaluate(() => {
      localStorage.setItem('pm_session_token', 'invalid-bogus-token-xyz');
      localStorage.setItem('terminus_disclaimer_accepted_v1', 'true');
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="login-screen"]')).toBeVisible({ timeout: 15000 });
  });

  test('TC-AUTH-06 — Auth Callback with Invalid Session ID returns 401', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/auth/callback`, {
      data: { session_id: 'completely-fake-session-id-12345' },
    });
    expect(res.status()).toBe(401);
  });
});

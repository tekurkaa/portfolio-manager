import { Page, APIRequestContext, expect } from '@playwright/test';

export const BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Logs in via the UI using the dev email login option.
 */
export async function loginViaUI(page: Page, email = 'trader@terminus.local') {
  // Guarantee disclaimer is marked accepted before any page script executes
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('terminus_disclaimer_accepted_v1', 'true');
    } catch {}
  });

  await page.goto('/');

  // If disclaimer modal is somehow already in the DOM, close it
  const disclaimerModal = page.locator('[data-testid="disclaimer-modal"]');
  if (await disclaimerModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const acceptBtn = page.locator('[data-testid="accept-disclaimer-button"]');
    await acceptBtn.click().catch(() => {});
    await expect(disclaimerModal).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  }

  // If already logged in, check if user matches or log out
  const appRoot = page.locator('[data-testid="app-root"]');
  const loginScreen = page.locator('[data-testid="login-screen"]');

  await expect(page.locator('[data-testid="login-screen"], [data-testid="app-root"]')).toBeVisible({ timeout: 15000 });

  if (await appRoot.isVisible()) {
    const userBadge = page.locator('[data-testid="user-badge"]');
    const badgeText = (await userBadge.textContent()) || '';
    if (badgeText.includes(email)) {
      // Ensure disclaimer flag in current window too
      await page.evaluate(() => localStorage.setItem('terminus_disclaimer_accepted_v1', 'true'));
      return;
    }
    await page.locator('[data-testid="logout-button"]').click();
    await expect(loginScreen).toBeVisible({ timeout: 10000 });
  }

  // Perform dev login via email form
  const emailInput = page.locator('input[placeholder="your-email@example.com"]');
  await emailInput.fill(email);
  await page.locator('[data-testid="local-login-button"]').click();

  // Handle disclaimer modal if it appears after login
  if (await disclaimerModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const acceptBtn = page.locator('[data-testid="accept-disclaimer-button"]');
    await acceptBtn.click().catch(() => {});
    await expect(disclaimerModal).not.toBeVisible({ timeout: 5000 }).catch(() => {});
  }

  await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 15000 });
}

/**
 * Fast session bootstrap by directly getting token via API and seeding browser context.
 */
export async function setupUserSession(page: Page, request: APIRequestContext, email = 'trader@terminus.local', name = 'Senior Trader') {
  const res = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
    data: { email, name },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const token = data.session_token;

  await page.addInitScript(({ t, e }) => {
    window.localStorage.setItem('pm_session_token', t);
    window.localStorage.setItem('pm_last_email', e);
    window.localStorage.setItem('pm_last_auth_provider', 'local');
    window.localStorage.setItem('terminus_disclaimer_accepted_v1', 'true');
  }, { t: token, e: email });

  await page.goto('/');
  await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 15000 });
  return token;
}

/**
 * Reset all holdings for the user via direct API call
 */
export async function resetHoldings(page: Page, request?: APIRequestContext) {
  const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));
  if (token) {
    await fetch(`${BACKEND_URL}/api/portfolio/holdings`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

/**
 * Reset holdings directly via request fixture
 */
export async function resetHoldingsViaApi(request: APIRequestContext, token: string) {
  await request.delete(`${BACKEND_URL}/api/portfolio/holdings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}


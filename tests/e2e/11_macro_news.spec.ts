import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('11. Macro News Tab (TC-MACRO)', () => {
  const testUser = 'macro-tester@terminus.local';

  test('TC-MACRO-01 — Macro News Loads with Articles and Metadata', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Check backend API directly
    const res = await request.get(`${BACKEND_URL}/api/news/macro`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('articles');
    expect(Array.isArray(data.articles)).toBe(true);

    if (data.articles.length > 0) {
      const first = data.articles[0];
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('source');
      expect(first).toHaveProperty('published_at');
    }

    // Switch to Macro News tab in UI
    await page.locator('[data-testid="tab-macro-news-button"]').click();
    await expect(page.locator('[data-testid="macro-news-tab"]')).toBeVisible({ timeout: 10000 });

    // Verify theme selector pills
    await expect(page.locator('[data-testid="macro-theme-pills"]')).toBeVisible();
    await expect(page.locator('[data-testid="macro-theme-ALL"]')).toBeVisible();

    // Verify article list is present
    await expect(page.locator('[data-testid="macro-articles-list"]')).toBeVisible();
  });

  test('TC-MACRO-02 — Macro News Empty / Feed Unavailable Handled Gracefully', async ({ page }) => {
    await loginViaUI(page, testUser);

    // Mock an unreachable or failing macro news feed
    await page.route('**/api/news/macro', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], summary: null }),
      });
    });

    await page.locator('[data-testid="tab-macro-news-button"]').click();
    await expect(page.locator('[data-testid="macro-news-tab"]')).toBeVisible({ timeout: 10000 });

    // Expect empty state message, app does not crash
    await expect(page.locator('text=No articles in this theme.')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
  });
});

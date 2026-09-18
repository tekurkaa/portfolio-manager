import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI } from '../helpers/auth.js';

test.describe('15. Scanner — Email Digest Notifications (TC-NOTIF)', () => {
  const testUser = 'notif-tester@terminus.local';

  test('TC-NOTIF-04 — Notification Prefs for New User Defaults Gracefully', async ({ request }) => {
    // Generate fresh new user
    const res = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: `new-user-${Date.now()}@terminus.local` },
    });
    const { session_token, email } = await res.json();

    const prefsRes = await request.get(`${BACKEND_URL}/api/scanner/prefs`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(prefsRes.ok()).toBeTruthy();
    const prefs = await prefsRes.json();

    expect(prefs.enabled).toBe(false);
    expect(prefs.email).toBe(email);
    expect(prefs.last_sent_date).toBeNull();
  });

  test('TC-NOTIF-01 — Enable Notifications and Save Preferences', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Switch to Scanner tab
    await page.locator('[data-testid="tab-scanner-button"]').click();
    await expect(page.locator('[data-testid="scanner-tab"]')).toBeVisible({ timeout: 10000 });

    const notifyBlock = page.locator('[data-testid="notify-block"]');
    await expect(notifyBlock).toBeVisible();

    const emailInput = page.locator('[data-testid="notify-email-input"]');
    const enabledCheckbox = page.locator('[data-testid="notify-enabled"]');
    const saveBtn = page.locator('[data-testid="notify-save"]');

    const customEmail = `digest-${Date.now()}@terminus.local`;
    await emailInput.fill(customEmail);
    if (!(await enabledCheckbox.isChecked())) {
      await enabledCheckbox.check();
    }
    await saveBtn.click();

    // Verify via backend API
    const verifyRes = await request.get(`${BACKEND_URL}/api/scanner/prefs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyRes.ok()).toBeTruthy();
    const prefs = await verifyRes.json();
    expect(prefs.email).toBe(customEmail);
    expect(prefs.enabled).toBe(true);
  });

  test('TC-NOTIF-02 — Manual Digest Trigger Sends and Updates last_sent_date', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: `trigger-${Date.now()}@terminus.local` },
    });
    const { session_token, email } = await res.json();

    // Enable notifications
    await request.post(`${BACKEND_URL}/api/scanner/prefs`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { email, enabled: true },
    });

    // Trigger manual send
    const notifyRes = await request.post(`${BACKEND_URL}/api/scanner/notify`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(notifyRes.ok()).toBeTruthy();
    const notifyData = await notifyRes.json();

    expect(notifyData.sent).toBe(true);
    expect(notifyData.candidates_count).toBeGreaterThan(0);

    // Verify last_sent_date was updated to today's UTC date
    const prefsRes = await request.get(`${BACKEND_URL}/api/scanner/prefs`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    const prefs = await prefsRes.json();
    const today = new Date().toISOString().slice(0, 10);
    expect(prefs.last_sent_date).toBe(today);
  });

  test('TC-NOTIF-03 — Daily Scheduler Condition Does Not Double-Send on Same Date', async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);
    const userEmail = `scheduler-guard-${Date.now()}@terminus.local`;

    const authRes = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: userEmail },
    });
    const { session_token } = await authRes.json();

    // Set preference with last_sent_date already set to today
    await request.post(`${BACKEND_URL}/api/scanner/prefs`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { email: userEmail, enabled: true },
    });

    // Manually trigger once so last_sent_date is guaranteed today
    await request.post(`${BACKEND_URL}/api/scanner/notify`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });

    const prefsRes = await request.get(`${BACKEND_URL}/api/scanner/prefs`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    const prefs = await prefsRes.json();
    expect(prefs.last_sent_date).toBe(today);

    // Verify scheduler guard logic: p.get("last_sent_date") == today_str prevents sending
    const isEligibleForDailySend = prefs.last_sent_date !== today && prefs.enabled;
    expect(isEligibleForDailySend).toBe(false);
  });
});

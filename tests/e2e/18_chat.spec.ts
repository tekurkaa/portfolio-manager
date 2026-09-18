import { test, expect } from '@playwright/test';
import { BACKEND_URL, loginViaUI, resetHoldingsViaApi } from '../helpers/auth.js';

test.describe('18. Chat Tab — AI Assistant (TC-CHAT)', () => {
  const testUser = 'chat-e2e-tester@terminus.local';

  test('TC-CHAT-06 — Empty Message Validation prevents Sending', async ({ page }) => {
    await loginViaUI(page, testUser);

    await page.locator('[data-testid="tab-chat-button"]').click();
    await expect(page.locator('[data-testid="chat-tab"]')).toBeVisible({ timeout: 10000 });

    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send"]');

    // Initially empty input
    await chatInput.fill('');
    await expect(sendButton).toBeDisabled();

    // Fill only spaces
    await chatInput.fill('   ');
    await expect(sendButton).toBeDisabled();
  });

  test('TC-CHAT-01 & TC-CHAT-02 & TC-CHAT-08 — Send Message, Context Awareness & Ticker Extraction', async ({ page, request }) => {
    await loginViaUI(page, testUser);
    const token = await page.evaluate(() => localStorage.getItem('pm_session_token'));

    // Seed holdings AAPL & NVDA
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'AAPL', quantity: 10, avg_cost: 150 },
    });
    await request.post(`${BACKEND_URL}/api/portfolio/holdings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { symbol: 'NVDA', quantity: 5, avg_cost: 120 },
    });

    // Test direct API message
    const res = await request.post(`${BACKEND_URL}/api/chat/message`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { message: 'What do I hold in my portfolio?' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('conversation_id');
    expect(data).toHaveProperty('answer');
    expect(data.answer).toContain('AAPL');
    expect(data.answer).toContain('NVDA');

    // Test in UI
    await page.locator('[data-testid="tab-chat-button"]').click();
    await expect(page.locator('[data-testid="chat-tab"]')).toBeVisible({ timeout: 10000 });

    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send"]');

    await chatInput.fill('What is my portfolio total return?');
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Verify response is displayed in thread
    await expect(page.locator('[data-testid="message-1"]')).toBeVisible({ timeout: 20000 });
  });

  test('TC-CHAT-03 & TC-CHAT-04 & TC-CHAT-05 — Conversation Lifecycle: Create, Persist, List, Delete', async ({ request }) => {
    const authRes = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: `chat-lifecycle-${Date.now()}@terminus.local` },
    });
    const { session_token } = await authRes.json();

    // 1. TC-CHAT-04: Auto-create conversation ID when none supplied
    const msg1Res = await request.post(`${BACKEND_URL}/api/chat/message`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { message: 'First message to create chat' },
    });
    expect(msg1Res.ok()).toBeTruthy();
    const msg1Data = await msg1Res.json();
    const convId = msg1Data.conversation_id;
    expect(convId).toBeTruthy();

    // 2. TC-CHAT-03: Append to existing conversation
    const msg2Res = await request.post(`${BACKEND_URL}/api/chat/message`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { conversation_id: convId, message: 'Second follow up question' },
    });
    expect(msg2Res.ok()).toBeTruthy();
    const msg2Data = await msg2Res.json();
    expect(msg2Data.conversation_id).toBe(convId);

    // Verify conversation thread persistence
    const convRes = await request.get(`${BACKEND_URL}/api/chat/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(convRes.ok()).toBeTruthy();
    const convDetail = await convRes.json();
    expect(convDetail.messages.length).toBe(4); // 2 user messages + 2 assistant replies

    // Verify conversation listed in GET /api/chat/conversations
    const listRes = await request.get(`${BACKEND_URL}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    const listData = await listRes.json();
    expect(listData.conversations.some((c: any) => c.conversation_id === convId)).toBe(true);

    // 3. TC-CHAT-05: Delete conversation
    const delRes = await request.delete(`${BACKEND_URL}/api/chat/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(delRes.ok()).toBeTruthy();

    // Verify 404 after deletion
    const checkRes = await request.get(`${BACKEND_URL}/api/chat/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${session_token}` },
    });
    expect(checkRes.status()).toBe(404);
  });

  test('TC-CHAT-07 — Long Message Handling without Server Failure', async ({ request }) => {
    const authRes = await request.post(`${BACKEND_URL}/api/auth/dev-login`, {
      data: { email: `chat-long-${Date.now()}@terminus.local` },
    });
    const { session_token } = await authRes.json();

    const longText = 'Explain market risk and inflation indicators in deep detail. '.repeat(50);
    expect(longText.length).toBeGreaterThan(2000);

    const res = await request.post(`${BACKEND_URL}/api/chat/message`, {
      headers: { Authorization: `Bearer ${session_token}` },
      data: { message: longText },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('answer');
    expect(data.answer.length).toBeGreaterThan(0);
  });
});

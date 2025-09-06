import { test, expect } from '@playwright/test';

const unique = () => Math.random().toString(36).slice(2);

test.describe('Auth + Chats E2E', () => {
  test('sign up → new chat visible → create chat → sign out', async ({ page, context, baseURL }) => {
    // Start clean
    await context.clearCookies();
    await page.goto('/sign-up');

    const email = `e2e_${Date.now()}_${unique()}@test.local`;
    const password = 'testtest1';

    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();

    // After sign-up, app redirects to "/" and should show New Chat button
    await page.waitForURL('**/');

    // Either the button is immediately visible or appears after handshake
    await expect(page.getByRole('button', { name: /new chat/i })).toBeVisible({ timeout: 20_000 });

    // Create a chat and land on /chat/[id]
    await page.getByRole('button', { name: /new chat/i }).click();
    await page.waitForURL('**/chat/*', { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/chat/i);

    // Open sidebar (mobile) if needed and sign out
    const signOut = page.getByRole('button', { name: /sign out/i });
    if (!(await signOut.isVisible())) {
      const menuButton = page.getByRole('button', { name: /menu/i });
      if (await menuButton.isVisible()) await menuButton.click();
    }
    await signOut.click();

    // Expect unauthenticated CTA
    await expect(page.getByRole('button', { name: /sign in to start/i })).toBeVisible();
  });
});


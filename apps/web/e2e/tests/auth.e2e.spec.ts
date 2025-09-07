import { test, expect } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const unique = () => Math.random().toString(36).slice(2);

const OUT_DIR = join(process.cwd(), 'e2e', '.out');
const CREDS_PATH = join(OUT_DIR, 'creds.json');

test.describe('Auth + Chats E2E', () => {
  test('sign up → new chat visible → create chat → sign out', async ({ page, context, baseURL }) => {
    // Start clean
    await context.clearCookies();
    await page.goto('/sign-up');

    const email = `e2e_${Date.now()}_${unique()}@test.local`;
    const password = 'testtest1';

    await page.getByPlaceholder(/email/i).fill(email);
    // Password placeholder differs on sign-up, match case-insensitively
    await page.getByPlaceholder(/password/i).first().fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();

    // After sign-up, app redirects to "/" and should show New Chat button
    await page.waitForURL('**/');
    await page.waitForLoadState('networkidle');

    // Wait for authenticated UI: New Chat visible, Sign In button hidden
    await expect(page.getByRole('button', { name: /new chat/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /sign in to start/i })).toHaveCount(0);

    // Persist creds for follow-up sign-in test
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(CREDS_PATH, JSON.stringify({ email, password }), 'utf8');
    } catch {}

    // Create a chat and land on /chat/[id]
    await page.getByRole('button', { name: /new chat/i }).click();
    await page.waitForURL('**/chat/*', { timeout: 20_000 });
    // Expect chat UI to render: look for input placeholder or loading text
    await expect(
      page.locator('textarea#message-input').or(page.getByText(/loading chat/i))
    ).toBeVisible({ timeout: 20_000 });

    // Sidebar should show the newly created chat
    await expect(page.getByText(/new chat/i).first()).toBeVisible();

    // Open sidebar (mobile) if needed and sign out
    const signOut = page.getByRole('button', { name: /sign out/i });
    if (!(await signOut.isVisible())) {
      // Open mobile sidebar if needed
      const openSidebar = page.getByRole('button', { name: /open sidebar/i });
      if (await openSidebar.isVisible()) await openSidebar.click();
    }
    await signOut.click();

    // Expect unauthenticated CTA
    await expect(page.getByRole('button', { name: /sign in to start/i })).toBeVisible();
  });

  test('sign in existing user → sees chats and not sign-in', async ({ page, context }) => {
    if (!existsSync(CREDS_PATH)) test.skip(true, 'No saved credentials from signup run');
    const { email, password } = JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as { email: string; password: string };

    await context.clearCookies();
    await page.goto('/sign-in');
    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/password/i).first().fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/');
    await page.waitForLoadState('networkidle');

    // Authenticated UI visible
    await expect(page.getByRole('button', { name: /new chat/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /sign in to start/i })).toHaveCount(0);

    // Chats list loads (may be empty if previous test didn't persist), but ensure no "No conversations" while loading
    // Trigger New Chat to ensure list shows at least one item
    await page.getByRole('button', { name: /new chat/i }).click();
    await page.waitForURL('**/chat/*', { timeout: 20_000 });
    await expect(page.getByText(/new chat/i).first()).toBeVisible();
  });
});

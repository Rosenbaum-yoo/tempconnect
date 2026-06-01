// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Login-Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("Landing page loads and shows auth buttons", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/TempConnect/);

    // Topbar nav buttons
    const nav = page.locator(".ds-topbar__nav");
    await expect(nav.locator("button", { hasText: "Anmelden" })).toBeVisible();
    // Register button (text updated to "Jetzt registrieren" in buyer-first redesign)
    await expect(nav.locator("button", { hasText: "Jetzt registrieren" })).toBeVisible();

    // Hero section visible
    await expect(page.locator(".hero h1")).toBeVisible();
  });

  test("Login with valid credentials redirects to enterprise dashboard", async ({ page }) => {
    // Register a test user via browser-side fetch (avoids Playwright APIRequestContext
    // User-Agent header parse error with Node.js HTTP module)
    await page.goto("/");
    const uniqueEmail = `e2e-login-${Date.now()}@test.local`;
    await page.evaluate(async (email) => {
      const csrfRes = await fetch("/api/csrf", { credentials: "include" });
      const { token: csrf } = await csrfRes.json();
      await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ role: "company", email, password: "LoginTest2026!", company_name: "Login Test GmbH", plan: "PLUS" }),
      });
      // Logout so we can test UI login flow
      const csrf2Res = await fetch("/api/csrf", { credentials: "include" });
      const { token: csrf2 } = await csrf2Res.json();
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf2 },
      });
    }, uniqueEmail);

    await page.goto("/");

    // Open login modal via topbar
    await page.locator(".ds-topbar__nav button", { hasText: "Anmelden" }).click();
    await expect(page.locator(".am-overlay")).toHaveClass(/open/);

    // Ensure login tab is active
    const loginTab = page.locator("#amTabLogin");
    if (await loginTab.isVisible()) await loginTab.click();

    // Fill credentials
    await page.locator("#loginEmail").fill(uniqueEmail);
    await page.locator("#loginPassword").fill("LoginTest2026!");

    // Submit
    await page.locator("#btnLogin").click();

    // After login, authIntent resolves to capacity_exchange_feed.html by default
    // (no intent stored in sessionStorage → resolveRedirect({}) fallback)
    await page.waitForURL(/capacity_exchange_feed\.html|enterprise\.html/, { timeout: 15_000 });
    await expect(page.locator(".ds-page-title")).toBeVisible();
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/");

    await page.locator(".ds-topbar__nav button", { hasText: "Anmelden" }).click();
    await expect(page.locator(".am-overlay")).toHaveClass(/open/);

    const loginTab = page.locator("#amTabLogin");
    if (await loginTab.isVisible()) await loginTab.click();

    await page.locator("#loginEmail").fill("wrong@wrong.de");
    await page.locator("#loginPassword").fill("falschespasswort");
    await page.locator("#btnLogin").click();

    await expect(page.locator("#errLogin")).toBeVisible({ timeout: 5_000 });
    expect(page.url()).not.toContain("enterprise.html");
  });

  test("Auth modal closes on Escape key", async ({ page }) => {
    await page.goto("/");

    await page.locator(".ds-topbar__nav button", { hasText: "Anmelden" }).click();
    await expect(page.locator(".am-overlay")).toHaveClass(/open/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".am-overlay")).not.toHaveClass(/open/);
  });
});

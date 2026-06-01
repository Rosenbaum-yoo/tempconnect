// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Registrierung", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("Register new company account and get redirected", async ({ page }) => {
    const uniqueEmail = `e2e-${Date.now()}@test.local`;

    await page.goto("/");

    // Open auth modal → register tab
    await page.locator(".ds-topbar__nav button", { hasText: "Jetzt registrieren" }).click();
    await expect(page.locator(".am-overlay")).toHaveClass(/open/);

    // Switch to register tab if not already there
    const registerTab = page.locator("#amTabRegister");
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }
    await expect(page.locator("#paneRegister")).toHaveClass(/active/);

    // Fill registration form
    await page.locator("#regRole").selectOption("company");
    await page.locator("#regCompany").fill("E2E Test GmbH");
    await page.locator("#regEmail").fill(uniqueEmail);
    await page.locator("#regPhone").fill("+49 40 9999999");
    await page.locator("#regPostalCode").fill("20095");
    await page.locator("#regCity").fill("Hamburg");
    await page.locator("#regPlan").selectOption("BASIS");
    await page.locator("#regPassword").fill("Test1234!");
    await page.locator("#regPassword2").fill("Test1234!");

    // Accept AGB
    await page.locator("#regAgb").check();

    // Submit
    await page.locator("#btnRegister").click();

    // After registration, authIntent resolves to capacity_exchange_feed.html by default
    // (no intent stored in sessionStorage → resolveRedirect({}) fallback)
    await page.waitForURL(/capacity_exchange_feed\.html|enterprise\.html/, { timeout: 15_000 });

    // Verify authenticated page is loaded (both pages carry .ds-page-title)
    await expect(page.locator(".ds-page-title")).toBeVisible();
  });

  test("Registration with existing email shows error", async ({ page }) => {
    await page.goto("/");

    // Open auth modal → register tab
    await page.locator(".ds-topbar__nav button", { hasText: "Jetzt registrieren" }).click();
    await expect(page.locator(".am-overlay")).toHaveClass(/open/);

    const registerTab = page.locator("#amTabRegister");
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }

    // Fill with existing seed-user email
    await page.locator("#regRole").selectOption("company");
    await page.locator("#regCompany").fill("Duplicate GmbH");
    await page.locator("#regEmail").fill("demo@firma.de");
    await page.locator("#regPhone").fill("+49 40 1111111");
    await page.locator("#regPostalCode").fill("10115");
    await page.locator("#regCity").fill("Berlin");
    await page.locator("#regPlan").selectOption("BASIS");
    await page.locator("#regPassword").fill("Test1234!");
    await page.locator("#regPassword2").fill("Test1234!");
    await page.locator("#regAgb").check();

    // Submit
    await page.locator("#btnRegister").click();

    // Error should appear (EMAIL_EXISTS)
    await expect(page.locator("#errRegister")).toBeVisible({ timeout: 5_000 });

    // Should stay on landing page
    expect(page.url()).not.toContain("enterprise.html");
  });

  test("Registration validates password mismatch client-side", async ({ page }) => {
    await page.goto("/");

    await page.locator(".ds-topbar__nav button", { hasText: "Jetzt registrieren" }).click();
    await expect(page.locator(".am-overlay")).toHaveClass(/open/);

    const registerTab = page.locator("#amTabRegister");
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }

    // Fill with mismatched passwords
    await page.locator("#regEmail").fill("mismatch@test.local");
    await page.locator("#regPassword").fill("Test1234!");
    await page.locator("#regPassword2").fill("Andere5678!");
    await page.locator("#regAgb").check();

    // Submit
    await page.locator("#btnRegister").click();

    // Client-side validation error
    await expect(page.locator("#errRegister")).toBeVisible({ timeout: 3_000 });

    // Should stay on landing page
    expect(page.url()).not.toContain("enterprise.html");
  });
});

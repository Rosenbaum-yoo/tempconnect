// @ts-check
import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

async function dismissOnboardingModal(page) {
  const skipButton = page.getByRole("button", { name: "Überspringen" });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe("Kapazitätsbörse (authentifiziert)", () => {
  test.beforeEach(async ({ page }) => {
    // Login via API before each test (no UI overhead)
    await apiLogin(page, USERS.company);
  });

  test("Feed page loads with title, filters and stats", async ({ page }) => {
    await page.goto("/public/capacity_exchange_feed.html");

    // Page title
    await expect(page.locator(".ds-page-title")).toHaveText("Marktplatz");

    // Filter bar is present
    await expect(page.locator("#ff-role")).toBeVisible();
    await expect(page.locator("#ff-city")).toBeVisible();
    await expect(page.locator("#btn-search")).toBeVisible();
    await expect(page.locator("#filter-toggle")).toBeVisible();
    await expect(page.locator("#feed-advanced-filters")).toBeHidden();
    await expect(page.locator("#ff-category")).toHaveValue("");
    await expect(page.locator("#ff-shift")).toHaveValue("");
    await expect(page.locator("#ff-compliance")).toHaveValue("");
    await expect(page.locator("#ff-headcount")).toHaveValue("");
    await expect(page.locator("#ff-avail-from")).toHaveValue("");
    await expect(page.locator("#ff-sort")).toHaveValue("newest");

    // Stats tiles loaded (value should no longer be placeholder "–")
    const activeStat = page.locator("#fs-active");
    await expect(activeStat).toBeVisible();

    // Initial feed content should appear without expanding filters
    await page.waitForFunction(() => {
      const skeletons = document.querySelectorAll(".ds-skeleton");
      return skeletons.length === 0;
    }, { timeout: 10_000 });
    await expect(page.locator("#feed")).toBeVisible();
  });

  test("Search button triggers feed reload", async ({ page }) => {
    await page.goto("/public/capacity_exchange_feed.html");
    await dismissOnboardingModal(page);

    // Wait for initial feed load (skeleton replaced by cards or empty state)
    await page.waitForFunction(() => {
      const skeletons = document.querySelectorAll(".ds-skeleton");
      return skeletons.length === 0;
    }, { timeout: 10_000 });

    // Fill a filter and search
    await page.locator("#ff-role").fill("Lagerhelfer");
    await page.locator("#btn-search").click();

    // Feed area should still be present (either cards or empty state)
    const feedOrEmpty = page.locator("#feed, #empty-state");
    await expect(feedOrEmpty.first()).toBeVisible();
  });
  test("URL parameters set defaults and open advanced filters", async ({ page }) => {
    await page.goto("/public/capacity_exchange_feed.html?shift_model=night&compliance_status=partial&min_headcount=3&sort=headcount");

    const advanced = page.locator("#feed-advanced-filters");
    await expect(advanced).toBeVisible();
    await expect(page.locator("#ff-shift")).toHaveValue("night");
    await expect(page.locator("#ff-compliance")).toHaveValue("partial");
    await expect(page.locator("#ff-headcount")).toHaveValue("3");
    await expect(page.locator("#ff-sort")).toHaveValue("headcount");
  });

  test("Inline filter expander keeps primary filters visible", async ({ page }) => {
    await page.goto("/public/capacity_exchange_feed.html");
    await dismissOnboardingModal(page);

    const toggle = page.locator("#filter-toggle");
    const advanced = page.locator("#feed-advanced-filters");

    await expect(advanced).toBeHidden();
    await toggle.click();
    await expect(advanced).toBeVisible();
    await expect(page.locator("#ff-shift")).toBeVisible();
    await toggle.click();
    await expect(advanced).toBeHidden();
    await expect(page.locator("#ff-role")).toBeVisible();
  });

  test("Last logical filter state persists within the session", async ({ page }) => {
    await page.goto("/public/capacity_exchange_feed.html");
    await dismissOnboardingModal(page);
    await page.locator("#filter-toggle").click();
    await page.locator("#ff-shift").selectOption("night");
    await page.locator("#btn-search").click();

    await page.reload();

    const advanced = page.locator("#feed-advanced-filters");
    await expect(advanced).toBeVisible();
    await expect(page.locator("#ff-shift")).toHaveValue("night");
  });

  test("Enterprise dashboard is accessible after API login", async ({ page }) => {
    await page.goto("/public/enterprise.html");

    // Should not show paywall (user is PLUS plan)
    const paywall = page.locator("#paywall");
    await expect(paywall).toBeHidden();

    // Main content visible
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator(".ds-page-title")).toBeVisible();

    // Navigation links present
    await expect(page.locator("a[href='/public/capacity_exchange_feed.html']").first()).toBeVisible();
  });

  test("Unauthenticated access shows paywall or redirect", async ({ page }) => {
    // Clear cookies to simulate unauthenticated state
    await page.context().clearCookies();

    await page.goto("/public/capacity_exchange_feed.html");

    // Either paywall is shown or slaGuard redirects — both are valid
    // Wait a moment for slaGuard.js to kick in
    await page.waitForTimeout(2_000);

    const url = page.url();
    const paywallVisible = await page.locator("#paywall").isVisible().catch(() => false);

    // Either we got redirected away from the feed, or the paywall is showing
    const redirectedAway = !url.includes("capacity_exchange_feed.html");
    expect(paywallVisible || redirectedAway).toBeTruthy();
  });
});

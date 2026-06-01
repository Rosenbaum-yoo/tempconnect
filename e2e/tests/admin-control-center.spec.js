// @ts-check
import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function dismissOnboardingModal(page) {
  const skipButton = page.getByRole("button", { name: "Überspringen" });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe("Admin-Zentrale und Org-Steuerungsseiten", () => {
  test("zeigt fuer eingeschraenkte Nutzer den Hub ohne globalen Zugriff-Blocker", async ({ page }) => {
    await apiLogin(page, USERS.companyMember);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/admin_panel.html");
    await dismissOnboardingModal(page);

    await expect(page).toHaveURL(/\/public\/admin_panel\.html/);
    await expect(page.locator("#adminContextPanel")).toBeVisible();
    await expect(page.locator("#adminHubGrid .admin-hub-card")).toHaveCount(6);
    await expect(page.locator("#adminStateBanner")).toBeVisible();
    await expect(page.locator("#adminStateBanner")).toContainText("Per-Card-Zugriff aktiv");
    await expect(page.locator("#admin-content")).toBeHidden();
    await expect(page.locator("#adminHubGrid")).toContainText("Benutzer & Organisationen");
    await expect(page.locator("#adminHubGrid")).toContainText("Plattform-Metriken");

    expect(pageErrors).toEqual([]);
  });

  test("oeffnet fuer Owner den Admin-Arbeitsbereich und respektiert Tab-Deep-Links", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/admin_panel.html?tab=audit");
    await dismissOnboardingModal(page);

    await expect(page.locator("#adminContextPanel")).toBeVisible();
    await expect(page.locator("#admin-content")).toBeVisible();
    await expect(page.locator("#tab-audit")).toHaveClass(/active/);
    await expect(page.locator("#auditActor")).toBeVisible();
    await expect(page.locator("#auditExportLink")).toBeVisible();
    await expect(page.locator("#adminHubGrid")).toContainText("SSO / SAML");

    expect(pageErrors).toEqual([]);
  });

  test("oeffnet den Organisationsbereich ueber Security-Deep-Link", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/organization.html?tab=security");
    await dismissOnboardingModal(page);

    await expect(page).toHaveURL(/\/public\/organization\.html\?tab=security/);
    await expect(page.locator(".ds-page-title")).toContainText("Organisation");
    await expect(page.locator("#panel-security")).toHaveClass(/occ-panel--active/);
    await expect(page.locator("#security-content .occ-card__title").first()).toHaveText("Sicherheitsübersicht");

    expect(pageErrors).toEqual([]);
  });

  test("soft-lockt die SSO-Seite sauber wenn Plan oder Runtime noch nicht freigeschaltet sind", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/sso_config.html");
    await dismissOnboardingModal(page);

    await expect(page).toHaveURL(/\/public\/sso_config\.html/);
    await expect(page.locator("#paywall")).toBeVisible();
    await expect(page.locator("#locked-title")).toHaveText("SSO / SAML kontrolliert gesperrt");
    await expect(page.locator("#locked-message")).toContainText("PRO");
    await expect(page.locator("#main-content")).toBeHidden();

    expect(pageErrors).toEqual([]);
  });
});

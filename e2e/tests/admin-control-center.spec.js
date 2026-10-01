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

test.describe("Verwaltung und fruehere Admin-Einstiege", () => {
  test("das fruehere Admin Panel leitet eingeschraenkte Nutzer in die Verwaltung — dort steht, wem sie vorbehalten ist", async ({ page }) => {
    // W-E9/W-E10: admin_panel.html ist eine Weiterleitung. Ein Mitglied ohne
    // Verwaltungsrecht sieht keine leere Seite, sondern den Grund.
    await apiLogin(page, USERS.companyMember);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/admin_panel.html");
    await page.waitForURL(/\/public\/organization\.html/);
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Verwaltung");
    await expect(page.locator("#vwZustand")).toContainText("Owner und Admins vorbehalten");
    await expect(page.locator("#vwInhalt")).toBeHidden();

    expect(pageErrors).toEqual([]);
  });

  test("das fruehere Admin Panel fuehrt den Owner in die Verwaltung", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/admin_panel.html?tab=audit");
    await page.waitForURL(/\/public\/organization\.html/);
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Verwaltung");
    await expect(page.locator("#vwInhalt")).toBeVisible();
    await expect(page.locator("#tab-team")).toHaveAttribute("aria-selected", "true");

    expect(pageErrors).toEqual([]);
  });

  test("oeffnet die Verwaltung ueber den alten Security-Deep-Link im Reiter Sicherheit", async ({ page }) => {
    // W-E9: alte Reiternamen (security, members, audit …) bleiben gueltig und
    // werden in der Adresszeile auf den neuen Namen umgeschrieben.
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/organization.html?tab=security");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Verwaltung");
    await expect(page.locator("#tab-sicherheit")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#panel-sicherheit")).toBeVisible();
    await expect(page.locator("#vwSicherheit")).toContainText("Schutz, der immer aktiv ist");
    await expect(page).toHaveURL(/\/public\/organization\.html\?tab=sicherheit/);

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

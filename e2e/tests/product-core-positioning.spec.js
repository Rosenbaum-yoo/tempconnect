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

test.describe("Produktkern-Positionierung", () => {
  test("zeigt im Enterprise-Hub den geschaerften Staffing-Flow und die passende Navigation", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/enterprise.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toContainText("Operations-Hub");
    await expect(page.locator("body")).toContainText("Pilot-Standard jetzt");
    await expect(page.locator("#globalSearchType")).toContainText("Bedarfe");
    await expect(page.locator("#hub-grid")).toContainText("Marktplatz");
    await expect(page.locator("#hub-grid")).toContainText("Bedarfe");
    await expect(page.locator("#hub-grid")).toContainText("Meine Deals");
    // applyAssignmentsCopy() renames the card to "Einsatzverfolgung" for company org_type users
    await expect(page.locator("#hub-grid")).toContainText("Einsatzverfolgung");
    await expect(page.locator("#hub-grid")).toContainText("Lieferantensteuerung");
    await expect(page.locator("#hub-grid")).toContainText("Steuerung & Analytik");
    await expect(page.locator(".tc-shell-nav")).toContainText("Bedarfe");
    await expect(page.locator(".tc-shell-nav")).toContainText("Deals & Einsaetze");
    await expect(page.locator(".tc-shell-nav")).toContainText("Steuerung");

    expect(pageErrors).toEqual([]);
  });

  test("verwendet Bedarf-, Einsatz- und Steuerungssprache auf den Kernseiten konsistent", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/requisitions.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Bedarfe");
    await expect(page.getByRole("button", { name: /\+ Neuer Bedarf/ })).toBeVisible();
    await expect(page.locator(".link-row")).toContainText("Lieferantenpool");
    await expect(page.locator(".link-row")).toContainText("Preisrahmen");
    await expect(page.locator(".link-row")).toContainText("Lieferantenbewertung");

    await page.goto("/public/worker-submissions-review.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toContainText("Einsätze & Zeiten");
    await expect(page.locator("body")).toContainText("Besetzung, Kundenversand und Freigaben");
    await expect(page.locator(".ds-hub-grid")).toContainText("Stundenzettel & Freigaben");
    await expect(page.locator(".hub-tabs")).toContainText("Stundenzettel-Freigaben");
    await expect(page.locator(".hub-tabs")).toContainText("Einsatzkraefte");

    await page.goto("/public/executive_dashboard.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toContainText("Steuerung & Analytik");
    await expect(page.locator("body")).toContainText("Steuerungsschicht");
    await expect(page.locator(".ds-hub-grid")).toContainText("Lieferantenpool");
    await expect(page.locator(".ds-hub-grid")).toContainText("Preisrahmen");
    await expect(page.locator(".ds-hub-grid")).toContainText("Bedarfe");

    expect(pageErrors).toEqual([]);
  });

  test("verwendet Lieferantensteuerungs- und Zeitsprache auf angrenzenden Kernseiten konsistent", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const pageErrors = collectPageErrors(page);

    await page.goto("/public/vendor_pool.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Lieferantenpool");
    await expect(page.locator("body")).toContainText("Lieferantensteuerung verbessert den Pilotkern");
    await expect(page.getByRole("button", { name: /\+ Lieferant hinzufuegen/ })).toBeVisible();
    await expect(page.locator(".link-row")).toContainText("Preisrahmen");
    await expect(page.locator(".link-row")).toContainText("Spend & Kosten");

    await page.goto("/public/rate-cards.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Preisrahmen");
    await expect(page.locator(".link-row").first()).toContainText("Lieferantenbewertung");
    await expect(page.locator("body")).toContainText("Preisrahmen-Compliance");

    await page.goto("/public/spend-analytics.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Spend & Kosten");
    await expect(page.locator(".link-row").first()).toContainText("Steuerung & Analytik");
    await expect(page.locator("body")).toContainText("Preisrahmen-Abgleich");

    await page.goto("/public/timesheets.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toContainText("Einsätze & Zeiten");
    await expect(page.locator("body")).toContainText("Kundenfreigabe");
    await expect(page.locator("#kpiBar")).toContainText("Stundenzettel gesamt");
    await expect(page.locator("thead")).toContainText("Einsatzkraft");

    await page.goto("/public/supplier_scorecard.html");
    await dismissOnboardingModal(page);

    await expect(page.locator(".ds-page-title")).toHaveText("Lieferantenbewertung");
    await expect(page.locator(".link-row")).toContainText("Lieferantenpool");
    await expect(page.locator("body")).toContainText("Lieferant auswaehlen");

    expect(pageErrors).toEqual([]);
  });

  test("positioniert Website-, Pricing- und Demo-Surfaces buyer-first", async ({ page }) => {
    const pageErrors = collectPageErrors(page);

    await page.goto("/");

    await expect(page.locator("body")).toContainText("buyer-first VMS-light");
    await expect(page.locator("body")).toContainText("Diese 4 Flows muessen vor Pilotkunden sitzen");
    await expect(page.locator("body")).toContainText("Buyer-Fit");
    await expect(page.locator("body")).toContainText("DEMO prueft die Story, PLUS prueft den echten Kernflow");
    await expect(page.locator("body")).not.toContainText("Belohnungsprogramm");
    await expect(page.locator("body")).not.toContainText("Bounties");
    await expect(page.getByRole("button", { name: "Als Einsatzunternehmen starten" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Als Einsatzunternehmen starten" }).first().click();
    await expect(page.locator("#regRole")).toHaveValue("company");
    await expect(page.locator("#regPlan")).toHaveValue("PLUS");
    await page.evaluate(() => window.closeAuth());
    await page.getByRole("button", { name: "Als Personaldienstleister registrieren" }).click();
    await expect(page.locator("#regRole")).toHaveValue("agency");
    await expect(page.locator("#regPlan")).toHaveValue("BASIS");
    await page.evaluate(() => window.closeAuth());

    await page.goto("/public/pricing.html");

    await expect(page.locator(".audience-toggle")).toContainText("Primärer ICP: Einsatzunternehmen");
    await expect(page.locator("body")).toContainText("Voller Pilot-Mindeststandard ab PLUS");
    await expect(page.locator("body")).toContainText("Lieferantensteuerung");
    await expect(page.locator("body")).toContainText("Preisrahmen");
    // Multiple "PLUS als Pilot starten" buttons on pricing page (per audience section) — .first() is intentional
    await expect(page.getByRole("button", { name: "PLUS als Pilot starten" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Individuellen Tarif anfragen" }).first()).toBeVisible();

    await page.goto("/demo.html");

    await expect(page.locator("body")).toContainText("Primäre Demo-Perspektive");
    await expect(page.locator("body")).toContainText("Pilot-Demo-Standard");
    await expect(page.locator("body")).toContainText("Einsatzunternehmen / Disposition");

    await page.goto("/public/about.html");

    await expect(page.locator(".ds-page-subtitle")).toContainText("buyer-first VMS-light");

    await page.goto("/public/enterprise_anfrage.html");

    await expect(page).toHaveURL(/\/public\/enterprise_anfrage\.html$/);
    await expect(page.locator("body")).toContainText("Individueller Tarif");
    await expect(page.locator("body")).toContainText("Kostenvorschau");

    expect(pageErrors).toEqual([]);
  });
});

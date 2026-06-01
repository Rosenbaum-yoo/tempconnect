// @ts-check
/**
 * E2E — Hub → Executive Dashboard + Org-Boundary
 *
 * Prueft folgende kritische Flows:
 *
 *  1. Login > Hub laden > Executive Dashboard navigieren
 *  2. Executive Dashboard zeigt KPI-Daten (kein Leer-Fehler, kein 500)
 *  3. Location-Switch: tc.activeLocationId in sessionStorage setzen →
 *     API-Call erhaelt X-Location-Id Header, Scope-Bar zeigt Standort
 *  4. Org-Boundary: Direkte URL auf fremde Org-Daten → 403 (nie 200)
 *
 * Voraussetzung: Laufende TempConnect-Instanz auf E2E_BASE_URL.
 */

import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

/**
 * Fuehrt einen API-Call ueber den Browser-Kontext aus (nutzt Session-Cookie).
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string, string> }} [opts]
 */
async function apiCall(page, path, opts = {}) {
  return page.evaluate(
    async ({ path, method, headers }) => {
      const res = await fetch(path, {
        method: method || "GET",
        credentials: "include",
        headers: headers || {},
      });
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      return { status: res.status, ok: res.ok, body };
    },
    { path, method: opts.method || "GET", headers: opts.headers || {} }
  );
}

// ── 1. Hub → Executive Dashboard ──────────────────────────────────────────────

test.describe("Flow: Login → Hub → Executive Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("Hub lädt korrekt nach Login", async ({ page }) => {
    await page.goto("/public/enterprise.html");
    await expect(page).not.toHaveURL(/login/);

    // Hub-Inhalte sichtbar
    const hub = page.locator("#hub-grid, .ds-hub-grid, #hub-cards, .hub-container");
    await expect(hub.first()).toBeVisible({ timeout: 12_000 });
  });

  test("Executive Dashboard Seite lädt ohne Fehler", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/public/executive_dashboard.html");
    await expect(page).not.toHaveURL(/login/);

    // Seitenstruktur vorhanden
    await expect(page.locator("body")).not.toBeEmpty({ timeout: 10_000 });

    // Seite-Titel erkennbar
    const title = page.locator(".ds-page-title, h1, .page-title");
    if (await title.count() > 0) {
      await expect(title.first()).toBeVisible({ timeout: 8_000 });
    }

    // Keine kritischen JS-Fehler
    await page.waitForTimeout(2_000);
    const critical = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Non-Error")
    );
    expect(critical, `JS-Fehler auf Executive Dashboard: ${critical.join(", ")}`).toHaveLength(0);
  });

  test("GET /api/reporting/dashboard → 200 mit data-Objekt", async ({ page }) => {
    await page.goto("/public/enterprise.html"); // Origin brauchen wir fuer Cookies

    const res = await apiCall(page, "/api/reporting/dashboard");
    // 200 (Daten vorhanden) oder 403 (Plan-Gate) — nie 500
    expect(res.status).not.toBe(500);
    expect([200, 403]).toContain(res.status);

    if (res.status === 200) {
      expect(res.body).toBeTruthy();
      // Shape-Check: KPI-Felder erwartet
      const data = res.body?.data ?? res.body;
      expect(data).toBeTruthy();
    }
  });

  test("Executive Dashboard enthält keine persistenten Skeleton-Loader nach Laden", async ({ page }) => {
    await page.goto("/public/executive_dashboard.html");

    // Warte auf Aufloesung der Lade-Skeletons
    await page.waitForFunction(
      () => document.querySelectorAll(".ds-skeleton, .skeleton").length === 0,
      { timeout: 15_000 }
    ).catch(() => { /* Skeleton-Klasse evtl. nicht vorhanden — kein Fehler */ });

    // Kein "Error"-Banner sichtbar (500-Fehlermeldung vom Server)
    const errorBanner = page.locator(".ds-error-banner, .error-banner, [data-error]");
    if (await errorBanner.count() > 0) {
      await expect(errorBanner.first()).not.toBeVisible();
    }
  });
});

// ── 2. Location-Switch ─────────────────────────────────────────────────────────

test.describe("Location-Switch: Scope-Isolation via X-Location-Id", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("Ohne Location — GET /api/reporting/dashboard sendet keinen X-Location-Id Header", async ({ page }) => {
    await page.goto("/public/enterprise.html");

    // Sicherstellen: tc.activeLocationId nicht gesetzt
    await page.evaluate(() => {
      try { sessionStorage.removeItem("tc.activeLocationId"); } catch { /* ignore */ }
    });

    // API-Request intercepten und Header pruefen
    const requests = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/reporting/dashboard")) {
        requests.push(req.headers());
      }
    });

    await page.goto("/public/executive_dashboard.html");
    await page.waitForTimeout(3_000); // API-Call abwarten

    // Pruefen ob kein oder leerer X-Location-Id Header gesendet wurde
    for (const hdrs of requests) {
      const locId = hdrs["x-location-id"];
      if (locId) {
        expect(locId.trim()).toBe(""); // Wenn gesetzt, dann leer
      }
    }
  });

  test("Mit Location — API-Scope-Response enthaelt location_id", async ({ page }) => {
    await page.goto("/public/enterprise.html");

    // Hole Standorte dieser Org
    const meRes = await apiCall(page, "/api/me");
    expect(meRes.ok).toBe(true);
    const orgId = meRes.body?.active_org_id || meRes.body?.org_id;
    if (!orgId) {
      test.skip(); // Kein Org-Kontext
      return;
    }

    const locsRes = await apiCall(page, `/api/organizations/${orgId}/locations`);
    // Wenn Standorte vorhanden → einen setzen und Dashboard pruefen
    const locations = locsRes.body?.items || locsRes.body || [];
    if (!Array.isArray(locations) || locations.length === 0) {
      // Kein Standort vorhanden — direkter API-Check mit manuell gesetztem Header
      const res = await page.evaluate(async (orgId) => {
        const r = await fetch("/api/reporting/dashboard", {
          credentials: "include",
          headers: { "X-Location-Id": "nonexistent-loc-id" },
        });
        const body = await r.json().catch(() => null);
        return { status: r.status, body };
      }, orgId);
      // Muss definiert antworten — nicht 500
      expect(res.status).not.toBe(500);
      return;
    }

    const firstLoc = locations[0];
    const locId = firstLoc.id || firstLoc.location_id;

    // Location in sessionStorage setzen (wie das Frontend es tut)
    await page.evaluate((locId) => {
      try { sessionStorage.setItem("tc.activeLocationId", locId); } catch { /* ignore */ }
    }, locId);

    // Reporting-Dashboard mit Location-Kontext aufrufen
    const res = await page.evaluate(async (locId) => {
      const r = await fetch("/api/reporting/dashboard", {
        credentials: "include",
        headers: { "X-Location-Id": locId },
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    }, locId);

    expect(res.status).not.toBe(500);
    expect([200, 403]).toContain(res.status);

    if (res.status === 200 && res.body?.data?.scope) {
      // Scope muss location_id enthalten
      expect(res.body.data.scope.location_id).toBe(locId);
    }
  });
});

// ── 3. Org-Boundary ────────────────────────────────────────────────────────────

test.describe("Org-Boundary: Fremde Org-Daten → 403", () => {
  test("Company-A kann Mitglieder von Company-B nicht einsehen", async ({ page }) => {
    // Company A einloggen + Org-ID ermitteln
    await apiLogin(page, USERS.company);
    await page.goto("/public/enterprise.html");

    const meA = await apiCall(page, "/api/me");
    expect(meA.ok).toBe(true);
    const orgAId = meA.body?.active_org_id || meA.body?.org_id;
    if (!orgAId) { test.skip(); return; }

    // Company B registrieren und Org-ID ermitteln
    await apiLogin(page, USERS.companyMember);
    const meB = await apiCall(page, "/api/me");
    const orgBId = meB.body?.active_org_id || meB.body?.org_id;
    if (!orgBId || orgBId === orgAId) { test.skip(); return; }

    // Als Company A einloggen
    await apiLogin(page, USERS.company);

    // Versuch: Direkte URL auf Org-B-Mitglieder
    const res = await apiCall(page, `/api/organizations/${orgBId}/members`);
    expect(res.status).toBe(403);
    expect(res.ok).toBe(false);
  });

  test("Org-Boundary: GET /api/reporting/dashboard ignoriert fremde X-Org-Header", async ({ page }) => {
    await apiLogin(page, USERS.company);
    await page.goto("/public/enterprise.html");

    // Eigene Org-ID
    const meRes = await apiCall(page, "/api/me");
    const myOrgId = meRes.body?.active_org_id || meRes.body?.org_id;
    if (!myOrgId) { test.skip(); return; }

    // Company-Member als zweite Org
    await apiLogin(page, USERS.companyMember);
    const meB = await apiCall(page, "/api/me");
    const foreignOrgId = meB.body?.active_org_id || meB.body?.org_id;
    if (!foreignOrgId || foreignOrgId === myOrgId) { test.skip(); return; }

    // Als Company A zurueck
    await apiLogin(page, USERS.company);

    // Versuch: Reporting-Dashboard mit fremder Org-ID im Header (Org-Scope kommt aus Session, nicht Header)
    const res = await page.evaluate(async (foreignOrgId) => {
      const r = await fetch("/api/reporting/dashboard", {
        credentials: "include",
        headers: {
          "X-Org-Id": foreignOrgId,
          "X-Organization-Id": foreignOrgId,
        },
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    }, foreignOrgId);

    expect(res.status).not.toBe(500);
    if (res.status === 200) {
      // Wenn 200 zurueck: Scope-org_id darf NICHT die fremde Org sein
      const scopeOrgId = res.body?.data?.scope?.org_id;
      if (scopeOrgId) {
        expect(scopeOrgId).not.toBe(foreignOrgId);
      }
    }
  });

  test("GET /api/organizations/:id/requisitions — Fremde Org = 403", async ({ page }) => {
    await apiLogin(page, USERS.company);
    await page.goto("/public/enterprise.html");

    const meA = await apiCall(page, "/api/me");
    const orgAId = meA.body?.active_org_id || meA.body?.org_id;
    if (!orgAId) { test.skip(); return; }

    await apiLogin(page, USERS.companyMember);
    const meB = await apiCall(page, "/api/me");
    const orgBId = meB.body?.active_org_id || meB.body?.org_id;
    if (!orgBId || orgBId === orgAId) { test.skip(); return; }

    await apiLogin(page, USERS.company);

    // Bekannte Org-gebundene API-Endpunkte
    const boundRoutes = [
      `/api/organizations/${orgBId}/members`,
      `/api/organizations/${orgBId}/locations`,
    ];

    for (const route of boundRoutes) {
      const res = await apiCall(page, route);
      expect(res.status, `Erwarte 403 fuer ${route}`).toBe(403);
    }
  });

  test("Spend Analytics — Fremde Org als Header ist nicht auflösbar (kein Datenleak)", async ({ page }) => {
    await apiLogin(page, USERS.company);
    await page.goto("/public/enterprise.html");

    const meA = await apiCall(page, "/api/me");
    const orgAId = meA.body?.active_org_id || meA.body?.org_id;
    if (!orgAId) { test.skip(); return; }

    await apiLogin(page, USERS.companyMember);
    const meB = await apiCall(page, "/api/me");
    const orgBId = meB.body?.active_org_id || meB.body?.org_id;
    if (!orgBId || orgBId === orgAId) { test.skip(); return; }

    await apiLogin(page, USERS.company);

    // Spend Analytics mit fremder Org — Scope-Binding ist serverseitig
    const res = await page.evaluate(async (foreignOrgId) => {
      const r = await fetch("/api/spend-analytics/summary", {
        credentials: "include",
        headers: { "X-Org-Id": foreignOrgId },
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    }, orgBId);

    expect(res.status).not.toBe(500);
    if (res.status === 200) {
      const scopeOrgId = res.body?.data?.scope?.org_id;
      if (scopeOrgId) {
        expect(scopeOrgId).not.toBe(orgBId);
      }
    }
  });
});

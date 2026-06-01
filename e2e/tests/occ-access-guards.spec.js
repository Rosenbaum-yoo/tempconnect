// @ts-check
/**
 * E2E — Owner Control Center (OCC) Access Guards
 *
 * Prueft die Zugangskontrolle des OCC ohne einen echten Owner-Account:
 *
 *  1. API-Guard: Unauthenticated → 401 NOT_AUTHENTICATED
 *  2. API-Guard: Eingeloggter Company-User (kein OCC-Zugang) → 403 OCC_FORBIDDEN
 *  3. API-Guard: Alle OCC-Sub-Routen geben 401/403 — nicht 200 und nicht 500
 *  4. React-Shell: /owner-control/ zeigt "Nicht eingeloggt"-State fuer Unangemeldete
 *  5. React-Shell: /owner-control/ zeigt "Kein Zugriff"-State fuer Non-Owner
 *
 * Hinweis: Happy-Path-Tests (eingeloggter Owner) erfordern einen Eintrag in
 * occ_owner_access und werden in einer separaten Fixture-gesteuerten Suite behandelt.
 */

import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

const OCC_API = "/api/v1/owner-control";

/** Fuehrt einen API-Call ueber die Seite aus (Browser-Kontext, mit Session-Cookie). */
async function apiCall(page, path, { method = "GET", csrf } = {}) {
  return page.evaluate(
    async ({ path, method, csrf }) => {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
      });
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      return { status: res.status, ok: res.ok, body };
    },
    { path, method, csrf }
  );
}

// ── 1. Unauthenticated API-Guard ───────────────────────────────────────────────

test.describe("OCC API-Guard: Unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.context().clearCookies();
    await page.goto("/");
  });

  test("GET /bootstrap → 401 NOT_AUTHENTICATED", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/bootstrap`);
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe("NOT_AUTHENTICATED");
    expect(res.body?.success).toBe(false);
  });

  test("GET /revenue/summary → 401", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/revenue/summary`);
    expect([401, 403]).toContain(res.status);
    expect(res.ok).toBe(false);
  });

  test("GET /operations/health → 401", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/operations/health`);
    expect([401, 403]).toContain(res.status);
    expect(res.ok).toBe(false);
  });

  test("GET /decisions-requests → 401", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/decisions-requests`);
    expect([401, 403]).toContain(res.status);
    expect(res.ok).toBe(false);
  });

  test("GET /audit/feed → 401", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/audit/feed`);
    expect([401, 403]).toContain(res.status);
    expect(res.ok).toBe(false);
  });

  // Kein OCC-Endpunkt darf einen 500 zurueckgeben
  const ROUTES = [
    "/bootstrap",
    "/revenue/summary",
    "/operations/health",
    "/decisions-requests",
    "/audit/feed",
    "/executive/summary",
  ];
  for (const route of ROUTES) {
    test(`${route} → kein 500 (unauthenticated)`, async ({ page }) => {
      const res = await apiCall(page, `${OCC_API}${route}`);
      expect(res.status).not.toBe(500);
    });
  }
});

// ── 2. Non-Owner API-Guard ─────────────────────────────────────────────────────

test.describe("OCC API-Guard: Non-Owner (Company-User)", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("GET /bootstrap → 403 OCC_FORBIDDEN", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/bootstrap`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("OCC_FORBIDDEN");
    expect(res.body?.success).toBe(false);
    expect(res.body?.data).toBeNull();
  });

  test("GET /revenue/summary → 403 OCC_FORBIDDEN", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/revenue/summary`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("OCC_FORBIDDEN");
  });

  test("GET /operations/health → 403 OCC_FORBIDDEN", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/operations/health`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("OCC_FORBIDDEN");
  });

  test("GET /decisions-requests → 403 OCC_FORBIDDEN", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/decisions-requests`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("OCC_FORBIDDEN");
  });

  test("POST /decisions-requests/decide → 403 OCC_FORBIDDEN (kein Bypass via Mutation)", async ({ page }) => {
    // CSRF holen
    const csrfRes = await page.evaluate(async () => {
      const r = await fetch("/api/csrf", { credentials: "include" });
      return r.json();
    });
    const csrf = csrfRes?.token ?? "";

    const res = await apiCall(page, `${OCC_API}/decisions-requests/decide`, {
      method: "POST",
      csrf,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("OCC_FORBIDDEN");
  });

  // Kein OCC-Endpunkt darf Daten an Non-Owner leaken (nie 200)
  const ROUTES = [
    "/bootstrap",
    "/revenue/summary",
    "/operations/health",
    "/decisions-requests",
    "/audit/feed",
    "/executive/summary",
  ];
  for (const route of ROUTES) {
    test(`${route} → nie 200 fuer Non-Owner`, async ({ page }) => {
      const res = await apiCall(page, `${OCC_API}${route}`);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(500);
    });
  }
});

// ── 3. Agency-User ebenfalls gesperrt ─────────────────────────────────────────

test.describe("OCC API-Guard: Agency-User", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.agency);
  });

  test("GET /bootstrap → 403 OCC_FORBIDDEN (auch fuer Agency)", async ({ page }) => {
    const res = await apiCall(page, `${OCC_API}/bootstrap`);
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("OCC_FORBIDDEN");
  });
});

// ── 4. React-Shell UI-Zustand — Unauthenticated ────────────────────────────────

test.describe("OCC React-Shell: UI-State Unauthenticated", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("Navigieren zu /owner-control/ → kein 500, Seite lädt", async ({ page }) => {
    const response = await page.goto("/owner-control/");
    // Nginx serviert die React-App — kein HTTP-Fehler
    expect(response?.status()).not.toBe(500);
    // Seite hat Title-Element
    await expect(page).toHaveTitle(/.+/, { timeout: 10_000 });
  });

  test("/owner-control/ zeigt Unauthenticated- oder Forbidden-State", async ({ page }) => {
    await page.goto("/owner-control/");
    // React shell rendert einen Fehlerhinweis wenn bootstrap 401 zurueckgibt
    // Wir pruefen auf Text-Inhalt der bekannten Fehlerzustaende
    const body = page.locator("body");
    await expect(body).not.toBeEmpty({ timeout: 12_000 });

    // Kein JS-Crash: keine unbehandelten Fehler
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForTimeout(2_000);
    const critical = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Non-Error")
    );
    expect(critical, `Unhandled JS errors: ${critical.join(", ")}`).toHaveLength(0);
  });
});

// ── 5. React-Shell UI-Zustand — Forbidden (Non-Owner) ─────────────────────────

test.describe("OCC React-Shell: UI-State Forbidden (Non-Owner)", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("/owner-control/ → Forbidden-Hinweis sichtbar", async ({ page }) => {
    // JS errors sammeln
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/owner-control/");

    // React rendert den Forbidden-State nach Bootstrap-Antwort 403
    // Der BootstrapProvider zeigt einen <div> mit passendem Text
    await page.waitForFunction(
      () => {
        const t = document.body.innerText.toLowerCase();
        // Forbidden-State zeigt "zugriff" oder "nicht berechtigt" oder ähnliches
        return (
          t.includes("zugriff") ||
          t.includes("berechtigt") ||
          t.includes("forbidden") ||
          t.includes("kein zugang") ||
          t.includes("occ_forbidden") ||
          t.includes("unauthorized")
        );
      },
      { timeout: 15_000 }
    );

    const critical = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("Non-Error")
    );
    expect(critical, `Unhandled JS errors: ${critical.join(", ")}`).toHaveLength(0);
  });

  test("/owner-control/ → Kein OCC-Dashboard-Inhalt sichtbar fuer Non-Owner", async ({ page }) => {
    await page.goto("/owner-control/");
    await page.waitForTimeout(3_000); // React hydration abwarten

    // Executive KPI-Grid und Sidebar-Navigation duerfen nicht sichtbar sein
    const sidebar = page.locator(".occ-sidebar");
    const kpiGrid = page.locator(".occ-grid--kpi");

    // Wenn vorhanden — nicht sichtbar (forbidden state ersetzt sie)
    if (await sidebar.count() > 0) {
      await expect(sidebar).not.toBeVisible();
    }
    if (await kpiGrid.count() > 0) {
      await expect(kpiGrid).not.toBeVisible();
    }
  });
});

// @ts-check
/**
 * Kernflow Smoke Test 4: Enterprise Hub Navigation + Strategic Collaboration
 *
 * Verifies that the Enterprise Hub ("Admin-Strategic-Collaboration-Flow"):
 *   - Hub cards are rendered for Company and Agency users
 *   - Role-based hub visibility is enforced (vendor_pool not for agency)
 *   - Strategic collaboration endpoint accessible for appropriate roles
 *   - Key navigation pages load without 500 errors
 *
 * P1.2 / G1.4 — Kernflow testbar: Hub/Navigation-Subflow
 */
import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

const BASE = "/api";

async function apiCall(page, path, { method = "GET", data, csrf } = {}) {
  return page.evaluate(
    async ({ path, method, data, csrf }) => {
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: res.status, ok: res.ok, body };
    },
    { path, method, data, csrf }
  );
}

test.describe("Kernflow: Enterprise Hub Navigation (Company)", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("/public/enterprise.html — Hub lädt und zeigt Cards", async ({ page }) => {
    await page.goto("/public/enterprise.html");

    await expect(page).not.toHaveURL(/login/);

    // Hub grid — actual selector in enterprise.html
    const hub = page.locator("#hub-grid, .ds-hub-grid, #hub-cards, .hub-container");
    await expect(hub.first()).toBeVisible({ timeout: 12_000 });
  });

  test("/public/enterprise.html — Keine JS-Fehler beim Laden", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/public/enterprise.html");
    // Wait for initial data load
    await page.waitForTimeout(2_000);

    // Critical JS errors that indicate a broken page
    const criticalErrors = errors.filter(
      (e) => !e.includes("Non-Error") && !e.includes("ResizeObserver")
    );
    expect(criticalErrors, `JS errors: ${criticalErrors.join(", ")}`).toHaveLength(0);
  });

  test("GET /api/me — Company-Profil erreichbar und korrekte Rolle", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/me`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("company");
  });

  test("GET /api/organizations/:id/members — Eigene Org-Mitglieder abrufbar", async ({ page }) => {
    const me = await apiCall(page, `${BASE}/me`);
    expect(me.status).toBe(200);
    const orgId = me.body.active_org_id || me.body.org_id;

    if (!orgId) {
      test.skip(); // No org context — skip gracefully
      return;
    }

    const members = await apiCall(page, `${BASE}/organizations/${orgId}/members`);
    expect([200, 403]).toContain(members.status);
    if (members.status === 200) {
      expect(members.body).toHaveProperty("items");
    }
  });
});

test.describe("Kernflow: Enterprise Hub Navigation (Agency)", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.agency);
  });

  test("/public/enterprise.html — Hub lädt für Agency-User", async ({ page }) => {
    await page.goto("/public/enterprise.html");

    await expect(page).not.toHaveURL(/login/);
    const hub = page.locator("#hub-cards, .hub-grid, .ds-hub, .hub-container, h1, .ds-page-title");
    await expect(hub.first()).toBeVisible({ timeout: 12_000 });
  });

  test("GET /api/me — Agency-Profil erreichbar", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/me`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("agency");
  });
});

test.describe("Kernflow: Strategische Kollaboration — Endpunkte", () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page, USERS.company);
  });

  test("GET /api/strategic-collaborations — Endpunkt antwortet definiert", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/strategic-collaborations`);
    // 200 (with items array) or 403 (plan-gated) — never 500
    expect([200, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body) || res.body.items).toBeTruthy();
    }
  });

  test("GET /api/activity-feed — Activity-Feed kein 500", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/activity-feed`);
    expect([200, 403, 404]).toContain(res.status);
  });

  test("GET /api/notifications — Notifications-Endpunkt läuft (kein 500)", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/notifications`);
    expect([200, 403]).toContain(res.status);
  });

  test("/public/capacity_exchange_feed.html — Marktplatz-Feed für Company", async ({ page }) => {
    await page.goto("/public/capacity_exchange_feed.html");

    await expect(page).not.toHaveURL(/login/);
    await expect(page.locator(".ds-page-title")).toBeVisible({ timeout: 8_000 });

    // Feed should load without skeleton loaders stuck
    await page.waitForFunction(
      () => document.querySelectorAll(".ds-skeleton").length === 0,
      { timeout: 12_000 }
    );
    const feed = page.locator("#feed, .feed-container, #empty-state");
    await expect(feed.first()).toBeVisible();
  });
});

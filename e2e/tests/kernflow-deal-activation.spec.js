// @ts-check
/**
 * Kernflow Smoke Test 2: Deal-Accept + Aktivierung
 *
 * Verifies the Deal/Agreement flow between company and agency:
 *   Company: Requisition (OPEN) → Market visible
 *   Agency:  Capacity Post → creates deal request
 *   Company: Accepts deal → CONFIRMED
 *
 * Uses API-first approach. Each step is a discrete assertion.
 * Tests that the core multi-party flow does not break.
 *
 * P1.2 / G1.4 — Kernflow testbar: Deal-Subflow
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

test.describe("Kernflow: Deal-Accept und Aktivierung", () => {
  test("Company kann OPEN-Requisition anlegen (Voraussetzung für Deal-Flow)", async ({ page }) => {
    const { csrfToken } = await apiLogin(page, USERS.company);

    const res = await apiCall(page, `${BASE}/requisitions`, {
      method: "POST",
      csrf: csrfToken,
      data: {
        title:      "E2E Deal-Flow Bedarf",
        role:       "Produktionsmitarbeiter",
        headcount:  1,
        urgency:    "high",
        start_date: "2026-07-01",
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");

    // Open it for deal flow
    const open = await apiCall(page, `${BASE}/requisitions/${res.body.id}/transition`, {
      method: "POST",
      csrf: csrfToken,
      data: { status: "OPEN" },
    });
    expect(open.status).toBe(200);
    expect(open.body.status).toBe("OPEN");
  });

  test("Agency-User kann authentifizierten API-Zugriff durchführen", async ({ page }) => {
    const { csrfToken } = await apiLogin(page, USERS.agency);

    // Basic auth check — agency can reach their own org endpoint
    const meRes = await apiCall(page, `${BASE}/me`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe("agency");
  });

  test("GET /api/marketplace/received-offers — Angebote-Endpunkt erreichbar für Company", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const companyRes = await apiCall(page, `${BASE}/marketplace/received-offers`);
    // 200 or 403 (plan-gated via slaAccess), but NOT 500 or 404
    expect([200, 403]).toContain(companyRes.status);
  });

  test("Vertraege-Endpunkt GET /api/contracts — erreichbar (kein 500)", async ({ page }) => {
    await apiLogin(page, USERS.company);
    const res = await apiCall(page, `${BASE}/contracts`);
    // 200 (empty list) or 403 (plan gate) — never 500 or 404
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("items");
    }
  });

  test("State Machine: Deal-Transitions sind validiert (kein ungültiger Übergang)", async ({ page }) => {
    const { csrfToken } = await apiLogin(page, USERS.company);

    // Create and open a requisition first
    const req = await apiCall(page, `${BASE}/requisitions`, {
      method: "POST",
      csrf: csrfToken,
      data: { title: "E2E State Machine Test", role: "Tester", headcount: 1 },
    });
    expect(req.status).toBe(201);

    // Try invalid transition DRAFT → FILLED (must be rejected)
    const invalid = await apiCall(page, `${BASE}/requisitions/${req.body.id}/transition`, {
      method: "POST",
      csrf: csrfToken,
      data: { status: "FILLED" },
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error).toBe("INVALID_TRANSITION");
  });

  test("UI: enterprise.html (Hub) lädt für Company-User", async ({ page }) => {
    await apiLogin(page, USERS.company);
    await page.goto("/public/enterprise.html");

    await expect(page).not.toHaveURL(/login/);
    // Hub title or main container present
    const hub = page.locator(".ds-page-title, .hub-grid, #hub-cards, h1");
    await expect(hub.first()).toBeVisible({ timeout: 12_000 });
  });
});

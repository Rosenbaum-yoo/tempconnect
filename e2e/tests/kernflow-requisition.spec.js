// @ts-check
/**
 * Kernflow Smoke Test 1: Requisition (Bedarfsanforderung)
 *
 * Verifies the full Requisition lifecycle a company user can perform:
 *   CREATE (DRAFT) → OPEN (status transition) → LIST → GET detail
 *
 * Uses API-first approach via browserJson to avoid UI flakiness.
 * UI check: requisitions page loads and is accessible after login.
 *
 * P1.2 / G1.4 — Kernflow testbar: Requisition-Subflow
 */
import { test, expect } from "@playwright/test";
import { apiLogin, USERS } from "../helpers/auth.js";

const BASE = "/api";

async function csrfAndLogin(page, user) {
  return apiLogin(page, user);
}

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

test.describe("Kernflow: Requisition-Lifecycle", () => {
  let csrf;

  test.beforeEach(async ({ page }) => {
    const result = await csrfAndLogin(page, USERS.company);
    csrf = result.csrfToken;
  });

  test("POST /api/requisitions — Company kann Bedarf anlegen (DRAFT)", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/requisitions`, {
      method: "POST",
      csrf,
      data: {
        title:      "E2E Testbedarf Lagerlogistik",
        role:       "Lagerhelfer",
        headcount:  2,
        urgency:    "normal",
        start_date: "2026-07-01",
        end_date:   "2026-09-30",
      },
    });

    expect(res.status, `Create failed: ${JSON.stringify(res.body)}`).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.title).toBe("E2E Testbedarf Lagerlogistik");
    expect(res.body.role).toBe("Lagerhelfer");
    expect(res.body.headcount).toBe(2);
    expect(res.body.id).toBeTruthy();
  });

  test("GET /api/requisitions — erstellter Bedarf erscheint in der Liste", async ({ page }) => {
    // Create one first
    const create = await apiCall(page, `${BASE}/requisitions`, {
      method: "POST",
      csrf,
      data: { title: "E2E List-Test Bedarf", role: "Fachlagerist", headcount: 1 },
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    // List should contain it
    const list = await apiCall(page, `${BASE}/requisitions`);
    expect(list.status).toBe(200);
    expect(list.body.items).toBeDefined();
    const found = list.body.items.find((r) => r.id === id);
    expect(found, "Created requisition must appear in list").toBeTruthy();
  });

  test("GET /api/requisitions/:id — Detail abrufbar", async ({ page }) => {
    const create = await apiCall(page, `${BASE}/requisitions`, {
      method: "POST",
      csrf,
      data: { title: "E2E Detail-Test Bedarf", role: "Kommissionierer", headcount: 1 },
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const detail = await apiCall(page, `${BASE}/requisitions/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(id);
    expect(detail.body.role).toBe("Kommissionierer");
    expect(detail.body.status).toBe("DRAFT");
  });

  test("POST /api/requisitions/:id/transition DRAFT→OPEN — Bedarf freischalten", async ({ page }) => {
    const create = await apiCall(page, `${BASE}/requisitions`, {
      method: "POST",
      csrf,
      data: { title: "E2E Transition Bedarf", role: "Staplerfahrer", headcount: 1 },
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const transition = await apiCall(page, `${BASE}/requisitions/${id}/transition`, {
      method: "POST",
      csrf,
      data: { status: "OPEN" },
    });

    expect(transition.status, `Transition failed: ${JSON.stringify(transition.body)}`).toBe(200);
    expect(transition.body.status).toBe("OPEN");
  });

  test("UI: /public/requisitions.html erreichbar nach Login", async ({ page }) => {
    await page.goto("/public/requisitions.html");

    // Should not redirect to login (auth is active)
    await expect(page).not.toHaveURL(/login/);

    // Page should have a recognizable structure (title or container)
    const container = page.locator(".ds-page-title, .page-title, h1, #req-list, #no-req-state");
    await expect(container.first()).toBeVisible({ timeout: 10_000 });
  });
});

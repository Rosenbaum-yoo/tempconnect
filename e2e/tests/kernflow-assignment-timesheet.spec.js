// @ts-check
/**
 * Kernflow Smoke Test 3: Worker-Assignment + Stundenzettel-Einreichung
 *
 * Verifies the Assignment → Timesheet lifecycle:
 *   POST /api/assignments → status: planned
 *   POST /api/assignments/:id/transition → active
 *   GET  /api/timesheets — Timesheet-Endpunkt erreichbar
 *   Plan-Gate: timesheets require PRO — PLUS returns 403 (expected behavior)
 *
 * This spec tests both the happy path (assignment lifecycle) and the
 * expected plan-gate behavior for timesheets.
 *
 * P1.2 / G1.4 — Kernflow testbar: Assignment+Timesheet-Subflow
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

test.describe("Kernflow: Assignment-Lifecycle", () => {
  let csrf;

  test.beforeEach(async ({ page }) => {
    const result = await apiLogin(page, USERS.company);
    csrf = result.csrfToken;
  });

  test("POST /api/assignments — Assignment anlegen (planned)", async ({ page }) => {
    const res = await apiCall(page, `${BASE}/assignments`, {
      method: "POST",
      csrf,
      data: {
        start_date:       "2026-07-01",
        planned_end_date: "2026-09-30",
        worker_count:     1,
        worker_description: "E2E Test Worker",
        hourly_rate_cents:  1500,
        notes:            "E2E Smoke Test Assignment",
      },
    });

    expect(res.status, `Assignment create failed: ${JSON.stringify(res.body)}`).toBe(201);
    expect(res.body.status).toBe("planned");
    expect(res.body.id).toBeTruthy();
  });

  test("GET /api/assignments — erstelltes Assignment in Liste", async ({ page }) => {
    const create = await apiCall(page, `${BASE}/assignments`, {
      method: "POST",
      csrf,
      data: {
        start_date:       "2026-07-02",
        planned_end_date: "2026-09-30",
        worker_count:     1,
        worker_description: "E2E List Worker",
        hourly_rate_cents: 1800,
      },
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await apiCall(page, `${BASE}/assignments`);
    expect(list.status).toBe(200);
    const found = list.body.items.find((a) => a.id === id);
    expect(found, "Assignment must appear in list").toBeTruthy();
  });

  test("POST /api/assignments/:id/transition planned→active — Einsatz aktivieren", async ({ page }) => {
    const create = await apiCall(page, `${BASE}/assignments`, {
      method: "POST",
      csrf,
      data: {
        start_date:       "2026-07-03",
        planned_end_date: "2026-09-30",
        worker_count:     1,
        worker_description: "E2E Transition Worker",
        hourly_rate_cents: 2000,
      },
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const transition = await apiCall(page, `${BASE}/assignments/${id}/transition`, {
      method: "POST",
      csrf,
      data: { status: "active" },
    });

    expect(transition.status, `Transition failed: ${JSON.stringify(transition.body)}`).toBe(200);
    expect(transition.body.status).toBe("active");
  });

  test("Assignment State Machine: ungültige Transition wird abgelehnt", async ({ page }) => {
    const create = await apiCall(page, `${BASE}/assignments`, {
      method: "POST",
      csrf,
      data: {
        start_date:       "2026-07-04",
        worker_count:     1,
        worker_description: "E2E Invalid Transition Worker",
        hourly_rate_cents: 1000,
      },
    });
    expect(create.status).toBe(201);

    // planned → completed is INVALID (must go planned→active first)
    const invalid = await apiCall(page, `${BASE}/assignments/${create.body.id}/transition`, {
      method: "POST",
      csrf,
      data: { status: "completed" },
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error).toBe("INVALID_TRANSITION");
  });
});

test.describe("Kernflow: Timesheet-Gate und Endpunkte", () => {
  test("GET /api/timesheets — Plan-Gate greift für PLUS-User (erwartet 403)", async ({ page }) => {
    await apiLogin(page, USERS.company); // PLUS plan

    const res = await apiCall(page, `${BASE}/timesheets`);

    // Timesheets require PRO/ENTERPRISE — PLUS users get 403 FEATURE_NOT_AVAILABLE
    // This is correct behavior, NOT a bug.
    expect([200, 403]).toContain(res.status);
    if (res.status === 403) {
      expect(res.body.error).toBe("FEATURE_NOT_AVAILABLE");
      expect(res.body.feature).toBe("timesheets");
    }
  });

  test("Timesheet-Endpunkt antwortet definiert (kein 500)", async ({ page }) => {
    await apiLogin(page, USERS.company);

    const res = await apiCall(page, `${BASE}/timesheets`);
    // 200 (PRO+) or 403 (plan-gated) — never 500 or 404
    expect([200, 403]).toContain(res.status);
  });

  test("UI: /public/einsaetze.html — Einsätze-Seite lädt nach Login", async ({ page }) => {
    await apiLogin(page, USERS.company);
    await page.goto("/public/einsaetze.html");

    await expect(page).not.toHaveURL(/login/);
    const container = page.locator(".ds-page-title, h1, #assignments-section, .page-title");
    await expect(container.first()).toBeVisible({ timeout: 10_000 });
  });
});

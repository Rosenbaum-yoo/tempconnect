// @ts-check

/**
 * EP — Einsatzportal Worker-Flow (Browser Smoke)
 *
 * Verifiziert den End-to-End-Bootstrap des Worker-Self-Service-Portals im echten
 * Browser gegen den laufenden Stack (:8080):
 *
 *  (SMOKE)   Ein eingeloggter Worker kann ALLE 7 Portal-Seiten öffnen; die Shell
 *            bootet authentifiziert (GET /worker/me → Sidebar zeigt den Worker-Namen)
 *            und es findet KEIN Redirect auf die Login-Seite statt.
 *  (GUARD)   Ohne Session leitet die Portal-Shell client-seitig auf worker-login.html
 *            um (NOT_AUTH-Pfad) — kein stiller Zugriff auf Worker-Daten.
 *
 * Worker-Provisionierung (einmalig pro Prozess):
 *   Eine Agentur (Plan PLUS) legt den Worker via `POST /api/workers` an
 *   (Pattern aus api/test/integration/workerPortalSmoke.ep09.test.js).
 *   Der Worker meldet sich danach via `POST /api/auth/login` an.
 *
 * Voraussetzung: laufender Stack unter E2E_BASE_URL (default http://localhost:8080).
 */

import { test, expect } from "@playwright/test";
import { USERS, apiLogin, apiLogout } from "../helpers/auth.js";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";

/* ── Worker-Identität (stabil pro Prozess, tolerant gegen Vorläufe) ──────────── */
const WORKER = {
  email: `e2e-worker-${process.pid}@test.local`,
  password: "E2eWorker2026!",
  first_name: "Smoke",
  last_name: "Worker",
  personnel_number: `EP-SMOKE-${process.pid}`,
};

/** Einmal pro Prozess: Worker existiert (provisioniert via Agentur). */
let workerProvisioned = false;

/* ── Alle 7 Portal-Seiten (served unter /public/) ───────────────────────────── */
const PORTAL_PAGES = [
  { file: "einsatzportal-dashboard.html",        label: "Dashboard" },
  { file: "einsatzportal-einsaetze.html",        label: "Meine Einsätze" },
  { file: "einsatzportal-stundenzettel.html",    label: "Stundenzettel" },
  { file: "einsatzportal-plan.html",             label: "Einsatzplan" },
  { file: "einsatzportal-benachrichtigungen.html", label: "Benachrichtigungen" },
  { file: "einsatzportal-profil.html",           label: "Mein Profil" },
  { file: "einsatzportal-kontakt.html",          label: "Kontakt & Hilfe" },
];

/* ── Browser-interne Helfer (auth.js exportiert diese bewusst nicht) ─────────── */

/**
 * Stellt sicher, dass die Page einen Origin hat (für relative fetch-URLs).
 * Ein frischer Test-Context startet auf about:blank — ohne Origin scheitert
 * `fetch('/api/...')` mit "Failed to parse URL".
 * @param {import("@playwright/test").Page} page
 */
async function ensureOrigin(page) {
  const url = page.url();
  if (!url || url === "about:blank") {
    await page.goto(BASE_URL);
  }
}

/**
 * Authentifizierter JSON-Request aus dem Browser-Kontext heraus.
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string, string>, data?: any }} [options]
 */
async function browserJson(page, path, options = {}) {
  await ensureOrigin(page);
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      headers: options.headers || {},
      body: options.data ? JSON.stringify(options.data) : undefined,
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { ok: response.ok, status: response.status, body };
  }, { path, options });
}

/**
 * Frischen CSRF-Token holen.
 * @param {import("@playwright/test").Page} page
 */
async function fetchCsrf(page) {
  const res = await browserJson(page, "/api/csrf");
  return res.body?.token;
}

/**
 * Stellt sicher, dass der Worker existiert, und meldet ihn an.
 * Die Worker-Session liegt danach im Browser-Kontext (Cookie).
 * @param {import("@playwright/test").Page} page
 */
async function loginWorker(page) {
  // Provisionierung einmalig: Agentur (PLUS) legt Worker via POST /api/workers an.
  if (!workerProvisioned) {
    const { csrfToken } = await apiLogin(page, USERS.agency);
    const createRes = await browserJson(page, "/api/workers", {
      method: "POST",
      data: {
        email: WORKER.email,
        first_name: WORKER.first_name,
        last_name: WORKER.last_name,
        password: WORKER.password,
        personnel_number: WORKER.personnel_number,
      },
      headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
    });
    // 201 = neu angelegt; EMAIL_EXISTS = aus früherem Lauf vorhanden → beides ok.
    if (!createRes.ok && createRes.body?.error !== "EMAIL_EXISTS") {
      throw new Error(`Worker provisioning failed (${createRes.status}): ${JSON.stringify(createRes.body)}`);
    }
    workerProvisioned = true;
    await apiLogout(page, csrfToken);
  }

  // Worker-Login (jede Test-Page hat einen frischen Context → Session neu setzen).
  const loginCsrf = await fetchCsrf(page);
  const loginRes = await browserJson(page, "/api/auth/login", {
    method: "POST",
    data: { email: WORKER.email, password: WORKER.password },
    headers: { "X-CSRF-Token": loginCsrf, "Content-Type": "application/json" },
  });
  expect(loginRes.status, `Worker login: ${JSON.stringify(loginRes.body)}`).toBe(200);
}

/* ── SMOKE: authentifizierter Worker öffnet alle Portal-Seiten ──────────────── */

test.describe("Einsatzportal — authenticated worker smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginWorker(page);
  });

  for (const pg of PORTAL_PAGES) {
    test(`${pg.label} (${pg.file}) bootet authentifiziert ohne Login-Redirect`, async ({ page }) => {
      await page.goto(`/public/${pg.file}`);

      // Beweis #1: Shell hat /worker/me geladen und den Worker-Namen in die Sidebar
      // geschrieben (Startwert "Lädt…"/"Wird geladen…" → Nachname "Worker").
      // Würde die Seite auf worker-login.html umleiten, gäbe es kein #sd-name → Timeout.
      await expect(page.locator("#sd-name")).toContainText(WORKER.last_name, { timeout: 15000 });

      // Beweis #2: Kein Redirect auf die Login-Seite.
      expect(page.url(), "darf nicht auf worker-login.html umgeleitet sein").not.toContain("worker-login.html");

      // Beweis #3: Seiten-Chrome ist gerendert (Seitentitel sichtbar).
      await expect(page.locator("h1.ep-page-title").first()).toBeVisible();
    });
  }
});

/* ── GUARD: ohne Session → client-seitiger Redirect auf worker-login.html ────── */

test.describe("Einsatzportal — unauthenticated guard", () => {
  test("Dashboard ohne Session leitet auf worker-login.html um", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/public/einsatzportal-dashboard.html");
    // Portal-Shell wirft NOT_AUTH und führt location.href = 'worker-login.html' aus.
    await page.waitForURL(/worker-login\.html/, { timeout: 15000 });
    expect(page.url()).toContain("worker-login.html");
  });
});

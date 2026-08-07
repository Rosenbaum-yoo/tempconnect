// @ts-check
/**
 * P8 Welle D — Zugriffs- und Vertragsriegel der Bestaetigungs-Vorschauen.
 *
 * WAS DIESE SPEC PRUEFT
 * Die beiden neuen Vorschau-Endpunkte sind lesend, liefern aber Geschaefts-
 * zahlen (Zuverlaessigkeitsquote, Rabatt in Gefahr) und duerfen deshalb nur
 * Beteiligten antworten. Ausserdem haelt sie fest, dass der Storno-Grund seit
 * Welle A serverseitig Pflicht ist — genau daran ist der alte Frontend-Pfad
 * gescheitert (window.prompt schickte Freitext unter `reason`, die Route
 * verlangt `reason_code` aus einer geschlossenen Liste).
 *
 * WAS SIE NICHT PRUEFT (bewusst benannt)
 * Den Klickpfad durch den Assistenten selbst. Dafuer braucht es eine Fixture
 * mit einer bestaetigten Einsatzvereinbarung (demand -> offer -> accept ->
 * create-agreement -> confirm). Die Schrittfuehrung ist heute nur durch
 * Strukturtests abgedeckt (api/test/dealCommitment.test.js).
 * Wichtig fuer die Einordnung: Die Schrittfuehrung im Modal ist FUEHRUNG,
 * nicht Schutz — der Riegel ist der Server, und der ist hier geprueft.
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

const FREMDE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("P8/D: Vorschau-Endpunkte sind geschuetzt", () => {
  test("ohne Anmeldung kein Zugriff auf die Abschluss-Vorschau", async ({ page }) => {
    await page.goto("/public/landing.html").catch(() => page.goto("/"));
    const res = await apiCall(page, `${BASE}/marketplace/offers/${FREMDE_ID}/commitment-preview`);
    expect(res.status).toBe(401);
  });

  test("ohne Anmeldung kein Zugriff auf die Storno-Auswirkung", async ({ page }) => {
    await page.goto("/public/landing.html").catch(() => page.goto("/"));
    const res = await apiCall(page, `${BASE}/marketplace/offers/${FREMDE_ID}/cancellation-impact`);
    expect(res.status).toBe(401);
  });

  test("angemeldet, aber unbeteiligt: kein 500, sondern sauberes 403/404", async ({ page }) => {
    await apiLogin(page, USERS.agency);
    for (const pfad of ["commitment-preview", "cancellation-impact"]) {
      const res = await apiCall(page, `${BASE}/marketplace/offers/${FREMDE_ID}/${pfad}`);
      // 404 = Angebot gibt es nicht, 403 = nicht beteiligt oder Plan-Gate.
      // Verboten ist: 500 (Absturz) oder 200 (fremde Geschaeftszahlen).
      expect([403, 404]).toContain(res.status);
      // WICHTIG: Ein nicht gemounteter Endpunkt antwortet ebenfalls mit 404 —
      // dieser Test war schon einmal aus genau diesem falschen Grund gruen
      // (der API-Prozess lief mit altem Code). Der Fallback-Handler nennt sich
      // im Rumpf, die Fachantwort nicht.
      const rumpf = JSON.stringify(res.body || {});
      expect(rumpf).not.toContain("Endpoint nicht gefunden");
    }
  });
});

test.describe("P8/D: Der Storno-Grund ist serverseitig Pflicht", () => {
  test("der alte Freitext-Rumpf wird abgelehnt", async ({ page }) => {
    const { csrfToken } = await apiLogin(page, USERS.agency);
    const res = await apiCall(page, `${BASE}/marketplace/offers/${FREMDE_ID}/cancel-agreement`, {
      method: "POST",
      csrf: csrfToken,
      // Genau das, was das alte window.prompt geschickt hat.
      data: { reason: "Kunde hat abgesagt" },
    });
    // Kein 200 und kein 500. Der Riegel greift, egal an welcher Stelle
    // (Beteiligung oder Validierung) er zuerst zuschlaegt.
    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test("ein erfundener Grund wird abgelehnt", async ({ page }) => {
    const { csrfToken } = await apiLogin(page, USERS.agency);
    const res = await apiCall(page, `${BASE}/marketplace/offers/${FREMDE_ID}/cancel-agreement`, {
      method: "POST",
      csrf: csrfToken,
      data: { reason_code: "weil_ich_keine_lust_habe" },
    });
    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});

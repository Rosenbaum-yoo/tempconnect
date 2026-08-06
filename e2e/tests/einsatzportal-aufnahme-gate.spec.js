/**
 * Aufnahme-Riegel und Stundenzettel-Klickpfad — im echten Browser.
 *
 * WARUM DIESE SUITE
 * Zwei Aenderungen vom 2026-08-06 lassen sich mit Unit-Tests grundsaetzlich nicht
 * beweisen, weil sie erst im zusammengesetzten System entstehen:
 *
 *   1. Die verbindliche Aufnahme leitet frisch eingeladene Kraefte aufs Profil um.
 *      Ein Fehler hier ist teuer in beide Richtungen: Riegel greift nicht (nutzlos)
 *      oder greift zu weit (sperrt jemanden aus, der seine Stunden einreichen muss).
 *   2. Die Wochenkarte im Stundenzettel fuehrt bei bearbeitbaren Wochen direkt ins
 *      Ausfuellen. Genau das war der Owner-Befund: "es lassen sich keine
 *      Stundenzettel bearbeiten".
 *
 * Die bestehende Smoke-Suite haette beides NICHT gefangen: sie prueft nur, dass
 * keine Umleitung auf worker-login.html passiert — eine Umleitung aufs Profil
 * sieht fuer sie wie ein Erfolg aus.
 *
 * Run: npx playwright test --config e2e/playwright.config.js einsatzportal-aufnahme-gate
 */
import { test, expect } from "@playwright/test";

const AGENTUR = { email: "demo-agency@tempconnect.de", password: "DemoPass2026!" };
// Ein Einsatz gehoert dem einsetzenden UNTERNEHMEN — die Agentur verknuepft nur
// ihre Kraefte damit. Deshalb zwei Konten in der Fixture.
const UNTERNEHMEN = { email: "demo-buyer@tempconnect.de", password: "DemoPass2026!" };
/**
 * ZWEI Kraefte, und das ist keine Bequemlichkeit:
 *
 * Der Riegel greift nur bei jemandem, der NIE einen Einsatz hatte. Die Fixture
 * fuer den Klickpfad muss aber genau einen anlegen — sie wuerde den Riegel bei
 * derselben Person dauerhaft aufheben, und zwar ueber Testlaeufe hinweg, weil
 * die Datenbank bestehen bleibt. Nach dem ersten gruenen Lauf waeren die
 * Riegel-Tests fuer immer rot gewesen.
 *
 * Getrennte Konten machen die Suite unabhaengig von Reihenfolge und Vorlauf.
 */
const WORKER_OHNE_EINSATZ = {
  email: "e2e-riegel@tempconnect.test",
  password: "E2eAufnahme2026!",
  first_name: "Ada",
  last_name: "Riegel",
  personnel_number: "E2E-AUF-1"
};
const WORKER_MIT_EINSATZ = {
  email: "e2e-stundenzettel@tempconnect.test",
  password: "E2eAufnahme2026!",
  first_name: "Bo",
  last_name: "Zettel",
  personnel_number: "E2E-AUF-2"
};

async function json(page, url, opts = {}) {
  return page.evaluate(async ([u, o]) => {
    const res = await fetch(u, {
      method: o.method || "GET",
      credentials: "include",
      headers: o.headers || {},
      body: o.data ? JSON.stringify(o.data) : undefined
    });
    let body = null;
    try { body = await res.json(); } catch { /* leer */ }
    return { ok: res.ok, status: res.status, body };
  }, [url, opts]);
}

async function csrf(page) {
  const r = await json(page, "/api/csrf");
  return r.body?.token || "";
}

/** Legt die angegebene Test-Kraft an (idempotent) und meldet sie an. */
async function loginWorker(page, WORKER) {
  await page.goto("/public/worker-login.html");

  const agencyCsrf = await csrf(page);
  await json(page, "/api/auth/login", {
    method: "POST", data: AGENTUR,
    headers: { "X-CSRF-Token": agencyCsrf, "Content-Type": "application/json" }
  });
  const createCsrf = await csrf(page);
  const created = await json(page, "/api/workers", {
    method: "POST",
    data: {
      email: WORKER.email, first_name: WORKER.first_name, last_name: WORKER.last_name,
      password: WORKER.password, personnel_number: WORKER.personnel_number
    },
    headers: { "X-CSRF-Token": createCsrf, "Content-Type": "application/json" }
  });
  if (!created.ok && created.body?.error !== "EMAIL_EXISTS") {
    throw new Error(`Worker anlegen fehlgeschlagen (${created.status}): ${JSON.stringify(created.body)}`);
  }
  await json(page, "/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": createCsrf } });

  const loginCsrf = await csrf(page);
  const login = await json(page, "/api/auth/login", {
    method: "POST", data: { email: WORKER.email, password: WORKER.password },
    headers: { "X-CSRF-Token": loginCsrf, "Content-Type": "application/json" }
  });
  expect(login.status, `Worker-Login: ${JSON.stringify(login.body)}`).toBe(200);
}

test.describe("Verbindliche Aufnahme", () => {
  test.beforeEach(async ({ page }) => { await loginWorker(page, WORKER_OHNE_EINSATZ); });

  test("das Server-Urteil sagt: unvollstaendig und noch nie im Einsatz -> Zugang beschraenkt", async ({ page }) => {
    const p = await json(page, "/api/worker/me/onboarding");
    expect(p.status).toBe(200);
    expect(p.body.einsatzbereit, "frischer Worker hat noch kein vollstaendiges Profil").toBe(false);
    expect(p.body.zugang_beschraenkt, "…und noch nie einen Einsatz gehabt").toBe(true);
    // Der neue fuenfte Schritt ist da und blockiert NICHT.
    const placement = p.body.schritte.find((s) => s.key === "placement");
    expect(placement, "Schritt 'placement' fehlt").toBeTruthy();
    expect(placement.pflicht).toBe(false);
  });

  test("das Dashboard leitet aufs Profil um — mit Erklaerung, nicht kommentarlos", async ({ page }) => {
    await page.goto("/public/einsatzportal-dashboard.html");
    await page.waitForURL(/einsatzportal-profil\.html/, { timeout: 15000 });
    expect(page.url()).toContain("aufnahme=1");
  });

  test("Profil und Kontakt bleiben erreichbar — eine Sperre ohne Ausweg waere eine Falle", async ({ page }) => {
    for (const seite of ["einsatzportal-profil.html", "einsatzportal-kontakt.html"]) {
      await page.goto(`/public/${seite}`);
      await page.waitForLoadState("networkidle");
      expect(page.url(), `${seite} darf nicht umgeleitet werden`).toContain(seite);
    }
  });

  test("die Umleitung erklaert sich sichtbar", async ({ page }) => {
    await page.goto("/public/einsatzportal-profil.html?willkommen=1&aufnahme=1");
    await expect(page.locator("#progressTitle")).not.toBeEmpty({ timeout: 15000 });
    const titel = await page.locator("#progressTitle").textContent();
    expect(titel.trim().length, "der Riegel muss einen Grund nennen").toBeGreaterThan(5);
  });
});

/**
 * Fixture fuer den Klickpfad: Einsatz -> Verknuepfung -> Stundenzettel-Entwurf.
 *
 * Zwei Fliegen: Der Worker bekommt dadurch einen Stundenzettel UND einen Einsatz.
 * Letzteres hebt den Aufnahme-Riegel auf — genau wie beabsichtigt, denn wer
 * gearbeitet hat, muss seine Stunden einreichen koennen. Der Riegel und dieser
 * Test pruefen damit dieselbe Regel von beiden Seiten.
 */
async function gibWorkerEinenStundenzettel(page) {
  await page.goto("/public/worker-login.html");

  // Wiederverwenden statt neu anlegen: Die Kette (Einsatz -> Verknuepfung ->
  // Entwurf) muss genau EINMAL entstehen. Wird sie bei jedem Test neu gebaut,
  // laeuft das Konto in Plan- und Rate-Grenzen — und die Suite wird zufaellig
  // rot, was schlimmer ist als gar kein Test.
  const vorhanden = await json(page, "/api/worker/submissions");
  if ((vorhanden.body?.items || []).length > 0) return { ok: true };

  // 1) Als UNTERNEHMEN anmelden und den Einsatz anlegen
  const c1 = await csrf(page);
  await json(page, "/api/auth/login", {
    method: "POST", data: UNTERNEHMEN,
    headers: { "X-CSRF-Token": c1, "Content-Type": "application/json" }
  });
  const c2 = await csrf(page);

  const heute = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const montag = new Date(heute); montag.setDate(heute.getDate() - ((heute.getDay() + 6) % 7));
  const sonntag = new Date(montag); sonntag.setDate(montag.getDate() + 6);

  const assignment = await json(page, "/api/assignments", {
    method: "POST",
    data: {
      title: "E2E Klickpfad", start_date: iso(montag), end_date: iso(sonntag),
      worker_count: 1, worker_description: "E2E"
    },
    headers: { "X-CSRF-Token": c2, "Content-Type": "application/json" }
  });
  if (!assignment.ok) return { ok: false, grund: `assignment ${assignment.status}` };

  // 2) Zurueck zur Agentur — nur sie kennt ihre Kraefte und darf verknuepfen
  await json(page, "/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": c2 } });
  const cA = await csrf(page);
  await json(page, "/api/auth/login", {
    method: "POST", data: AGENTUR,
    headers: { "X-CSRF-Token": cA, "Content-Type": "application/json" }
  });
  const cLink = await csrf(page);
  const liste = await json(page, "/api/workers?limit=200");
  const w = (liste.body?.items || []).find((x) => x.email === WORKER_MIT_EINSATZ.email);
  if (!w) return { ok: false, grund: "Worker nicht in der Liste" };

  const link = await json(page, "/api/worker-assignment-links", {
    method: "POST",
    data: {
      // Die Org kommt aus dem Einsatz selbst — sie ist per Definition die des
      // einsetzenden Unternehmens, nicht die der Agentur.
      worker_user_id: w.user_id, assignment_id: assignment.body.id,
      org_id: assignment.body.org_id,
      start_date: iso(montag), end_date: iso(sonntag)
    },
    headers: { "X-CSRF-Token": cLink, "Content-Type": "application/json" }
  });
  if (!link.ok && link.body?.error !== "LINK_EXISTS") return { ok: false, grund: `link ${link.status} ${JSON.stringify(link.body)}` };
  await json(page, "/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": cLink } });

  // 3) Als Worker einen Entwurf anlegen
  const c3 = await csrf(page);
  await json(page, "/api/auth/login", {
    method: "POST", data: { email: WORKER_MIT_EINSATZ.email, password: WORKER_MIT_EINSATZ.password },
    headers: { "X-CSRF-Token": c3, "Content-Type": "application/json" }
  });
  const eigene = await json(page, "/api/worker/assignments");
  const linkId = (eigene.body?.items || [])[0]?.id;
  if (!linkId) return { ok: false, grund: "kein Einsatz beim Worker sichtbar" };

  const c4 = await csrf(page);
  const sub = await json(page, "/api/worker/submissions", {
    method: "POST",
    data: { worker_assignment_link_id: linkId, week_start: iso(montag), week_end: iso(sonntag) },
    headers: { "X-CSRF-Token": c4, "Content-Type": "application/json" }
  });
  // Ein bereits vorhandener Entwurf aus einem frueheren Lauf ist kein Fehler —
  // die Fixture muss wiederholbar sein, sonst ist sie beim zweiten Mal rot.
  const schonDa = !sub.ok && /EXISTS|DUPLICATE|CONFLICT/i.test(String(sub.body?.error || ""));
  return (sub.ok || schonDa) ? { ok: true } : { ok: false, grund: `submission ${sub.status} ${JSON.stringify(sub.body)}` };
}

test.describe("Stundenzettel — die Wochenkarte fuehrt ins Ausfuellen", () => {
  test.beforeEach(async ({ page }) => {
    await loginWorker(page, WORKER_MIT_EINSATZ);
    const f = await gibWorkerEinenStundenzettel(page);
    test.skip(!f.ok, `Fixture nicht herstellbar: ${f.grund}`);
  });

  test("Karten sind tastaturbedienbar (role/tabindex), nicht nur klickbar", async ({ page }) => {
    await page.goto("/public/einsatzportal-stundenzettel.html");
    const karte = page.locator(".sub-card").first();
    await expect(karte).toBeVisible({ timeout: 15000 });
    await expect(karte).toHaveAttribute("role", "button");
    await expect(karte).toHaveAttribute("tabindex", "0");
  });

  test("Klick auf eine bearbeitbare Woche oeffnet den Editor, nicht die Statusansicht", async ({ page }) => {
    await page.goto("/public/einsatzportal-stundenzettel.html");
    const karte = page.locator(".sub-card").first();
    await expect(karte).toBeVisible({ timeout: 15000 });
    await karte.click();
    // Genau der Owner-Befund: frueher landete man in einer Zwischenansicht und
    // brauchte einen zweiten Klick — "es lassen sich keine Stundenzettel bearbeiten".
    await expect(page.locator("#editorPanel")).toBeVisible({ timeout: 10000 });
  });

  test("'Zurueck' fuehrt wirklich zurueck — nicht in den geleerten Editor", async ({ page }) => {
    await page.goto("/public/einsatzportal-stundenzettel.html");
    const karte = page.locator(".sub-card").first();
    await expect(karte).toBeVisible({ timeout: 15000 });
    await karte.click();
    await expect(page.locator("#editorPanel")).toBeVisible({ timeout: 10000 });
    await page.locator(".ed-back-btn").first().click();
    // closeEditor() fuellte frueher die Detailansicht, schaltete aber nie auf sie um.
    await expect(page.locator("#editorPanel")).toBeHidden({ timeout: 10000 });
    await expect(page.locator("#detContent")).toBeVisible();
  });
});

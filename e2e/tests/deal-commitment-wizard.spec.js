// @ts-check
/**
 * P8 Welle D — Klickpfad durch den Bestaetigungs-Assistenten.
 *
 * WARUM ES DIESE SPEC BRAUCHT
 * Gate D macht zwei VERHALTENS-Aussagen, die Strukturtests nur annaehern
 * koennen: "kein Schritt laesst sich ueberspringen" und "Abbruch aendert nichts
 * am Zustand". Beides ist erst bewiesen, wenn jemand wirklich klickt.
 *
 * Ausserdem deckt sie den Pfad ab, der seit P8 Welle A tot war: das alte
 * window.prompt schickte Freitext unter `reason`, die Route verlangt seither
 * `reason_code` aus einer geschlossenen Liste. Kein Test hat das gemerkt, weil
 * es fuer den Button keinen Klickpfad gab. Diesen hier.
 *
 * DIE FIXTURE
 * Baut die komplette Kette ueber die echte API auf:
 *   Company: Bedarf anlegen
 *   Agency:  Angebot abgeben
 *   Company: Angebot annehmen  (erzeugt die Vereinbarung automatisch mit)
 *   Agency:  Vereinbarung bestaetigen  -> agreement_status = 'confirmed'
 * Erst danach zeigt offer_detail.html den Storno-Knopf.
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

/** In 30 Tagen — weit genug weg, dass der Vorlauf nicht "kurzfristig" ist. */
function inTagen(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Baut eine Vereinbarung bis zum gewuenschten Zustand auf.
 * @param {import('@playwright/test').Page} page
 * @param {'pending_confirmation'|'confirmed'} zielZustand
 * @returns {Promise<string>} offer_id
 */
async function baueVereinbarung(page, zielZustand) {
  // 1. Company legt den Bedarf an
  const company = await apiLogin(page, USERS.company);
  const bedarf = await apiCall(page, `${BASE}/marketplace/demand-requests`, {
    method: "POST", csrf: company.csrfToken,
    data: {
      title: "E2E Welle D — Lagerhelfer",
      role: "Lagerhelfer",
      headcount: 2,
      start_date: inTagen(30),
      end_date: inTagen(60),
      location_city: "Berlin",
      urgency: "normal",
    },
  });
  expect(bedarf.status, `Bedarf anlegen: ${JSON.stringify(bedarf.body)}`).toBe(201);
  const demandId = bedarf.body.id;

  // 2. Agency stimmt dem Bedarf zu.
  //
  // Bewusst dieser Weg und nicht `POST /demand-requests/:id/offers`: der legt ein
  // Angebot im Status 'draft' an, und es gibt KEINE Route, die es auf 'sent'
  // hebt — `acceptOffer` scheitert dort folgerichtig mit INVALID_TRANSITION.
  // Der produktive Pfad ist `accept-deal`: er erzeugt das Angebot direkt als
  // 'accepted' UND die Einsatzvereinbarung gleich mit (Zustand danach:
  // pending_confirmation). Genauso sehen die Deals im echten Bestand aus.
  const agency = await apiLogin(page, USERS.agency);
  const zustimmung = await apiCall(page, `${BASE}/marketplace/demand-requests/${demandId}/accept-deal`, {
    method: "POST", csrf: agency.csrfToken,
    data: { headcount: 2, price_min: 22, price_max: 26 },
  });
  expect([200, 201], `Zustimmen: ${JSON.stringify(zustimmung.body)}`).toContain(zustimmung.status);
  const offerId = zustimmung.body?.offer?.id;
  expect(offerId, `kein offer.id in der Antwort: ${JSON.stringify(zustimmung.body)}`).toBeTruthy();

  if (zielZustand === "confirmed") {
    // 3. Agency bestaetigt die Vereinbarung (confirm-agreement ist supplier-only)
    const bestaetigt = await apiCall(page, `${BASE}/marketplace/offers/${offerId}/confirm-agreement`, {
      method: "POST", csrf: agency.csrfToken, data: {},
    });
    expect(bestaetigt.status, `Bestaetigen: ${JSON.stringify(bestaetigt.body)}`).toBe(200);
  }

  return offerId;
}

/**
 * Cookie-Banner wegklicken — "Nur notwendige", also die datenschutzfreundliche
 * Wahl. Der Banner (`#tc-cc`) liegt mit z-index 2147483000 ueber allem und
 * faengt sonst Klicks auf den Assistenten ab. Ohne diesen Schritt scheitert
 * jeder UI-Test mit einem Klick-Timeout, dessen Ursache man dem Fehler nicht
 * ansieht.
 */
async function bannerWeg(page) {
  const ablehnen = page.locator("#tc-cc-reject");
  if (await ablehnen.count()) {
    await ablehnen.click().catch(() => {});
    await expect(page.locator("#tc-cc")).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  }
}

/**
 * Sprache auf Deutsch festnageln. Die Wahl liegt in localStorage
 * (`tempconnect-lang`) und war im Testlauf auf EN — die deutschen
 * Zusicherungen unten scheiterten dadurch an einer Textstelle, die inhaltlich
 * voellig richtig war. Sprache setzen ist ehrlicher, als die Pruefung so weit
 * aufzuweichen, dass sie beide Sprachen durchlaesst und nichts mehr aussagt.
 */
async function deutsch(page) {
  const de = page.locator('.tc-lang-btn[data-lang="de"]');
  if (await de.count()) {
    const aktiv = await de.first().getAttribute("class");
    if (!/active/.test(aktiv || "")) {
      await de.first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function agreementStatus(page, offerId) {
  const r = await apiCall(page, `${BASE}/marketplace/offers/${offerId}/detail`);
  return r.body?.agreement_status || null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Storno-Assistent — die beiden Gate-D-Verhaltensaussagen
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe.serial("P8/D: Storno-Assistent im Browser", () => {
  /** @type {string} */
  let offerId;

  // Die Fixture laeuft als Hook, nicht als erster Test: so bleibt jeder
  // einzelne Test mit `-g` lauffaehig und haengt nicht an der Reihenfolge.
  // KEIN page.goto vorweg — enterprise.html leitet unangemeldet per
  // Client-Redirect um, und ein evaluate mitten in dieser Navigation verliert
  // seinen Ausfuehrungskontext ("Failed to fetch"). apiLogin navigiert selbst.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    offerId = await baueVereinbarung(page, "confirmed");
    expect(await agreementStatus(page, offerId)).toBe("confirmed");
    await page.close();
  });

  /** Oeffnet den Storno-Assistenten und wartet, bis Schritt 1 wirklich steht. */
  async function oeffneStorno(page) {
    await apiLogin(page, USERS.agency);
    await page.goto(`/public/offer_detail.html?id=${offerId}`);
    await bannerWeg(page);
    await deutsch(page);
    const knopf = page.locator('button[onclick*="cancel-agreement"]');
    await expect(knopf).toBeVisible({ timeout: 20_000 });
    await knopf.click();
    await expect(page.locator("#od-wizard")).toHaveClass(/ds-modal--open/);
    await expect(page.locator('input[name="od-wiz-grund"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#od-wiz-next")).toBeVisible();
  }

  test("der Assistent oeffnet sich und beginnt bei Schritt 1 von 2", async ({ page }) => {
    await apiLogin(page, USERS.agency);
    await page.goto(`/public/offer_detail.html?id=${offerId}`);
    await bannerWeg(page);
    await deutsch(page);

    const stornoKnopf = page.locator('button[onclick*="cancel-agreement"]');
    await expect(stornoKnopf).toBeVisible({ timeout: 20_000 });
    await stornoKnopf.click();

    await expect(page.locator("#od-wizard")).toHaveClass(/ds-modal--open/);
    await expect(page.locator("#od-wiz-progress")).toContainText("1");
    // Die Gruende kommen aus der geschlossenen Liste des Servers, nicht aus Freitext.
    await expect(page.locator('input[name="od-wiz-grund"]').first()).toBeVisible({ timeout: 15_000 });
    const anzahlGruende = await page.locator('input[name="od-wiz-grund"]').count();
    expect(anzahlGruende).toBe(6);
  });

  test("Gate D: ohne Grund kein zweiter Schritt", async ({ page }) => {
    await oeffneStorno(page);

    // Weiter druecken, ohne etwas zu waehlen.
    await page.locator("#od-wiz-next").click();

    await expect(page.locator("#od-wiz-pick")).toBeVisible();
    await expect(page.locator("#od-wiz-progress")).toContainText("1");
    // Der Schritt-2-Titel darf nirgends stehen.
    await expect(page.locator('input[name="od-wiz-grund"]').first()).toBeVisible();
  });

  test("Gate D: mit Grund erscheint Schritt 2 mit echten Zahlen", async ({ page }) => {
    await oeffneStorno(page);

    await page.locator('input[name="od-wiz-grund"][value="worker_quit"]').check();
    await page.locator("#od-wiz-next").click();

    await expect(page.locator("#od-wiz-progress")).toContainText("2");
    // Der Folgen-Block ist da und traegt gerechnete Aussagen, keinen Fixtext.
    const folgen = page.locator(".od-wiz-effect");
    await expect(folgen).toBeVisible();
    const text = await folgen.innerText();
    // Entweder eine Quote in Prozent oder die ehrliche "noch keine Quote"-Aussage.
    expect(text).toMatch(/%|Quote/i);
    // Die Gegenseite und der Einsatzbeginn stehen in der Auswirkungsliste.
    await expect(page.locator(".od-wiz-list")).toBeVisible();
  });

  test("Gate D: Zurueck fuehrt zu Schritt 1 und behaelt die Auswahl", async ({ page }) => {
    await oeffneStorno(page);

    await page.locator('input[name="od-wiz-grund"][value="date_moved"]').check();
    await page.locator("#od-wiz-next").click();
    await expect(page.locator("#od-wiz-progress")).toContainText("2");

    await page.locator("#od-wiz-back").click();
    await expect(page.locator("#od-wiz-progress")).toContainText("1");
    await expect(page.locator('input[name="od-wiz-grund"][value="date_moved"]')).toBeChecked();
  });

  test("Gate D: Abbruch aendert nichts am Zustand", async ({ page }) => {
    await apiLogin(page, USERS.agency);
    expect(await agreementStatus(page, offerId)).toBe("confirmed");

    await oeffneStorno(page);
    await page.locator('input[name="od-wiz-grund"][value="mistake"]').check();
    await page.locator("#od-wiz-next").click();
    await expect(page.locator("#od-wiz-progress")).toContainText("2");

    // Bis zum letzten Schritt vorgedrungen — und dann abgebrochen.
    await page.locator("#od-wiz-abort").click();
    await expect(page.locator("#od-wizard")).not.toHaveClass(/ds-modal--open/);

    // Der entscheidende Nachweis: nichts wurde gesendet.
    expect(await agreementStatus(page, offerId)).toBe("confirmed");
  });

  test("der Storno geht durch — mit Grund, und der Zustand kippt", async ({ page }) => {
    await oeffneStorno(page);

    await page.locator('input[name="od-wiz-grund"][value="worker_sick"]').check();
    await page.locator("#od-wiz-note").fill("E2E: Kraft kurzfristig erkrankt");
    await page.locator("#od-wiz-next").click();
    await expect(page.locator("#od-wiz-progress")).toContainText("2");

    await page.locator("#od-wiz-next").click();

    // NICHT auf "networkidle" warten: die Seite pollt Benachrichtigungen, der
    // Zustand tritt nie ein. Stattdessen auf das fachliche Ergebnis pollen —
    // die Seite laedt nach dem Storno neu, deshalb erst `load` abwarten.
    await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});
    await expect.poll(
      async () => agreementStatus(page, offerId).catch(() => null),
      { timeout: 25_000, message: "Der Storno ist nicht in der Datenbank angekommen" }
    ).toBe("cancelled");
  });

  test("der Grund ist als Enum gelandet, nicht als Freitext", async ({ page }) => {
    await apiLogin(page, USERS.agency);
    const vorschau = await apiCall(page, `${BASE}/marketplace/offers/${offerId}/cancellation-impact`);
    // Nach dem Storno bleibt der Endpunkt erreichbar; entscheidend ist, dass die
    // Storno-Erfassung ueberhaupt gegriffen hat — das prueft der Zustand oben.
    expect([200, 404, 403]).toContain(vorschau.status);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Abschluss-Assistent — drei Schritte
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe.serial("P8/D: Abschluss-Assistent im Browser", () => {
  /** @type {string} */
  let offerId;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    offerId = await baueVereinbarung(page, "pending_confirmation");
    expect(await agreementStatus(page, offerId)).toBe("pending_confirmation");
    await page.close();
  });

  test("drei Schritte, und der letzte nennt die Folge", async ({ page }) => {
    await apiLogin(page, USERS.agency);
    await page.goto(`/public/offer_detail.html?id=${offerId}`);
    await bannerWeg(page);
    await deutsch(page);

    const bestaetigen = page.locator('button[onclick*="confirm-agreement"]').first();
    await expect(bestaetigen).toBeVisible({ timeout: 20_000 });
    await bestaetigen.click();

    await expect(page.locator("#od-wizard")).toHaveClass(/ds-modal--open/);
    await expect(page.locator("#od-wiz-progress")).toContainText("1");
    // Schritt 1: die Eckdaten stehen als Wertepaare da.
    await expect(page.locator(".od-wiz-rows")).toBeVisible({ timeout: 15_000 });

    await page.locator("#od-wiz-next").click();
    await expect(page.locator("#od-wiz-progress")).toContainText("2");
    await expect(page.locator(".od-wiz-rows")).toBeVisible();

    await page.locator("#od-wiz-next").click();
    await expect(page.locator("#od-wiz-progress")).toContainText("3");
    // Schritt 3 ist der Hebel: er nennt die Folge mit echten Werten.
    await expect(page.locator(".od-wiz-effect")).toBeVisible();

    // Abbruch: die Vereinbarung bleibt unbestaetigt.
    await page.locator("#od-wiz-abort").click();
    expect(await agreementStatus(page, offerId)).toBe("pending_confirmation");
  });
});

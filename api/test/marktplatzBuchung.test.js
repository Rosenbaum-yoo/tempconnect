/**
 * Die drei Fragen vor der Buchung + der Sperrlisten-Riegel (Welle J2c).
 *
 * Owner-Entscheid (Plan J §0.2, 2026-08-26): Wie viele? Von wann bis wann?
 * Zu welchem Preis? — geprueft GEGEN DAS ANGEBOT. Ausserhalb des Rahmens ist
 * keine Annahme, sondern Verhandlung. Und: eine gesperrte Kraft (Befund 2.2c)
 * ist fuer genau dieses Unternehmen weder sichtbar (Feed) noch buchbar
 * (accept-deal-Riegel).
 *
 * Drei Schichten:
 *   A) Die reine Pruef-Funktion — erschoepfend, ohne Datenbank.
 *   B) Der Quelltext der Routen — Riegel und Fehlerpfade sind verdrahtet
 *      (Hausmuster ansprechpersonPflicht: Routen-Rumpf herausschneiden).
 *   C) DB-gated: Postgres parst die VOLLE Feed-Query mit Sperrlisten-Klausel
 *      — faengt Spalten-/Alias-Fehler, die kein Mock je sieht.
 *
 * Run: node --test --test-force-exit test/marktplatzBuchung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";

import { pruefeBuchungsWuensche, alsIsoDatum } from "../services/marktplatzBuchungService.js";
import { browseFeed } from "../services/capacityExchangeService.js";

const hasDb = !!process.env.DATABASE_URL;
const HEUTE = "2026-08-26";
const CAP = Object.freeze({
  availability_from: "2026-08-20",
  availability_to: "2026-12-31",
  price_type: "hourly",
  price_min: 28,
  price_max: 42
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  A — die reine Pruef-Funktion
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Buchungs-Wuensche · Teil A — die Regeln", () => {
  it("ohne Wuensche gilt das Angebot — der bestehende Aufrufer bleibt gueltig", () => {
    const r = pruefeBuchungsWuensche(CAP, {}, HEUTE);
    assert.deepEqual(r, { start_date: null, end_date: null, price_value: null });
  });

  it("ein gueltiger Dreiklang kommt normalisiert zurueck", () => {
    const r = pruefeBuchungsWuensche(CAP, { start_date: "2026-09-01", end_date: "2026-10-31", price_value: "35.5" }, HEUTE);
    assert.deepEqual(r, { start_date: "2026-09-01", end_date: "2026-10-31", price_value: 35.5 });
  });

  it("kaputte Datumsangaben und verdrehte Zeitraeume sind PERIOD_INVALID", () => {
    assert.equal(pruefeBuchungsWuensche(CAP, { start_date: "morgen" }, HEUTE).error, "PERIOD_INVALID");
    assert.equal(pruefeBuchungsWuensche(CAP, { end_date: "31.12.2026" }, HEUTE).error, "PERIOD_INVALID");
    assert.equal(pruefeBuchungsWuensche(CAP, { start_date: "2026-10-01", end_date: "2026-09-01" }, HEUTE).error, "PERIOD_INVALID");
  });

  it("ein Einsatz beginnt nicht gestern — Europe/Berlin, nicht UTC", () => {
    const r = pruefeBuchungsWuensche(CAP, { start_date: "2026-08-25" }, HEUTE);
    assert.equal(r.error, "PERIOD_IN_PAST");
  });

  it("ausserhalb des angebotenen Fensters ist keine Annahme — mit dem Fenster in der Antwort", () => {
    const zuSpaet = pruefeBuchungsWuensche(CAP, { start_date: "2027-01-05" }, HEUTE);
    assert.equal(zuSpaet.error, "PERIOD_OUTSIDE_OFFER");
    assert.equal(zuSpaet.offered_to, "2026-12-31", "die Oberflaeche braucht das Fenster, um es zu erklaeren");
    const endetZuSpaet = pruefeBuchungsWuensche(CAP, { start_date: "2026-09-01", end_date: "2027-02-01" }, HEUTE);
    assert.equal(endetZuSpaet.error, "PERIOD_OUTSIDE_OFFER");
  });

  it("ein Angebot mit Vergangenheits-Start heisst 'ab sofort' — heute buchen ist erlaubt", () => {
    /* Die Automatik (J2b) setzt availability_from = Erzeugungstag; Wochen
     * spaeter liegt der in der Vergangenheit. Das Fenster beginnt dann HEUTE,
     * nicht am toten Datum. */
    const r = pruefeBuchungsWuensche(CAP, { start_date: HEUTE }, HEUTE);
    assert.equal(r.error, undefined);
    assert.equal(r.start_date, HEUTE);
  });

  it("ein Preis im Rahmen ist eine Annahme, ausserhalb eine Verhandlung", () => {
    assert.equal(pruefeBuchungsWuensche(CAP, { price_value: 28 }, HEUTE).price_value, 28, "Untergrenze inklusive");
    assert.equal(pruefeBuchungsWuensche(CAP, { price_value: 42 }, HEUTE).price_value, 42, "Obergrenze inklusive");
    const drunter = pruefeBuchungsWuensche(CAP, { price_value: 27.99 }, HEUTE);
    assert.equal(drunter.error, "PRICE_OUTSIDE_OFFER");
    assert.equal(drunter.price_min, 28, "der Rahmen steht in der Antwort — die Oberflaeche leitet zur Verhandlung");
    assert.equal(pruefeBuchungsWuensche(CAP, { price_value: 42.01 }, HEUTE).error, "PRICE_OUTSIDE_OFFER");
  });

  it("Unsinn als Preis ist PRICE_INVALID", () => {
    for (const wert of ["viel", -5, 0, Infinity]) {
      assert.equal(pruefeBuchungsWuensche(CAP, { price_value: wert }, HEUTE).error, "PRICE_INVALID", String(wert));
    }
  });

  it("ohne Preisrahmen im Angebot ist jeder positive Preis eine Einigung", () => {
    const ohneRahmen = { ...CAP, price_min: null, price_max: null };
    assert.equal(pruefeBuchungsWuensche(ohneRahmen, { price_value: 19 }, HEUTE).price_value, 19);
  });

  it("Date-Objekte aus einem parserlosen Pool werden verstanden (P8-Lektion)", () => {
    /* db/pool.js laedt den DATE-als-String-Parser; ein eigener Pool liefert
     * Date-Objekte. Daran ist die Vorlaufberechnung in P8 lautlos
     * gescheitert — dieser Helfer nicht. */
    assert.equal(alsIsoDatum(new Date(2026, 8, 1)), "2026-09-01");
    assert.equal(alsIsoDatum("2026-09-01T00:00:00.000Z"), "2026-09-01");
    assert.equal(alsIsoDatum("kein datum"), null);
    const capMitDate = { ...CAP, availability_from: new Date(2026, 7, 20), availability_to: new Date(2026, 11, 31) };
    const r = pruefeBuchungsWuensche(capMitDate, { start_date: "2026-09-01" }, HEUTE);
    assert.equal(r.error, undefined);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  B — der Quelltext der Routen
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Buchungs-Wuensche · Teil B — die Verdrahtung", () => {
  const marktplatz = fs.readFileSync(new URL("../routes/marketplace.js", import.meta.url), "utf8");
  const feedService = fs.readFileSync(new URL("../services/capacityExchangeService.js", import.meta.url), "utf8");
  const feedRoute = fs.readFileSync(new URL("../routes/capacityExchange.js", import.meta.url), "utf8");

  /** Routen-Rumpf herausschneiden (Hausmuster ansprechpersonPflicht). */
  function route(pfad) {
    const i = marktplatz.indexOf(`router.post("${pfad}"`);
    assert.ok(i >= 0, `Route ${pfad} nicht gefunden`);
    const naechste = marktplatz.indexOf('router.post("', i + 10);
    return marktplatz.slice(i, naechste > 0 ? naechste : marktplatz.length);
  }

  it("accept-deal traegt den Sperrlisten-Riegel VOR der Angebotserstellung", () => {
    const rumpf = route("/marketplace/capacity-posts/:id/accept-deal");
    const riegel = rumpf.indexOf("isWorkerBlockedForCompany");
    const angebot = rumpf.indexOf("INSERT INTO offers");
    assert.ok(riegel >= 0, "der Riegel fehlt — der Feed-Filter allein ist umgehbar");
    assert.ok(angebot > riegel, "der Riegel muss VOR dem Angebot stehen, sonst entsteht der Deal trotzdem");
    assert.match(rumpf, /WORKER_BLOCKED_FOR_COMPANY/);
  });

  it("accept-deal prueft die Wuensche und benutzt sie fuer Bedarf UND Angebot", () => {
    const rumpf = route("/marketplace/capacity-posts/:id/accept-deal");
    assert.match(rumpf, /pruefeBuchungsWuensche\(cap, req\.body \|\| \{\}, todayDE\(\)\)/,
      "die Pruefung laeuft mit Europe/Berlin-Heute, nicht mit dem UTC-Tag");
    assert.match(rumpf, /start_date: startDatum/,
      "der Bedarf traegt den GEWAEHLTEN Zeitraum, nicht stur den des Angebots");
    assert.match(rumpf, /wuensche\.price_value \?\? cap\.price_min/,
      "der gewaehlte Preis wird als Zahl eingefroren (min = max = Wahl)");
  });

  it("jeder Wunsch-Fehler hat einen Antwortpfad — nichts faellt auf 500", () => {
    const rumpf = route("/marketplace/capacity-posts/:id/accept-deal");
    for (const code of ["WORKER_BLOCKED_FOR_COMPANY", "PERIOD_INVALID", "PERIOD_IN_PAST", "PERIOD_OUTSIDE_OFFER", "PRICE_INVALID", "PRICE_OUTSIDE_OFFER"]) {
      assert.ok(rumpf.includes(code), `${code} wird nicht beantwortet`);
    }
  });

  it("der Feed blendet gesperrte Kraefte aus — org-gebunden und zeitbewusst", () => {
    assert.match(feedService, /company_worker_blocklist bl/);
    assert.match(feedService, /bl\.company_org_id = \$/, "die Sperre gilt je Unternehmen, nicht plattformweit");
    assert.match(feedService, /bl\.blocked_until IS NULL OR bl\.blocked_until >= CURRENT_DATE/,
      "eine abgelaufene Befristung sperrt nicht mehr");
    assert.match(feedRoute, /viewer_company_org_id: \(me\?\.role === "company" && req\.orgId\)/,
      "nur ein Unternehmen mit Org-Kontext filtert — Agenturen sehen ihren eigenen Bestand ungefiltert");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  C — Postgres parst die volle Query
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Buchungs-Wuensche · Teil C — echte Datenbank", { skip: !hasDb }, () => {
  it("der Feed mit Sperrlisten-Klausel laeuft gegen die echte Datenbank", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const ergebnis = await browseFeed(pool, {
        viewer_role: "company",
        viewer_user_id: "00000000-0000-0000-0000-000000000001",
        viewer_company_org_id: "00000000-0000-0000-0000-000000000002",
        limit: 5
      });
      assert.ok(Array.isArray(ergebnis.items), "die Antwort traegt items");
      /* Nicht-existente Org: nichts ist gesperrt, der Feed antwortet normal —
       * entscheidend ist, dass Postgres die NOT-EXISTS-Klausel geparst hat. */
    } finally {
      await pool.end();
    }
  });
});

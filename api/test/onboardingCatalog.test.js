/**
 * Onboarding-Katalog Rollen-Split (Audit Finding 4): first_capacity (Personal einstellen)
 * ist Dienstleister-Aktion -> agency-only; Einsatzunternehmen bekommen first_demand
 * (Arbeitsplatzangebot erstellen). Vorher sah company faelschlich die agency-Form.
 *
 * Run: node --test --test-force-exit test/onboardingCatalog.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STEP_CATALOG } from "../services/onboardingService.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const byKey = (k) => STEP_CATALOG.find((s) => s.key === k);

describe("Onboarding-Katalog — Rollen-Split", () => {
  it("first_capacity ist agency-only (Personal einstellen -> capacity_exchange_form)", () => {
    const s = byKey("first_capacity");
    assert.ok(s, "first_capacity existiert");
    assert.deepEqual(s.roles, ["agency"]);
    assert.equal(s.link, "/public/capacity_exchange_form.html");
  });

  it("first_demand ist company-only (Arbeitsplatzangebot erstellen -> marketplace_demand_create)", () => {
    const s = byKey("first_demand");
    assert.ok(s, "first_demand-Schritt existiert");
    assert.deepEqual(s.roles, ["company"]);
    assert.equal(s.link, "/public/marketplace_demand_create.html");
  });

  it("kein Erst-Aktion-Schritt fuehrt ein Unternehmen auf die agency-only Personal-Form", () => {
    const offenders = STEP_CATALOG.filter(
      (s) => s.link === "/public/capacity_exchange_form.html" && (s.roles == null || s.roles.includes("company"))
    );
    assert.equal(offenders.length, 0);
  });

  it("first_demand.detect probt company-seitige demand_requests (requester_company_id)", async () => {
    const s = byKey("first_demand");
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ "1": 1 }] }; } };
    const result = await s.detect(pool, "user-1", "org-1");
    assert.equal(result, true);
    assert.match(calls[0].sql, /demand_requests/);
    assert.match(calls[0].sql, /requester_company_id/);
    assert.deepEqual(calls[0].params, ["user-1"]);
  });

  it("keine Emoji-Icons mehr in den gesplitteten Schritten (Owner-Regel)", () => {
    assert.equal(byKey("first_capacity").icon, "");
    assert.equal(byKey("first_demand").icon, "");
  });
});

describe("Onboarding-Katalog — die Rueckfallebene im Browser darf nicht widersprechen", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * ZWEI KARTEN FUER DIESELBEN LINKS, UND SIE WAREN ZWEIMAL AUSEINANDER
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * `getOnboardingStatus` liefert `link` je Schritt mit, und
   * `onboardingChecklist.js` im Browser nimmt ihn zuerst
   * (`s.link || STEP_LINKS[key]`). Die dortige Karte ist also nur
   * Rueckfallebene — aber eine, die dem Server WIDERSPRECHEN kann, ohne dass
   * es jemand merkt: sie greift nur in dem seltenen Fall, in dem die Antwort
   * keinen Link traegt.
   *
   * GEMESSEN AM 2026-09-04: zwei von acht Eintraegen waren abgedriftet.
   *   first_deal    Browser angebote_verwalten.html — Katalog company_requests.html
   *   team_invited  Browser mitarbeiter.html        — Katalog sla_profil.html
   *
   * Die zweite war die gefaehrlichere. Der Schritt heisst "Teammitglied
   * einladen" und zaehlt `org_memberships` — gemeint ist ein KOLLEGE, nicht
   * eine Arbeitskraft. Und seit M3.7 gehoert die Arbeitskraefte-Seite der
   * Zeitarbeitsfirma: ein Unternehmen waere auf einer Seite gelandet, deren
   * API mit 403 antwortet.
   */

  /* Pfad IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
     Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
  const HIER = path.dirname(fileURLToPath(import.meta.url));
  const DATEI = path.resolve(HIER, "..", "..", "frontend", "public", "js", "onboardingChecklist.js");

  function browserKarte() {
    const quelle = fs.readFileSync(DATEI, "utf8");
    const block = /var STEP_LINKS = \{([\s\S]*?)\};/.exec(quelle);
    assert.ok(block, "STEP_LINKS nicht gefunden — wurde die Karte umbenannt? "
      + "Dann liest diese Probe ins Leere und waere lautlos gruen");
    const karte = {};
    for (const m of block[1].matchAll(/([a-z_]+)\s*:\s*'([^']+)'/g)) karte[m[1]] = m[2];
    return karte;
  }

  it("die Datei ist auffindbar und die Karte nicht leer", () => {
    assert.ok(fs.existsSync(DATEI), `nicht gefunden: ${DATEI}`);
    const karte = browserKarte();
    assert.ok(Object.keys(karte).length >= 6,
      `nur ${Object.keys(karte).length} Eintraege gelesen — das Muster passt nicht mehr`);
  });

  it("jeder Rueckfall-Link stimmt mit dem Katalog ueberein", () => {
    const karte = browserKarte();
    const abweichungen = [];
    for (const [key, link] of Object.entries(karte)) {
      const schritt = byKey(key);
      if (!schritt) { abweichungen.push(`${key}: steht im Browser, nicht im Katalog`); continue; }
      if (schritt.link && schritt.link !== link) {
        abweichungen.push(`${key}: Browser ${link} — Katalog ${schritt.link}`);
      }
    }
    assert.deepStrictEqual(abweichungen, [],
      "Die Rueckfallebene im Browser widerspricht dem Katalog. Sie greift nur, wenn "
      + "die Antwort keinen Link traegt — und schickt den Menschen dann woanders hin "
      + "als der Server vorsieht:\n  " + abweichungen.join("\n  "));
  });

  it("kein Katalog-Schritt fehlt in der Rueckfallebene", () => {
    /* Die Gegenrichtung: fehlt ein Schritt, faellt der Link im Rueckfall auf
       '#' — ein Knopf, der nichts tut. */
    const karte = browserKarte();
    const fehlend = STEP_CATALOG.filter((s) => s.link && !karte[s.key]).map((s) => s.key);
    assert.deepStrictEqual(fehlend, [],
      "Diese Schritte haben im Browser keinen Rueckfall-Link und landen dort auf '#':\n  "
      + fehlend.join("\n  "));
  });
});

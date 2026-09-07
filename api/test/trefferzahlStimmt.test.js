/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.4 (Vorstufe) — DIE ZAHL ZAEHLT NUR, WAS DER BETRACHTER SIEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Plan verspricht eine Treffer-Vorschau: "mit diesen Angaben: 23 Kraefte".
 * Bevor eine solche Zahl irgendwo steht, muss sie stimmen.
 *
 * Gemessen am 2026-09-06: `browseFeed` gab `total = supply + demand` zurueck,
 * also die Summe BEIDER Marktseiten — und filterte `items` danach nach der
 * Rolle des Betrachters. Mit 6 Angeboten und 17 fremden Bedarfen bekam ein
 * UNTERNEHMEN `total: 23` und sah 6.
 *
 * Die 17 waren die Einkaufslisten anderer Unternehmen. Und die Zahl ist nicht
 * nur Anzeige: sie speist die BLAETTERUNG. Ueber einer Liste mit sechs
 * Eintraegen standen 23 Treffer, also Seiten, die es nicht gibt.
 *
 * (Kurios am Rande: "23" ist genau die Beispielzahl aus dem Plan.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS DIESE DATEI NOCH NICHT ABDECKT — benannt, nicht verschwiegen
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der RADIUS wirkt weiterhin nicht auf `total`. Er wird erst NACH der
 * Datenbankabfrage in JavaScript angewandt (`capacityExchangeService`,
 * "Geo-Filter"), und zwar nach dem `LIMIT`. Zwei Folgen, beide bestehend:
 *
 *   1. `total` kennt den Radius nicht — die Zahl ist zu gross, sobald jemand
 *      einen Umkreis setzt.
 *   2. Eine Seite kann WENIGER Eintraege liefern als angefordert, weil erst
 *      geschnitten und dann gefiltert wird.
 *
 * Das zu beheben heisst, den Umkreis in SQL zu rechnen — ein eigener Eingriff
 * in die Feed-Abfrage. Er steht in `docs/features/N_PERSONALSUCHE.md`,
 * Abschnitt 5 (N2.4), und ist NICHT Teil dieser Welle.
 *
 * Lauf: node --test --test-force-exit test/trefferzahlStimmt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { browseFeed } from "../services/capacityExchangeService.js";

/* Ein Muster-Pool, der die beiden Zaehlabfragen unterscheidbar beantwortet. */
function pool({ angebote = 6, bedarfe = 17 } = {}) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    const s = String(sql);
    calls.push({ sql: s, params });
    if (/COUNT\(\*\)::int AS cnt/.test(s) && /demand_requests dr/.test(s)) {
      return { rows: [{ cnt: bedarfe }] };
    }
    if (/COUNT\(\*\)::int AS cnt/.test(s)) return { rows: [{ cnt: angebote }] };
    return { rows: [], rowCount: 0 };
  };
  return { calls, query: lauf, connect: async () => ({ query: lauf, release() {} }) };
}

describe("N2.4 · die Trefferzahl gehoert zur eigenen Marktseite", () => {

  it("ein Unternehmen zaehlt Angebote, nicht die Bedarfe anderer Unternehmen", async () => {
    const r = await browseFeed(pool(), { viewer_role: "company", limit: 1 });
    assert.strictEqual(r.total, 6,
      "die Einkaufslisten anderer Unternehmen werden mitgezaehlt");
  });

  it("eine Zeitarbeitsfirma zaehlt Bedarfe, nicht die Angebote der Mitbewerber", async () => {
    const r = await browseFeed(pool(), { viewer_role: "agency", limit: 1 });
    assert.strictEqual(r.total, 17);
  });

  it("mit Inter-Agency-Freigabe zaehlen beide Seiten — weil beide erscheinen", async () => {
    /* Die Zahl folgt der Sichtbarkeit, nicht einer festen Regel: wer zusaetzlich
       Angebote sieht, muss sie auch gezaehlt bekommen. */
    const r = await browseFeed(pool(), {
      viewer_role: "agency", inter_agency_supply_visible: true, limit: 1
    });
    assert.strictEqual(r.total, 23);
  });

  it("ohne Rolle bleibt es bei beidem", async () => {
    // Keine Marktseite heisst: nichts wird weggefiltert, also nichts abgezogen.
    const r = await browseFeed(pool(), { limit: 1 });
    assert.strictEqual(r.total, 23);
  });

  it("die Zahl folgt derselben Regel wie die Liste", async () => {
    /*
     * Der eigentliche Vertrag. `items` wird nach `feed_type` gefiltert; `total`
     * muss dieselbe Auswahl treffen. Eine zweite Meinung darueber, was zur
     * eigenen Marktseite gehoert, ist genau der Fehler, der hier behoben wurde.
     */
    for (const [rolle, erwartet] of [["company", 6], ["agency", 17]]) {
      const r = await browseFeed(pool({ angebote: 6, bedarfe: 17 }), { viewer_role: rolle, limit: 50 });
      const fremde = r.items.filter((i) =>
        rolle === "company" ? i.feed_type !== "supply" : i.feed_type === "supply");
      assert.strictEqual(fremde.length, 0, `${rolle}: fremde Marktseite in der Liste`);
      assert.strictEqual(r.total, erwartet, `${rolle}: die Zahl passt nicht zur Liste`);
    }
  });

  it("null Treffer bleiben null — kein Aufrunden durch die Gegenseite", async () => {
    /* Der teuerste Fall fuer eine Vorschau: "0 Kraefte" muss 0 heissen. Stuende
       dort die Zahl der fremden Bedarfe, sagte die Oberflaeche "17 Treffer" und
       zeigte eine leere Liste. */
    const r = await browseFeed(pool({ angebote: 0, bedarfe: 17 }), { viewer_role: "company", limit: 1 });
    assert.strictEqual(r.total, 0);
  });
});

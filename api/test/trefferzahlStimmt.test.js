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
 * UND DER UMKREIS — nachgeholt am 2026-09-07 (N2.4b, Owner-Freigabe)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis dahin wurde der Umkreis erst NACH der Abfrage in JavaScript angewandt,
 * und zwar nach dem `LIMIT`. Drei Folgen:
 *
 *   1. `total` kannte den Umkreis nicht — wer 25 km suchte, las eine Zahl,
 *      die die ganze Republik zaehlte.
 *   2. Eine Seite lieferte WENIGER Eintraege als angefordert: erst 25 Zeilen
 *      geschnitten, dann davon die Haelfte weggefiltert.
 *   3. Die Blaetterung zeigte Seiten, die es nicht gab.
 *
 * Jetzt rechnet Postgres. Gemessen gegen die laufende Datenbank, Suchpunkt
 * Hamburg-Bergedorf:
 *
 *     25 km -> 9    200 km -> 9    300 km -> 11    400 km -> 13
 *
 * Das ist der Nachweis, den der Plan verlangt: "Radius vergroessern -> Zahl
 * steigt". Und `total` stimmt bei jedem Schritt mit der Zahl der Eintraege
 * ueberein.
 *
 * WAS WEITERHIN NACH DEM LIMIT LAEUFT — benannt, nicht verschwiegen: die
 * anderen Nachfilter der Angebotsseite (`visible_to_viewer`, `min_headcount`,
 * `remaining_headcount > 0`). Auch sie koennen eine Seite kuerzen. Der Umkreis
 * war der teuerste von ihnen, weil er als einziger die Trefferzahl verfaelschte
 * — die anderen bleiben ein eigener Befund.
 *
 * Lauf: node --test --test-force-exit test/trefferzahlStimmt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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


/* ═══════════════════════════════════════════════════════════════════════
   N2.4b — DER UMKREIS RECHNET IN SQL
   ═══════════════════════════════════════════════════════════════════════ */

describe("N2.4b · der Umkreis steht in der Abfrage, nicht dahinter", () => {

  const HAMBURG = { latitude: 53.5083, longitude: 10.1967, radius_km: 25 };

  async function sqlVon(opts) {
    const p = pool();
    await browseFeed(p, { viewer_role: "company", limit: 25, ...opts });
    return p.calls.map((c) => c.sql);
  }

  it("beide Zaehlabfragen kennen den Umkreis — sonst luegt die Zahl", async () => {
    const alle = await sqlVon(HAMBURG);
    const zaehlungen = alle.filter((s) => /COUNT\(\*\)::int AS cnt/.test(s));
    assert.strictEqual(zaehlungen.length, 2, "es gibt nicht mehr zwei Zaehlabfragen");
    for (const z of zaehlungen) {
      assert.match(z, /6371 \* 2 \* asin/, "eine Zaehlung rechnet ohne Entfernung");
    }
  });

  it("und beide Holabfragen ebenso — sonst kuerzt der Filter die Seite", async () => {
    const alle = await sqlVon(HAMBURG);
    const holen = alle.filter((s) => /LIMIT/.test(s) && !/COUNT\(/.test(s));
    assert.ok(holen.length >= 1, "es wird nichts geholt");
    for (const h of holen) {
      assert.match(h, /6371 \* 2 \* asin/, "eine Holabfrage rechnet ohne Entfernung");
    }
  });

  it("ohne Umkreis steht keine Entfernung in der Abfrage", async () => {
    /* Der Normalfall darf nicht teurer werden, nur weil es die Moeglichkeit
       gibt: ohne Suchpunkt wird nichts gerechnet. */
    const alle = await sqlVon({});
    assert.ok(alle.every((s) => !/6371 \* 2 \* asin/.test(s)),
      "es wird ohne Anlass eine Entfernung gerechnet");
  });

  it("eine Zeile ohne Koordinaten faellt heraus — wie vorher im JavaScript", async () => {
    const alle = await sqlVon(HAMBURG);
    const mit = alle.filter((s) => /6371 \* 2 \* asin/.test(s));
    for (const q of mit) {
      assert.match(q, /location_lat IS NOT NULL/, "Zeilen ohne Koordinaten bleiben drin");
    }
  });

  it("der EIGENE Radius eines Eintrags zaehlt mit", async () => {
    /*
     * "Ich fahre bis 80 km" bleibt drin, auch wenn der Suchende 25 km
     * eingestellt hat. Das war schon die Regel des alten JavaScript-Filters
     * (`Math.max(sR, r.radius_km || 25)`) — sie zu verlieren waere ein
     * stiller Verlust von Angeboten.
     */
    const alle = await sqlVon(HAMBURG);
    const mit = alle.find((s) => /6371 \* 2 \* asin/.test(s));
    assert.match(mit, /GREATEST\(25, COALESCE\(\w+\.radius_km, 25\)\)/,
      "der eigene Radius des Eintrags wird nicht mehr beruecksichtigt");
  });

  it("bei Umkreissuche wird nach Naehe sortiert — VOR dem LIMIT", async () => {
    /*
     * Der Kern der Sache. Sortiert man erst nach dem Schneiden, ist die erste
     * Seite nicht die naechstgelegene, sondern eine beliebige.
     */
    const alle = await sqlVon(HAMBURG);
    const holen = alle.filter((s) => /LIMIT/.test(s) && !/COUNT\(/.test(s));
    for (const h of holen) {
      const sortierung = h.indexOf("_distance_km ASC");
      const grenze = h.indexOf("LIMIT");
      assert.ok(sortierung > 0, "es wird nicht nach Naehe sortiert");
      assert.ok(sortierung < grenze, "sortiert wird erst nach dem Schneiden");
    }
  });

  it("ohne Umkreis bleibt die alte Sortierung", async () => {
    const alle = await sqlVon({});
    const holen = alle.filter((s) => /LIMIT/.test(s) && !/COUNT\(/.test(s));
    assert.ok(holen.every((h) => !/_distance_km ASC/.test(h)));
  });

  it("unbrauchbare Angaben schalten den Umkreis ab, statt die Abfrage zu zerbrechen", async () => {
    /*
     * Ein `NaN` oder eine Breite von 900 darf keine kaputte Abfrage erzeugen —
     * und auch keinen leeren Marktplatz. Der Umkreis faellt dann einfach weg,
     * und der Betrachter sieht wie vorher alles.
     */
    for (const schlecht of [
      { latitude: NaN, longitude: 10, radius_km: 25 },
      { latitude: 53, longitude: "abc", radius_km: 25 },
      { latitude: 900, longitude: 10, radius_km: 25 },
      { latitude: 53, longitude: 10, radius_km: 0 },
      { latitude: 53, longitude: 10, radius_km: -5 },
      { latitude: 53, longitude: null, radius_km: 25 }
    ]) {
      const alle = await sqlVon(schlecht);
      assert.ok(alle.every((s) => !/6371 \* 2 \* asin/.test(s)),
        "unbrauchbare Angaben landen in der Abfrage: " + JSON.stringify(schlecht));
    }
  });

  it("nur Zahlen erreichen das SQL — nichts Getipptes", async () => {
    /*
     * Die drei Werte werden als ZAHLEN eingesetzt, nicht als Platzhalter (die
     * beiden Marktseiten haben verschiedene Parameter-Regime). Diese Probe
     * haelt fest, dass eine eingeschleuste Zeichenkette es nicht ins SQL
     * schafft — sie ist keine endliche Zahl und schaltet den Umkreis ab.
     */
    const alle = await sqlVon({ latitude: "53); DROP TABLE users --", longitude: 10, radius_km: 25 });
    assert.ok(alle.every((s) => !/DROP TABLE/.test(s)), "eine Zeichenkette steht im SQL");
    assert.ok(alle.every((s) => !/6371 \* 2 \* asin/.test(s)));
  });

  it("die Entfernung wird fuer die Anzeige gerundet", async () => {
    const p = pool();
    const roh = 12.3456789;
    p.query = async (sql) => {
      const s = String(sql);
      if (/COUNT\(\*\)::int AS cnt/.test(s) && /demand_requests dr/.test(s)) return { rows: [{ cnt: 0 }] };
      if (/COUNT\(\*\)::int AS cnt/.test(s)) return { rows: [{ cnt: 1 }] };
      if (/LIMIT/.test(s)) return { rows: [{ id: "cp1", feed_type: "supply", _distance_km: roh, status: "active" }] };
      return { rows: [] };
    };
    const e = await browseFeed(p, { viewer_role: "company", limit: 25, ...HAMBURG });
    const treffer = e.items.find((i) => i.id === "cp1");
    if (treffer) {
      assert.strictEqual(treffer._distance_km, 12.3,
        "die Entfernung wird nicht auf eine Nachkommastelle gerundet");
    }
  });
});


/* ═══════════════════════════════════════════════════════════════════════
   N2.7 — JEDE MARKTSEITE BLAETTERT RICHTIG
   ═══════════════════════════════════════════════════════════════════════
 *
 * Gefunden in der Pruefung vom 12.09. Der Feed holte ZUERST Angebote (mit
 * OFFSET), DANACH Bedarfe — nur "den Rest der Seite" und OHNE OFFSET:
 *
 *   * Eine Zeitarbeitsfirma sieht keine Angebote; die wurden trotzdem geholt,
 *     verbrauchten die Seite und flogen weiter unten wieder raus.
 *   * Seite 2 lieferte dieselben Bedarfe wie Seite 1.
 *   * Bei Umkreissuche standen Angebote in 100 km vor einem Bedarf in 200 m.
 *
 * Gegen die laufende Datenbank belegt (Agentur, 4 je Seite): nachher 0
 * Doppelte zwischen Seite 1 und 2, alle Seiten zusammen genau `total`; bei
 * Sicht auf beide Seiten mit Umkreis nach Naehe sortiert.
 */

describe("N2.7 · jede Marktseite blaettert richtig", () => {

  /* Ein Pool, der Hol- und Zaehlabfragen unterscheidet und Zeilen liefert. */
  function feedPool({ angebote = [], bedarfe = [] } = {}) {
    const calls = [];
    const istBedarfHolen = (s) => /FROM demand_requests dr/.test(s) && /LIMIT \$1/.test(s) && !/COUNT\(/.test(s);
    const istAngebotHolen = (s) => /sort_date DESC/.test(s) && /OFFSET \$\d+/.test(s) && !/demand_requests dr/.test(s);
    const lauf = async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/COUNT\(\*\)::int AS cnt/.test(s)) {
        return { rows: [{ cnt: /demand_requests dr/.test(s) ? bedarfe.length : angebote.length }] };
      }
      if (istBedarfHolen(s)) return { rows: bedarfe.map((b) => ({ ...b })) };
      if (istAngebotHolen(s)) return { rows: angebote.map((a) => ({ ...a })) };
      return { rows: [], rowCount: 0 };
    };
    return {
      calls, query: lauf, connect: async () => ({ query: lauf, release() {} }),
      holAngebote: () => calls.filter((c) => istAngebotHolen(c.sql)),
      holBedarfe: () => calls.filter((c) => istBedarfHolen(c.sql))
    };
  }

  it("eine Zeitarbeitsfirma holt KEINE Angebote — die verbrauchten sonst ihre Seite", async () => {
    const p = feedPool();
    await browseFeed(p, { viewer_role: "agency", limit: 4, page: 1 });
    assert.strictEqual(p.holAngebote().length, 0, "Angebote werden geholt, obwohl die Agentur sie nie sieht");
    assert.strictEqual(p.holBedarfe().length, 1);
  });

  it("…und ihre Bedarfe blaettern mit OFFSET — Seite 3 beginnt bei 8", async () => {
    const p = feedPool();
    await browseFeed(p, { viewer_role: "agency", limit: 4, page: 3 });
    const q = p.holBedarfe()[0];
    assert.match(q.sql, /LIMIT \$1 OFFSET \$3/, "die Bedarfsabfrage hat keinen OFFSET — jede Seite beginnt von vorn");
    assert.strictEqual(q.params[0], 4, "das Limit stimmt nicht");
    assert.strictEqual(q.params[2], 8, "der Versatz stimmt nicht");
  });

  it("ein Unternehmen holt KEINE Bedarfe — die Einkaufslisten anderer gehen es nichts an", async () => {
    const p = feedPool();
    await browseFeed(p, { viewer_role: "company", limit: 4, page: 1 });
    assert.strictEqual(p.holBedarfe().length, 0, "fremde Bedarfe werden geholt und erst danach verworfen");
    assert.strictEqual(p.holAngebote().length, 1);
  });

  it("wer BEIDE Seiten sieht, bekommt je Seite ein Fenster ab 0 — geschnitten wird danach", async () => {
    const p = feedPool();
    await browseFeed(p, { limit: 4, page: 3 });
    const a = p.holAngebote()[0];
    const b = p.holBedarfe()[0];
    assert.ok(a && b, "eine der beiden Seiten wurde nicht geholt");
    assert.deepStrictEqual(a.params.slice(-2), [12, 0], "das Angebotsfenster ist nicht offset+limit ab 0");
    assert.deepStrictEqual([b.params[0], b.params[2]], [12, 0], "das Bedarfsfenster ist nicht offset+limit ab 0");
  });

  it("die Naehe gilt ueber BEIDE Seiten — der Bedarf in 200 m steht vor dem Angebot in 100 km", async () => {
    /* Die Probe gilt nur, wenn wirklich beide Seiten auf der Seite landen —
       sonst waere "richtig sortiert" trivial wahr. */
    const p = feedPool({
      angebote: [{ id: "cp-fern", status: "active", is_active: true, visibility_status: "public",
        headcount: 2, supplier_company_id: "s1", _distance_km: 100, sort_date: "2026-09-10" }],
      bedarfe: [{ id: "dr-nah", feed_type: "demand", status: "open", _distance_km: 0.2,
        updated_at: "2026-09-01", created_at: "2026-09-01" }]
    });
    const e = await browseFeed(p, { latitude: 53.5, longitude: 10.2, radius_km: 400, limit: 10 });
    const reihe = e.items.map((i) => i.id);
    assert.ok(reihe.includes("cp-fern") && reihe.includes("dr-nah"),
      "nicht beide Seiten auf der Seite — die Probe misst so nichts: " + reihe.join(","));
    assert.deepStrictEqual(reihe.slice(0, 2), ["dr-nah", "cp-fern"],
      "die Naehe gilt nur je Seite, nicht ueber beide");
  });

  it("…und ohne Umkreis entscheidet ueber die Seitenzugehoerigkeit die Aktualitaet, nicht die Marktseite", async () => {
    /* Vorher kamen IMMER erst alle Angebote, dann Bedarfe. Bei Sicht auf beide
       Seiten und kleiner Seite fiel ein frischer Bedarf hinter alte Angebote
       von der Seite. */
    const p = feedPool({
      angebote: [{ id: "cp-alt", status: "active", is_active: true, visibility_status: "public",
        headcount: 1, supplier_company_id: "s1", sort_date: "2026-01-01" }],
      bedarfe: [{ id: "dr-frisch", feed_type: "demand", status: "open",
        updated_at: "2026-09-12", created_at: "2026-09-12" }]
    });
    const e = await browseFeed(p, { limit: 1, page: 1 });
    const reihe = e.items.map((i) => i.id);
    assert.ok(p.holAngebote().length === 1 && p.holBedarfe().length === 1, "beide Seiten muessen geholt werden");
    assert.deepStrictEqual(reihe, ["dr-frisch"], "die Seite schneidet nach Marktseite statt nach Aktualitaet: " + reihe.join(","));
  });

  it("unbrauchbare Koordinaten schalten die Rangsortierung NICHT ab", () => {
    /*
     * `latitude=abc` ergab NaN, war "nicht null" — die Rangsortierung fiel aus,
     * obwohl gar nicht nach Umkreis gefiltert wurde. Jetzt gilt EINE Definition
     * von Umkreissuche: die, nach der auch gefiltert wird.
     *
     * Wortlaut-Probe, bewusst: die Rangzahl entsteht aus Reputation, Tarif und
     * Hervorhebung ueber mehrere Nachladeabfragen, und ihre Wirkung im
     * Muster-Pool nachzustellen waere eine zweite Rangberechnung. Die Wirkung
     * ist gegen die laufende Datenbank belegt (Muell-Koordinaten = gleiche
     * Reihenfolge wie ohne Umkreis); diese Probe haelt die EINE Definition fest.
     */
    const quelle = fs.readFileSync(new URL("../services/capacityExchangeService.js", import.meta.url), "utf8");
    const block = /\/\/ Sort by rank_score \(unless geo-sorted\)[\s\S]{0,800}?items\.sort/.exec(quelle);
    assert.ok(block, "die Rangsortierung ist nicht mehr auffindbar");
    assert.match(block[0], /if \(!umkreis\) \{/, "die Rangsortierung hat wieder eine eigene Umkreis-Definition");
    assert.ok(!/opts\.latitude != null/.test(block[0]), "die alte Null-Pruefung steht wieder da");
  });
});

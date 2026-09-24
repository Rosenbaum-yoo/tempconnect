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
 * NACH DEM LIMIT laeuft seit N2.8 nur noch `visible_to_viewer`. Bis N2.7 stand
 * hier: auch `min_headcount` und `remaining_headcount > 0` liefen danach, und
 * der Umkreis sei der einzige gewesen, der die Trefferzahl verfaelschte. Das
 * zweite war falsch — `min_headcount` verfaelschte sie ebenso (gemessen: 24 von
 * 189 Faellen, jeder mit gesetztem Mindestwert). Beide Kopfzahl-Filter stehen
 * seit N2.8 in Zaehlung und Abfrage; siehe den Abschnitt unten.
 *
 * Lauf: node --test --test-force-exit test/trefferzahlStimmt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { browseFeed, getCapacityCommercialStates, _FUER_PROBEN } from "../services/capacityExchangeService.js";

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

  it("der Vergleich heisst INNERHALB — Entfernung <= Radius, in jeder Zaehl- und Holabfrage", async () => {
    /*
     * N2.11 — Befund der Pruefung vom 2026-09-15: die Proben oben pinnten die
     * Formel und den Radius, aber nicht den Vergleich DAZWISCHEN. Ausgefuehrt:
     * `<=` zu `>` blieb in 13 Feed-Dateien 318/318 gruen — die Umkreissuche
     * haette nur noch Angebote AUSSERHALB geliefert, und die Treffer-Vorschau
     * waere mit wachsendem Radius gesunken.
     *
     * Der Vergleich steht direkt zwischen der schliessenden Klammer der
     * Entfernung und dem Radius. Das Gegenstueck an der echten Datenbank:
     * `integration/firmaAmBedarf.flow.test.js` ("der Umkreis rechnet innerhalb").
     */
    const alle = await sqlVon(HAMBURG);
    const mitUmkreis = alle.filter((s) => /6371 \* 2 \* asin/.test(s));
    assert.ok(mitUmkreis.length >= 3, `erwartet Zaehlungen und Holabfragen, gefunden ${mitUmkreis.length}`);
    for (const s of mitUmkreis) {
      assert.match(s.replace(/\s+/g, " "), /\){4} <= GREATEST\(25, COALESCE\((cp|dr)\.radius_km, 25\)\)/,
        "die Umkreisbedingung vergleicht nicht mehr 'Entfernung <= Radius'");
    }
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
    /*
     * N3.4 hat den Ort des Versatzes verschoben, nicht den Versatz. Gilt der
     * Rang fuer die Seite, holt der Feed ein Kandidatenfenster ab 0 und
     * schneidet die Seite NACH der Rangbildung — dann steht der Versatz nicht
     * mehr in SQL. Wo SQL weiter blaettert (ausdrueckliche Sortierung, oder
     * jenseits des Fensters), muss er dort stehen, und das prueft diese Probe
     * unveraendert weiter.
     */
    const p = feedPool();
    await browseFeed(p, { viewer_role: "agency", limit: 4, page: 3, sort: "newest" });
    const q = p.holBedarfe()[0];
    assert.match(q.sql, /LIMIT \$1 OFFSET \$3/, "die Bedarfsabfrage hat keinen OFFSET — jede Seite beginnt von vorn");
    assert.strictEqual(q.params[0], 4, "das Limit stimmt nicht");
    assert.strictEqual(q.params[2], 8, "der Versatz stimmt nicht");
  });

  it("…und mit Rangfenster blaettert sie trotzdem: Seite 3 wiederholt Seite 1 nicht", async () => {
    /*
     * Die WIRKUNG, um die es N2.7 ging: keine Seite beginnt von vorn. Sie darf
     * nicht daran haengen, WO der Versatz steht — sonst waere der Waechter mit
     * dem naechsten Umbau gruen, obwohl die Blaetterung kaputt ist.
     */
    const bedarfe = Array.from({ length: 20 }, (_, i) => ({
      id: `d-${String(i).padStart(2, "0")}`, feed_type: "demand", status: "open",
      updated_at: `2026-09-${String(i + 1).padStart(2, "0")}`,
      created_at: `2026-09-${String(i + 1).padStart(2, "0")}`
    }));
    const eins = await browseFeed(feedPool({ bedarfe }), { viewer_role: "agency", limit: 4, page: 1 });
    const drei = await browseFeed(feedPool({ bedarfe }), { viewer_role: "agency", limit: 4, page: 3 });
    assert.strictEqual(eins.items.length, 4, "die Seite ist keine Seite mehr");
    assert.strictEqual(drei.items.length, 4);
    const aufEins = new Set(eins.items.map((i) => i.id));
    assert.ok(drei.items.every((i) => !aufEins.has(i.id)),
      "Seite 3 zeigt Zeilen von Seite 1 — die Blaetterung beginnt wieder von vorn");
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

    /* Ohne Rangfenster (ausdrueckliche Sortierung) bleibt es bei offset+limit. */
    const q = feedPool();
    await browseFeed(q, { limit: 4, page: 3, sort: "newest" });
    assert.deepStrictEqual(q.holAngebote()[0].params.slice(-2), [12, 0]);
    assert.deepStrictEqual([q.holBedarfe()[0].params[0], q.holBedarfe()[0].params[2]], [12, 0]);
    /* Seit N3.4 ist das Fenster das RANGFENSTER (500) statt offset+limit —
       beide Seiten holen weiterhin AB 0, und geschnitten wird danach. Genau das
       ist der Punkt dieser Probe: keine Seite blaettert fuer sich allein. */
    assert.deepStrictEqual(a.params.slice(-2), [500, 0], "das Angebotsfenster beginnt nicht bei 0");
    assert.deepStrictEqual([b.params[0], b.params[2]], [500, 0], "das Bedarfsfenster beginnt nicht bei 0");
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


/* ═══════════════════════════════════════════════════════════════════════
   N2.8 — DIE FREIE KOPFZAHL FILTERT IN SQL, NICHT HINTER DEM LIMIT
   ═══════════════════════════════════════════════════════════════════════
 *
 * SQL filterte `cp.headcount >= N` (GESAMT), JavaScript danach
 * `remaining_headcount >= N` (FREI). Ein Angebot "20 gesamt, 19 zugesagt" kam
 * bei "mindestens 2" durch SQL, wurde gezaehlt — und fiel dann aus der Seite.
 *
 * Gegen die laufende Datenbank belegt (Transaktion mit ROLLBACK, Angebot mit
 * 20 Plaetzen, 19 zugesagt): "mindestens 2" -> nicht im Feed, total 5 = 5
 * Eintraege; "mindestens 1" -> im Feed, 7 = 7; voll gebucht bei Status
 * `active` -> nicht im Feed, 6 = 6. Unter dem alten Code war `total` in jedem
 * Filterfall groesser als die Zahl der Eintraege.
 *
 * Und ein zweiter, schwererer Befund in derselben Formel: zwei Zuweisungen am
 * selben Angebot VERDOPPELTEN die Zusage (19 -> 38), weil `assignments`
 * direkt dazugejoint wurde. Die freie Kopfzahl fiel auf null, und
 * `syncCapacityCommercialState` nahm das Angebot als `reserved` aus dem Markt.
 */

describe("N2.8 · die freie Kopfzahl filtert in SQL", () => {

  const zeilen = { angebote: 0 };
  function kopfzahlPool({ angebotsZeilen = [], zaehlung = null, zustaende = [] } = {}) {
    const calls = [];
    const lauf = async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/COUNT\(\*\)::int AS cnt/.test(s)) {
        return { rows: [{ cnt: /demand_requests dr/.test(s) ? 0 : (zaehlung ?? angebotsZeilen.length) }] };
      }
      if (/AS sort_date/.test(s) && /FROM capacity_posts cp/.test(s)) return { rows: angebotsZeilen.map((z) => ({ ...z })) };
      if (/committed_headcount/.test(s) && /GROUP BY cp\.id/.test(s)) return { rows: zustaende };
      return { rows: [], rowCount: 0 };
    };
    return { calls, query: lauf, connect: async () => ({ query: lauf, release() {} }) };
  }
  void zeilen;

  it("`min_headcount` filtert die FREIE Kopfzahl — in Zaehlung und Abfrage, mit gebundenem Wert", async () => {
    /* MIT Betrachter und Org, wie die Route aufruft: dann steht der Mindestwert
       NICHT an Stelle 1. Die erste Fassung rief ohne Betrachter auf — ein fest
       verdrahtetes `$1` blieb gruen, weil der Wert zufaellig dort lag
       (Befund der kleinen Gegenpruefung vom 13.09.). */
    const p = kopfzahlPool();
    await browseFeed(p, { viewer_role: "company", viewer_user_id: "11111111-1111-4111-8111-111111111111",
      viewer_company_org_id: "22222222-2222-4222-8222-222222222222", min_headcount: 4, limit: 10 });
    const zaehlung = p.calls.find((c) => /COUNT\(\*\)::int AS cnt/.test(c.sql) && /FROM capacity_posts cp/.test(c.sql));
    const abfrage = p.calls.find((c) => /AS sort_date/.test(c.sql));
    for (const [name, q] of [["Zaehlung", zaehlung], ["Abfrage", abfrage]]) {
      assert.ok(q, name + " lief nicht");
      const m = /LEAST\(GREATEST\(cp\.headcount - COALESCE\(zusage\.zugesagt, 0\), 0\), pool_frei\.frei\) >= \$(\d+)/.exec(q.sql);
      assert.ok(m, `${name}: der Mindestfilter prueft nicht die freie Kopfzahl`);
      assert.notStrictEqual(Number(m[1]), 1, `${name}: der Mindestfilter haengt an $1 — dort steht der Betrachter`);
      assert.strictEqual(q.params[Number(m[1]) - 1], 4, `${name}: der Platzhalter traegt nicht den Mindestwert`);
      assert.ok(!/cp\.headcount >= \$\d+/.test(q.sql), `${name}: die Gesamt-Kopfzahl filtert wieder`);
    }
  });

  it("Zaehlung UND Abfrage tragen GENAU den geteilten Zusage-Block — und zwar vor dem WHERE", async () => {
    /*
     * Die erste Fassung pruefte nur, dass IRGENDEIN Lateral-Block mit `o_zu`
     * dasteht. Ein am Aufrufort abgewandelter Block (in der Zaehlung
     * `'accepted'` -> `IN ('accepted','pending')`) liess Zaehlung und Seite
     * verschieden rechnen — genau der Fehler, den N2.8 behebt — und blieb gruen.
     * Ebenso ein Block HINTER dem WHERE: ungueltiges SQL, aber die Regex passte.
     */
    const p = kopfzahlPool();
    await browseFeed(p, { viewer_role: "company", limit: 10 });
    const block = _FUER_PROBEN.FREIE_KOPFZAHL_JOIN;
    const ziele = p.calls.filter((c) => /FROM capacity_posts cp/.test(c.sql) && (/COUNT\(\*\)/.test(c.sql) || /AS sort_date/.test(c.sql)));
    assert.strictEqual(ziele.length, 2, "Zaehlung und Abfrage wurden nicht beide gefunden");
    for (const q of ziele) {
      const stelle = q.sql.indexOf(block);
      assert.ok(stelle >= 0, "eine Abfrage traegt einen abgewandelten oder gar keinen Zusage-Block");
      const where = q.sql.indexOf("WHERE", stelle + block.length);
      assert.ok(where > stelle, "der Zusage-Block steht nicht vor dem WHERE");
    }
  });

  it("der Zusage-Block selbst: je Angebot, summiert, mit Bedarf verbunden", () => {
    /*
     * Diese Bestandteile pinnt keine andere Probe — und jede Abwandlung blieb in
     * der kleinen Gegenpruefung gruen: `capacity_post_id = cp.id` ->
     * `IS NOT NULL` (die Zusagen der GANZEN Plattform), `SUM` -> `MAX`,
     * `demand_requests ... ON TRUE` (Zusage mal Zahl aller Bedarfe), Alias
     * umbenannt (jede Feed-Abfrage bricht in Postgres ab).
     */
    const b = _FUER_PROBEN.FREIE_KOPFZAHL_JOIN;
    assert.ok(b.includes("WHERE o_zu.capacity_post_id = cp.id"), "die Zusage ist nicht an DIESES Angebot gebunden");
    assert.ok(b.includes("COALESCE(SUM("), "die Zusage wird nicht summiert");
    assert.ok(b.includes("LEFT JOIN demand_requests d_zu ON d_zu.id = o_zu.demand_request_id"),
      "der Bedarf ist nicht ueber seine Kennung verbunden");
    /* Mit Wortende, nicht als Teilzeichenkette: `zugesagt_n` ENTHAELT
       `zugesagt` — die erste Fassung dieser Zeile liess genau diese
       Umbenennung durch, und jede Feed-Abfrage waere in Postgres gescheitert. */
    assert.match(b, /\)::int AS zugesagt(?![A-Za-z0-9_])/, "die Spalte heisst nicht `zugesagt`");
    assert.ok(/\)\s*zusage ON TRUE\s*$/.test(b), "der Block heisst nicht `zusage`");
    assert.strictEqual(
      _FUER_PROBEN.FREIE_KOPFZAHL_SQL,
      "LEAST(GREATEST(cp.headcount - COALESCE(zusage.zugesagt, 0), 0), pool_frei.frei)",
      "die freie Kopfzahl liest nicht aus dem Block");
  });

  it("M4c.3: ein Sammelangebot wirbt nie mit mehr Menschen, als frei sind", () => {
    /*
     * Die Zusage-Rechnung oben zieht ab, was auf DIESEM Angebot zugesagt wurde.
     * Ein Mitglied kann aber ANDERSWO gebunden sein — über sein eigenes
     * Einzelangebot, ein zweites Sammelangebot, eine Zuweisung ausserhalb des
     * Marktplatzes. Gemessen am 2026-09-24 gegen die Entwicklungsdatenbank stand
     * derselbe Mensch gleichzeitig in einem aktiven Sammelangebot UND in einem
     * aktiven Einzelangebot.
     *
     * Der Sweep (workerOfferReservationService) pausiert erst, wenn KEIN Mitglied
     * mehr frei ist. Die Teilbelegung — 30 beworben, 29 gebunden — faengt nur
     * diese Deckelung. Ohne sie wirbt das Angebot weiter mit 30.
     */
    const b = _FUER_PROBEN.POOL_FREI_JOIN;
    assert.ok(b.includes("capacity_post_pool_members"), "die Mitglieder werden nicht gelesen");
    assert.ok(b.includes("m.capacity_post_id = cp.id"),
      "die Mitglieder sind nicht an DIESES Angebot gebunden");
    assert.ok(b.includes("walm.is_active = TRUE"), "ein beendeter Einsatz bindet weiter");
    assert.ok(b.includes("walm.end_date IS NULL OR walm.end_date >= CURRENT_DATE"),
      "die Datumsregel fehlt — die Bindung liefe nie ab");
    assert.ok(b.includes("NOT EXISTS"), "gezaehlt werden die gebundenen statt der freien Mitglieder");
    /*
     * SUM statt COUNT trennt "alle Mitglieder gebunden" von "gar keine
     * Mitglieder". Migration 146 erlaubt ausdruecklich "pauschal N Helfer ohne
     * konkrete Personen". Ueber null Zeilen liefert SUM in Postgres NULL, COUNT
     * dagegen 0 — mit COUNT deckelte LEAST jedes pauschale Sammelangebot der
     * Plattform auf null freie Plaetze, und es verschwaende aus dem Feed. Ein
     * stiller Totalausfall, den keine Fehlermeldung anzeigt.
     *
     * Die Rueckmutation dazu ist genau ein Wort: SUM -> COUNT.
     */
    assert.ok(b.includes("SUM(CASE WHEN NOT EXISTS"),
      "ohne SUM liefert der Block 0 statt NULL — pauschale Sammelangebote verschwinden");
    assert.ok(!/COUNT\(/.test(b),
      "COUNT im Block macht aus 'keine Mitglieder' ein 'null frei'");
    assert.ok(/\)\s*pool_frei ON TRUE\s*$/.test(b), "der Block heisst nicht `pool_frei`");
    assert.match(b, /\)::int AS frei(?![A-Za-z0-9_])/, "die Spalte heisst nicht `frei`");
    assert.ok(_FUER_PROBEN.FREIE_KOPFZAHL_SQL.includes("pool_frei.frei"),
      "die freie Kopfzahl liest die Deckelung nicht");
  });

  it("M4c.3: die Deckelung steht in BEIDEN Abfragen — Zaehlung und Seite", async () => {
    /*
     * Stuende sie nur in der Seite, zaehlte die Trefferzahl Angebote mit, die die
     * Seite dann weglaesst — derselbe Auseinanderlauf, den N2.8 behoben hat, nur
     * eine Ebene tiefer. Und stuende sie hinter dem WHERE, waere das Postgres
     * ungueltiges SQL, waehrend eine reine Teilzeichenketten-Probe gruen bliebe.
     */
    const p = kopfzahlPool();
    await browseFeed(p, { viewer_role: "company", limit: 10 });
    const block = _FUER_PROBEN.POOL_FREI_JOIN;
    const ziele = p.calls.filter((c) => /FROM capacity_posts cp/.test(c.sql) && (/COUNT\(\*\)/.test(c.sql) || /AS sort_date/.test(c.sql)));
    assert.strictEqual(ziele.length, 2, "Zaehlung und Abfrage wurden nicht beide gefunden");
    for (const q of ziele) {
      const stelle = q.sql.indexOf(block);
      assert.ok(stelle >= 0, "eine Abfrage traegt die Deckelung nicht oder abgewandelt");
      const where = q.sql.indexOf("WHERE", stelle + block.length);
      assert.ok(where > stelle, "die Deckelung steht nicht vor dem WHERE");
    }
  });

  it("hinter dem LIMIT wird NICHT mehr nach Kopfzahl gefiltert — die Zahl bleibt stimmig", async () => {
    /*
     * Was SQL liefert, bleibt auf der Seite. Kaeme eine JS-Kopie des Filters
     * zurueck, verwuerfe sie bei der kleinsten Abweichung wieder Zeilen, die
     * gezaehlt wurden — kurze Seite, falsche Zahl. Deshalb liefert der
     * Muster-Pool hier eine Zeile, die die JS-Kopie verwerfen WUERDE.
     */
    const p = kopfzahlPool({
      angebotsZeilen: [{ id: "cp-1", supplier_company_id: "s1", status: "active", is_active: true,
        visibility_status: "public", headcount: 5, sort_date: "2026-09-10" }],
      zustaende: [{ capacity_post_id: "cp-1", committed_headcount: 5, counterparty_user_ids: [] }]
    });
    const e = await browseFeed(p, { viewer_role: "company", min_headcount: 4, limit: 10 });
    assert.strictEqual(e.items.length, 1, "eine JS-Kopie des Kopfzahl-Filters verwirft wieder hinter dem LIMIT");
    assert.strictEqual(e.total, e.items.length, "Zahl und Seite laufen auseinander");
  });

  it("ein aktives Angebot ohne freien Platz wird in SQL ausgeschlossen", async () => {
    const p = kopfzahlPool();
    await browseFeed(p, { viewer_role: "company", limit: 10 });
    const ziele = p.calls.filter((c) => /FROM capacity_posts cp/.test(c.sql) && (/COUNT\(\*\)/.test(c.sql) || /AS sort_date/.test(c.sql)));
    /* Ohne diese Zeile konnte die Probe gruen sein, ohne eine einzige Abfrage
       geprueft zu haben — eine leere Schleife sichert nichts zu. */
    assert.strictEqual(ziele.length, 2, "Zaehlung und Abfrage wurden nicht beide gefunden");
    for (const q of ziele) {
      assert.match(q.sql, /\(cp\.status <> 'active' OR LEAST\(GREATEST\(cp\.headcount - COALESCE\(zusage\.zugesagt, 0\), 0\), pool_frei\.frei\) > 0\)/);
    }
  });

  it("EINE Formel fuer die Zusage — in allen vier Rechnungen, die tatsaechlich gesendet werden", async () => {
    /*
     * Die Formel stand DREIMAL im Repo. Die erste Fassung dieser Probe hiess
     * schon "EINE Formel" und pruefte nur zwei davon — Marktplatz-Treffer und
     * Discovery ("N Kraefte verfuegbar") rechneten weiter mit eigenen Kopien.
     * Jetzt kommt sie aus `zusageFormel.js`, und geprueft wird der SQL-Text,
     * den jede Rechnung wirklich absendet.
     */
    const { zugesagtJeAngebotSql } = await import("../services/zusageFormel.js");
    const marktDienst = await import("../services/marketplaceService.js");
    const discovery = await import("../services/capacityDiscoveryService.js");

    const handelPool = kopfzahlPool();
    await getCapacityCommercialStates(handelPool, ["cp-1"]);
    assert.ok(handelPool.calls.find((c) => /committed_headcount/.test(c.sql)).sql.includes(zugesagtJeAngebotSql("o", "d")),
      "der Handelsstand rechnet mit einer eigenen Formel");

    assert.ok(_FUER_PROBEN.FREIE_KOPFZAHL_JOIN.includes(zugesagtJeAngebotSql("o_zu", "d_zu")),
      "der Feed rechnet mit einer eigenen Formel");

    const trefferPool = kopfzahlPool();
    await marktDienst.runInitialMatching(trefferPool, { start_date: "2026-10-01", end_date: null }, new Set());
    assert.ok(trefferPool.calls.some((c) => c.sql.includes(zugesagtJeAngebotSql("o", "dr"))),
      "die Marktplatz-Treffer rechnen mit einer eigenen Formel");

    const discoveryPool = kopfzahlPool();
    await discovery.aggregateByRole(discoveryPool, {});
    assert.ok(discoveryPool.calls.some((c) => c.sql.includes(zugesagtJeAngebotSql("o", "dr"))),
      "die Discovery-Zahlen rechnen mit einer eigenen Formel");

    for (const q of [...handelPool.calls, ...trefferPool.calls, ...discoveryPool.calls]) {
      assert.ok(!/THEN GREATEST\(COALESCE\(o\.offered_quantity, dr?\.headcount, 0\), 0\)/.test(
        q.sql.split(zugesagtJeAngebotSql("o", "d")).join("").split(zugesagtJeAngebotSql("o", "dr")).join("")),
        "neben der geteilten Formel steht noch eine Abschrift");
    }
    assert.throws(() => zugesagtJeAngebotSql("o; DROP TABLE offers --", "d"), /ZUSAGE_ALIAS_UNGUELTIG/);
  });

  it("Zuweisungen verdoppeln die Zusage nicht — sie werden je Angebot vorab summiert", async () => {
    /*
     * `assignments.offer_id` ist nicht eindeutig. Direkt dazugejoint, taucht ein
     * Angebot mit zwei Zuweisungen zweimal auf, und SUM zaehlt seine Zusage
     * doppelt. Gegen die Datenbank gemessen: 19 statt 38.
     */
    const p = kopfzahlPool();
    await getCapacityCommercialStates(p, ["cp-1"]);
    const sql = p.calls.find((c) => /committed_headcount/.test(c.sql)).sql;
    assert.ok(!/LEFT JOIN assignments a ON a\.offer_id = o\.id/.test(sql),
      "die Zuweisungen werden wieder direkt dazugejoint — dann verdoppelt sich die Zusage");
    assert.match(sql, /LEFT JOIN LATERAL \([\s\S]*FROM assignments a1[\s\S]*WHERE a1\.offer_id = o\.id[\s\S]*\) a ON TRUE/,
      "die Zuweisungen werden nicht je Angebot zusammengefasst");
    /* Welche Spalte unter welchem Namen summiert wird, pinnte die erste Fassung
       nicht: vertauscht lieferte der Handelsstand besetzte und reservierte
       Kopfzahl verkehrt herum — und blieb gruen. */
    assert.ok(sql.includes("COALESCE(SUM(a1.filled_quantity), 0) AS filled_quantity"),
      "die besetzte Kopfzahl wird nicht aus `filled_quantity` summiert");
    assert.ok(sql.includes("COALESCE(SUM(a1.reserved_quantity), 0) AS reserved_quantity"),
      "die reservierte Kopfzahl wird nicht aus `reserved_quantity` summiert");
    assert.match(sql, /THEN COALESCE\(a\.filled_quantity, 0\)[\s\S]*?AS assigned_headcount/,
      "`assigned_headcount` liest nicht die besetzte Kopfzahl");
    assert.match(sql, /THEN COALESCE\(a\.reserved_quantity, 0\)[\s\S]*?AS staffing_reserved_headcount/,
      "`staffing_reserved_headcount` liest nicht die reservierte Kopfzahl");
  });
});

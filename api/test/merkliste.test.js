/**
 * P9 Spur B / Welle B2 — die Merkliste.
 *
 * DIE LEITFRAGE DER SPUR
 * Ein Merken-Knopf ohne Liste ist ein Knopf, der nichts tut: er erzeugt einen
 * Datensatz, den niemand je wiedersieht. B1 hat den Schalter gebaut, B2 die Liste.
 *
 * DER PUNKT DIESER WELLE
 * Ein gemerkter Bedarf, der laengst besetzt ist, wird als besetzt AUSGEWIESEN und
 * nicht ausgeblendet. Verschwinden liesse die Liste kaputt wirken ("ich hatte da
 * doch etwas gemerkt"); ihn stillschweigend weiter als offen zu zeigen waere
 * gelogen. Genau diese Mitte prueft der Test.
 *
 * Run: node --test --test-force-exit test/merkliste.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ce from "../services/capacityExchangeService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEITE = path.resolve(__dirname, "..", "..", "frontend/public/deal_management.html");
// Im API-Container ist `frontend/` nicht gemountet.
const seiteLesbar = fs.existsSync(SEITE);

function trackingPool(rows = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows, rowCount: rows.length };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const HEUTE = "2026-08-09";

/* ── 1. Der Lebenszustand ──────────────────────────────────────────────── */

describe("P9/B2 · Was aus einem gemerkten Eintrag geworden ist", () => {
  it("ein besetzter Bedarf gilt als vergeben", () => {
    assert.equal(ce.merklistenZustand({ id: "d", art: "demand", status: "fulfilled" }, HEUTE), "vergeben");
  });

  it("eine besetzte oder reservierte Kapazitaet ebenso", () => {
    assert.equal(ce.merklistenZustand({ id: "c", art: "supply", status: "filled" }, HEUTE), "vergeben");
    assert.equal(ce.merklistenZustand({ id: "c", art: "supply", status: "reserved" }, HEUTE), "vergeben");
  });

  it("abgelaufene Zeitraeume gelten als abgelaufen — auch bei aktivem Status", () => {
    assert.equal(
      ce.merklistenZustand({ id: "c", art: "supply", status: "active", availability_to: "2026-07-31" }, HEUTE),
      "abgelaufen",
      "der Marktplatz blendet solche Eintraege aus; in der Merkliste muessen sie erklaert werden"
    );
  });

  it("ein offenes Ende bleibt offen", () => {
    assert.equal(
      ce.merklistenZustand({ id: "c", art: "supply", status: "active", availability_to: null }, HEUTE),
      "offen"
    );
  });

  it("ein Eintrag ohne Quelle ist entfernt, keine leere Zeile", () => {
    assert.equal(ce.merklistenZustand(null, HEUTE), "entfernt");
    assert.equal(ce.merklistenZustand({ art: "supply" }, HEUTE), "entfernt");
  });
});

/* ── 2. Die Abfrage ────────────────────────────────────────────────────── */

describe("P9/B2 · Die Liste holt beide Richtungen und nur die eigene", () => {
  it("liest Kapazitaeten UND Bedarfe in einer Abfrage", async () => {
    const pool = trackingPool([]);
    await ce.ladeMerkliste(pool, "u1");
    const sql = pool.calls[0].sql;

    assert.match(sql, /UNION ALL/, "sonst sieht nur eine Marktseite ihre Merkliste");
    assert.match(sql, /JOIN capacity_posts cp/);
    assert.match(sql, /JOIN demand_requests dr/);
    assert.equal(pool.calls.length, 1, "eine Abfrage genuegt — kein Nachladen je Eintrag");
  });

  it("liest ausschliesslich die eigene Merkliste", async () => {
    const pool = trackingPool([]);
    await ce.ladeMerkliste(pool, "u1");
    const sql = pool.calls[0].sql;

    const treffer = sql.match(/ci\.company_user_id = \$1/g) || [];
    assert.equal(treffer.length, 2,
      "beide Zweige der UNION muessen auf den Betrachter eingeschraenkt sein — "
      + "fehlt es in einem, sieht jemand fremde Merklisten");
    assert.equal(pool.calls[0].params[0], "u1");
  });

  it("nimmt nur Merkungen, keine anderen Interaktionen", async () => {
    const pool = trackingPool([]);
    await ce.ladeMerkliste(pool, "u1");
    const treffer = pool.calls[0].sql.match(/ci\.interaction_type = 'save'/g) || [];
    assert.equal(treffer.length, 2,
      "sonst landen Fragen und Kontaktaufnahmen in der Merkliste");
  });

  it("die neueste Merkung steht oben", async () => {
    const pool = trackingPool([]);
    await ce.ladeMerkliste(pool, "u1");
    assert.match(pool.calls[0].sql, /ORDER BY gemerkt_am DESC/);
  });
});

/* ── 3. Das Gate: geschlossen heisst ausgewiesen, nicht ausgeblendet ───── */

describe("P9/B2 · Geschlossene Eintraege bleiben sichtbar", () => {
  it("ein besetzter Bedarf bleibt in der Liste und traegt seinen Zustand", async () => {
    const pool = trackingPool([
      { id: "d1", art: "demand", title: "Bedarf", status: "fulfilled", gemerkt_am: "2026-08-01" },
      { id: "c1", art: "supply", title: "Kapazitaet", status: "active", availability_to: null, gemerkt_am: "2026-08-02" }
    ]);
    const liste = await ce.ladeMerkliste(pool, "u1");

    assert.equal(liste.length, 2, "nichts wird ausgeblendet — sonst wirkt die Liste kaputt");
    assert.equal(liste.find((i) => i.id === "d1").zustand, "vergeben");
    assert.equal(liste.find((i) => i.id === "c1").zustand, "offen");
  });

  it("jeder Eintrag fuehrt auf den konkreten Eintrag, nicht auf eine Uebersicht", async () => {
    const pool = trackingPool([
      { id: "d1", art: "demand", status: "open" },
      { id: "c1", art: "supply", status: "active" }
    ]);
    const liste = await ce.ladeMerkliste(pool, "u1");

    assert.match(liste.find((i) => i.id === "d1").link, /demand=d1/,
      "Sackgassen sind laut CLAUDE.md verboten — der Link muss zum Eintrag fuehren");
    assert.match(liste.find((i) => i.id === "c1").link, /id=c1/);
  });
});

/* ── 4. Der Reiter bei "Meine Deals" (Welle B3) ────────────────────────── */

describe("P9/B3 · Die Merkliste ist erreichbar",
  { skip: !seiteLesbar && "frontend/ nicht verfuegbar (API-Container)" }, () => {
  const seite = seiteLesbar ? fs.readFileSync(SEITE, "utf8") : "";

  it("es gibt einen Reiter mit Zaehler", () => {
    assert.match(seite, /data-filter="watchlist"/, "ohne Reiter bleibt die Liste unerreichbar");
    assert.match(seite, /id="cnt-watchlist"/);
  });

  it("der Reiter laedt die Merkliste statt der Deals", () => {
    assert.match(seite, /currentFilter === 'watchlist'/,
      "sonst zeigt der Reiter die Deal-Liste — ein Reiter, der nichts anderes tut");
    assert.match(seite, /\/marketplace\/watchlist/);
  });

  it("jeder Eintrag laesst sich direkt aus der Liste entfernen", () => {
    assert.match(seite, /data-unsave-id=/,
      "sonst muesste man zum Entfernen an den Ort zurueck, an dem man gemerkt hat");
    assert.match(seite, /TC\.api\.delete\(/);
  });

  it("der Leerzustand erklaert den Weg, statt nur zu melden", () => {
    assert.match(seite, /deal\.wl\.empty/);
    assert.match(seite, /deal\.wl\.toMarket/, "Quicklink auf den Marktplatz fehlt");
  });

  it("alle neuen Texte stehen in BEIDEN Woerterbuechern", () => {
    const schluessel = [
      "deal.tab.watchlist", "deal.wl.open", "deal.wl.taken", "deal.wl.expired",
      "deal.wl.removed", "deal.wl.unsave", "deal.wl.toMarket", "deal.wl.empty",
      "deal.wl.kind.supply", "deal.wl.kind.demand"
    ];
    for (const k of schluessel) {
      const treffer = seite.match(new RegExp("'" + k.replace(/\./g, "\.") + "':", "g")) || [];
      assert.equal(treffer.length, 2,
        `"${k}" steht ${treffer.length}x statt 2x — DE und EN muessen dieselben Schluessel tragen`);
    }
  });
});

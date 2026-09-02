/**
 * EINE Tabelle entscheidet, wie viele Anzeigen ein Plan haben darf (M1.7).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Es gab zwei. `services/userService.js` fuehrt `PLAN_LIMITS` mit
 * `listings: -1` fuer PRO und INDIVIDUELL — unbegrenzt, so ist es verkauft.
 * `services/capacityExchangeService.js` fuehrte DANEBEN eine eigene:
 *
 *     DEMO 0 · FREE 0 · BASIS 5 · PLUS 20 · PRO 50 · INDIVIDUELL 999
 *
 * Und die zweite gewann, denn sie stand im Schreibpfad. Eine PRO-Agentur, die
 * ihre 51. Anzeige einstellte, bekam `PLAN_LIMIT` — fuer eine Leistung, fuer
 * die sie 799 EUR im Monat zahlt. INDIVIDUELL war bei 999 gedeckelt.
 *
 * Owner-Entscheid M-E3: unbegrenzt, und der abweichende Wert wird GELOESCHT,
 * nicht angeglichen. Zwei Tabellen fuer dieselbe Grenze sind der Fehler, nicht
 * ihr Inhalt — angeglichen waeren sie beim naechsten Preisumbau wieder
 * auseinander.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE FALLE BEIM LOESCHEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die verbleibende Tabelle schreibt "unbegrenzt" als `-1`. Wer die zweite
 * einfach durch die erste ersetzt, bekommt:
 *
 *     if (cnt >= limit)   ->   if (cnt >= -1)   ->   IMMER wahr
 *
 * Aus "unbegrenzt" waere "gar nichts" geworden, und zwar fuer genau die zwei
 * teuersten Plaene. Die Proben pruefen deshalb nicht die ZAHL, sondern das
 * VERHALTEN: eine PRO-Agentur mit 500 aktiven Anzeigen darf die 501. anlegen.
 *
 * Run: node --test --test-force-exit test/einSchreiber.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as svc from "../services/capacityExchangeService.js";
import { PLAN_LIMITS } from "../services/userService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ohneKommentare = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Pool, der die Zaehlabfrage mit `cnt` beantwortet und sonst leer bleibt. */
function poolMitBestand(cnt) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      if (String(sql).includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt }] };
      return { rows: [] };
    }
  };
}

const ANZEIGE = { status: "active", title: "t", role: "r", org_id: null };

describe("M1.7 · unbegrenzt heisst unbegrenzt", () => {
  it("Selbstprobe: die eine Tabelle sagt fuer PRO wirklich -1", () => {
    /* Ohne das pruefen die Proben darunter nichts — sie waeren gruen, weil
     * die Grenze zufaellig hoch genug liegt. */
    assert.equal(Number(PLAN_LIMITS.PRO.listings), -1);
    assert.equal(Number(PLAN_LIMITS.INDIVIDUELL.listings), -1);
  });

  it("PRO mit 500 aktiven Anzeigen darf die 501. anlegen", async () => {
    /* Die Akzeptanz aus dem Plan, woertlich. Vorher: PLAN_LIMIT ab der 51. */
    const pool = poolMitBestand(500);
    await assert.doesNotReject(() => svc.createCapacityEntry(pool, "sup", "PRO", { ...ANZEIGE }));
  });

  it("INDIVIDUELL ebenso — 999 war auch eine Grenze", async () => {
    const pool = poolMitBestand(5000);
    await assert.doesNotReject(() => svc.createCapacityEntry(pool, "sup", "INDIVIDUELL", { ...ANZEIGE }));
  });

  it("DEMO darf weiterhin gar nichts", async () => {
    const pool = poolMitBestand(0);
    await assert.rejects(
      () => svc.createCapacityEntry(pool, "sup", "DEMO", { ...ANZEIGE }),
      (e) => e.code === "PLAN_LIMIT"
    );
    assert.equal(pool.calls.length, 0, "der Riegel greift vor der ersten Abfrage");
  });

  it("BASIS bleibt bei fuenf — die Grenze gilt weiter, wo sie gilt", async () => {
    /* Ohne diese Probe waere "unbegrenzt fuer alle" ein gruener Weg. */
    const pool = poolMitBestand(5);
    await assert.rejects(
      () => svc.createCapacityEntry(pool, "sup", "BASIS", { ...ANZEIGE }),
      (e) => e.code === "PLAN_LIMIT"
    );
    const knapp = poolMitBestand(4);
    await assert.doesNotReject(() => svc.createCapacityEntry(knapp, "sup", "BASIS", { ...ANZEIGE }));
  });

  it("ein unbekannter Plan bekommt nichts, nicht alles", async () => {
    const pool = poolMitBestand(0);
    await assert.rejects(
      () => svc.createCapacityEntry(pool, "sup", "GIBTESNICHT", { ...ANZEIGE }),
      (e) => e.code === "PLAN_LIMIT"
    );
  });
});

describe("M1.7 · es gibt nur EINEN Schreiber der Grenze", () => {
  it("capacityExchangeService fuehrt keine eigene Plan-Tabelle mehr", () => {
    const s = ohneKommentare(quelle("services/capacityExchangeService.js"));
    assert.ok(!/PRO:\s*50/.test(s), "die zweite Wahrheit steht wieder da");
    assert.ok(!/INDIVIDUELL:\s*999/.test(s), "und ihr Deckel ebenso");
    assert.ok(!/const PLAN_LIMITS\s*=\s*\{/.test(s),
      "eine eigene Tabelle ist der Fehler, unabhaengig von ihrem Inhalt");
  });

  it("die Zahl kommt aus der einen Tabelle", () => {
    const s = ohneKommentare(quelle("services/capacityExchangeService.js"));
    assert.match(s, /import \{[^}]*PLAN_LIMITS[^}]*\} from "\.\/userService\.js"/);
    assert.match(s, /PLAN_LIMITS\[plan\]\?\.listings/);
  });

  it("AUCH DER AKTIVIERUNGSWEG kennt unbegrenzt — nicht nur das Anlegen", async () => {
    /*
     * Die erste Fassung dieser Probe zaehlte Vorkommen von `unbegrenzt(limit)`
     * im Quelltext und verlangte drei. Sie hat den Fehler NICHT gefangen: das
     * Muster trifft auch die Funktions-DEFINITION mit, also blieben nach dem
     * Entfernen einer Pruefstelle immer noch drei uebrig. Eine Zaehlprobe
     * zaehlt, was sie zaehlt — nicht, was sie meint.
     *
     * Jetzt wird das Verhalten geprueft: eine PRO-Agentur mit 500 aktiven
     * Anzeigen darf einen Entwurf aktivieren. Ohne die -1-Behandlung an
     * dieser Stelle waere `cnt >= -1` immer wahr, und Reaktivieren waere fuer
     * genau die zwei teuersten Plaene gesperrt.
     */
    const zukunft = new Date(Date.now() + 7 * 86400000).toISOString();
    const entwurf = {
      id: "cap-1", status: "draft", title: "t", role: "r",
      availability_from: "2026-07-01", location_city: "HH", headcount: 2,
      valid_until: zukunft, supplier_company_id: "sup"
    };
    const pool = {
      calls: [],
      query: async (sql) => {
        const q = String(sql);
        pool.calls.push(q);
        if (q.includes("SELECT * FROM capacity_posts")) return { rows: [entwurf] };
        if (q.includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt: 500 }] };
        return { rows: [{ ...entwurf, status: "active" }] };
      }
    };
    const r = await svc.transitionStatus(pool, "cap-1", "sup", "active", "PRO");
    assert.notEqual(r?.error, "PLAN_LIMIT",
      "PRO ist unbegrenzt — auch beim Aktivieren und Reaktivieren");
    assert.ok(!pool.calls.some((q) => q.includes("COUNT(*)::int AS cnt")),
      "bei unbegrenzt wird gar nicht erst gezaehlt");
  });

  it("BASIS wird beim Aktivieren weiterhin gebremst", async () => {
    /* Gegenstueck: ohne diese Probe waere "nie zaehlen" ein gruener Weg. */
    const zukunft = new Date(Date.now() + 7 * 86400000).toISOString();
    const entwurf = {
      id: "cap-1", status: "draft", title: "t", role: "r",
      availability_from: "2026-07-01", location_city: "HH", headcount: 2,
      valid_until: zukunft, supplier_company_id: "sup"
    };
    const pool = {
      query: async (sql) => {
        const q = String(sql);
        if (q.includes("SELECT * FROM capacity_posts")) return { rows: [entwurf] };
        if (q.includes("COUNT(*)::int AS cnt")) return { rows: [{ cnt: 5 }] };
        return { rows: [] };
      }
    };
    const r = await svc.transitionStatus(pool, "cap-1", "sup", "active", "BASIS");
    assert.equal(r?.error, "PLAN_LIMIT");
    assert.equal(r?.limit, 5);
  });
});

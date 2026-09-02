/**
 * Getrennte Grenzen je Org-Typ (M1.8).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS DAS ABNAHMEKRITERIUM ERZWINGT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid M-E5: Struktur jetzt, Werte spaeter — und "ein geaenderter
 * Wert wirkt OHNE NEUBAU". Dieser Halbsatz entscheidet die Bauart: eine Zahl
 * im Quelltext verlangt ein neues Abbild, also gehoeren die Werte in die
 * Datenbank (Tier 3 der Config-Taxonomie).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE TABELLE HAELT NUR ABWEICHUNGEN — UND WARUM DAS DIE KERNPROBE IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Am selben Tag hat M1.7 eine zweite Limit-Tabelle GELOESCHT: sie behauptete
 * dieselben Grenzen ein zweites Mal (`PRO: 50` neben `listings: -1`), gewann,
 * weil sie im Schreibpfad sass, und sperrte eine PRO-Agentur bei der 51.
 * Anzeige.
 *
 * Waere die neue Tabelle mit den heutigen Werten befuellt worden, waere
 * dieselbe Doppelung sofort zurueck. Deshalb prueft die erste Probe hier
 * ausdruecklich: **leere Tabelle = exakt das Verhalten von vorher.**
 *
 * Run: node --test --test-force-exit test/orgTypGrenzen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ladeAbweichungen, abweichungFuer, ORG_TYPEN
} from "../services/orgTypGrenzenService.js";
import { getUsageAgainstLimits } from "../services/entitlementService.js";
import { PLAN_LIMITS } from "../services/userService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");

function musterPool(fn) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql || ""), params: params || [] });
      const r = fn ? await fn(String(sql || "")) : null;
      return r === undefined || r === null ? { rows: [] } : r;
    }
  };
}

const ZEILE = (org_type, plan, metrik, wert) => ({ org_type, plan, metrik, wert });

describe("M1.8 · die Abweichungen werden gelesen, nicht geraten", () => {
  it("LEER heisst: beide Seiten teilen den Code-Wert", async () => {
    const pool = musterPool(() => ({ rows: [] }));
    const karte = await ladeAbweichungen(pool);
    assert.deepEqual(karte, {});
    assert.deepEqual(abweichungFuer(karte, "agency", "PRO"), {});
    assert.deepEqual(abweichungFuer(karte, "company", "PRO"), {});
  });

  it("eine Abweichung wirkt NUR fuer ihren Typ und ihren Plan", async () => {
    const pool = musterPool(() => ({ rows: [ZEILE("agency", "PRO", "listings", 25)] }));
    const karte = await ladeAbweichungen(pool);
    assert.deepEqual(abweichungFuer(karte, "agency", "PRO"), { listings: 25 });
    assert.deepEqual(abweichungFuer(karte, "company", "PRO"), {}, "die andere Seite bleibt unberuehrt");
    assert.deepEqual(abweichungFuer(karte, "agency", "BASIS"), {}, "der andere Plan bleibt unberuehrt");
  });

  it("ein UNBEKANNTER Org-Typ faellt auf die Code-Vorgabe, nicht auf null", async () => {
    /* Alles andere waere eine Grenze aus Versehen. */
    const pool = musterPool(() => ({ rows: [ZEILE("agency", "PRO", "listings", 25)] }));
    const karte = await ladeAbweichungen(pool);
    assert.deepEqual(abweichungFuer(karte, "gibtesnicht", "PRO"), {});
    assert.deepEqual(abweichungFuer(karte, null, "PRO"), {});
    assert.deepEqual(abweichungFuer(null, "agency", "PRO"), {});
  });

  it("-1 ueberlebt als -1 — dieselbe Schreibweise wie PLAN_LIMITS", async () => {
    /* Eine zweite Konvention fuer "unbegrenzt" waere genau der Fehler, den
     * M1.7 an diesem Tag beseitigt hat. */
    const pool = musterPool(() => ({ rows: [ZEILE("company", "PLUS", "listings", -1)] }));
    const karte = await ladeAbweichungen(pool);
    assert.equal(abweichungFuer(karte, "company", "PLUS").listings, -1);
  });

  it("unbrauchbare Zeilen werden uebersprungen, nicht als 0 gelesen", async () => {
    const pool = musterPool(() => ({
      rows: [
        ZEILE("", "PRO", "listings", 5),
        ZEILE("agency", "", "listings", 5),
        ZEILE("agency", "PRO", "", 5),
        { org_type: "agency", plan: "PRO", metrik: "listings", wert: "keine Zahl" },
        ZEILE("agency", "PRO", "users", 7)
      ]
    }));
    const karte = await ladeAbweichungen(pool);
    assert.deepEqual(abweichungFuer(karte, "agency", "PRO"), { users: 7 });
  });

  it("DER LESER WIRFT NIE — auch nicht ohne Tabelle", async () => {
    const pool = musterPool(() => { throw new Error("relation does not exist"); });
    assert.deepEqual(await ladeAbweichungen(pool), {},
      "ein Fehler hier darf keine Grenze verschieben, in keine Richtung");
  });

  it("ohne Pool wird gar nicht erst gefragt", async () => {
    assert.deepEqual(await ladeAbweichungen(null), {});
  });

  it("EINE Abfrage, nicht eine je Typ und Plan", async () => {
    const pool = musterPool(() => ({ rows: [] }));
    await ladeAbweichungen(pool);
    assert.equal(pool.calls.length, 1);
  });
});

describe("M1.8 · bewusst OHNE Zwischenspeicher", () => {
  it("jeder Aufruf fragt die Datenbank — die Abfragezahl ist verlaesslich", async () => {
    /*
     * Der erste Anlauf hatte einen Speicher mit 60 s Haltezeit. Er ist wieder
     * raus, weil derselbe Aufruf damit MAL EINE Abfrage stellte und mal keine,
     * je nachdem, was vorher lief. Fuer Muster-Pool-Proben, die Abfragen der
     * Reihe nach zaehlen, ist das eine Wackelquelle — `entitlementService
     * .test.js` wurde dadurch abhaengig von der Reihenfolge SEINER EIGENEN
     * Tests und meldete "Unexpected query #6".
     */
    const pool = musterPool(() => ({ rows: [] }));
    await ladeAbweichungen(pool);
    await ladeAbweichungen(pool);
    assert.equal(pool.calls.length, 2, "zwei Aufrufe, zwei Abfragen — ohne Ausnahme");
  });

  it("und der Wert wirkt sofort, nicht 'innerhalb einer Minute'", async () => {
    /* Das Abnahmekriterium lautet "ohne Neubau". Ohne Speicher stimmt es ohne
     * Sternchen: die zweite Antwort ist die neue. */
    let runde = 0;
    const pool = musterPool(() => {
      runde += 1;
      return { rows: runde === 1 ? [] : [ZEILE("agency", "PRO", "listings", 25)] };
    });
    assert.deepEqual(abweichungFuer(await ladeAbweichungen(pool), "agency", "PRO"), {});
    assert.deepEqual(abweichungFuer(await ladeAbweichungen(pool), "agency", "PRO"), { listings: 25 });
  });

  it("keine Haltezeit aus der Umgebung — es gibt gar keine", () => {
    const q = fs.readFileSync(path.join(API, "services/orgTypGrenzenService.js"), "utf8");
    assert.ok(!/process\.env/.test(q), "die Schicht darf nicht aus der Umgebung gesteuert werden");
    assert.ok(!/speicher/i.test(q.replace(/\/\*[\s\S]*?\*\//g, "")),
      "ein wiedereingefuehrter Speicher braucht eine neue Entscheidung, keinen stillen Einbau");
  });
});

/* ── Die Schichtung ───────────────────────────────────────────────────── */

describe("M1.8 · drei Schichten, und die Reihenfolge ist der Inhalt", () => {
  /** Pool, der eine Org mit gegebenem Typ und Plan liefert. */
  function orgPool(orgType, plan, abweichungen, custom = {}) {
    return musterPool((sql) => {
      if (sql.includes("plan_grenze_je_orgtyp")) return { rows: abweichungen };
      if (sql.includes("FROM organizations")) {
        return { rows: [{ id: "org-1", name: "X", type: orgType, plan, ...custom }] };
      }
      if (sql.includes("COUNT(*)")) return { rows: [{ cnt: 0 }] };
      return { rows: [] };
    });
  }

  it("OHNE Abweichung gilt exakt der Code-Wert — keine Verhaltensaenderung", async () => {
    /* Die wichtigste Probe der Welle: der Auslieferungszustand ist
     * unveraendert. Waere er es nicht, waere M1.8 ein Preisumbau. */
    const u = await getUsageAgainstLimits(orgPool("agency", "PRO", []), "org-1");
    assert.equal(Number(u.listings.limit), Number(PLAN_LIMITS.PRO.listings));
  });

  it("EINE Abweichung wirkt — und nur fuer ihren Typ", async () => {
    const agentur = await getUsageAgainstLimits(
      orgPool("agency", "PRO", [ZEILE("agency", "PRO", "listings", 25)]), "org-1");
    assert.equal(Number(agentur.listings.limit), 25);

    const firma = await getUsageAgainstLimits(
      orgPool("company", "PRO", [ZEILE("agency", "PRO", "listings", 25)]), "org-1");
    assert.equal(Number(firma.listings.limit), Number(PLAN_LIMITS.PRO.listings),
      "die Abweichung der Agenturen darf Firmen nicht treffen");
  });

  it("die je-Org-Vereinbarung STICHT die Org-Typ-Schicht", async () => {
    /*
     * Die Reihenfolge ist nicht Geschmack: eine Abweichung fuer ALLE Agenturen
     * darf eine Sondervereinbarung mit EINER Firma nicht ueberschreiben —
     * sonst kippt ein Vertrag, ohne dass ihn jemand angefasst hat.
     */
    const u = await getUsageAgainstLimits(
      orgPool("agency", "PRO", [ZEILE("agency", "PRO", "listings", 25)],
        { custom_limit_listings: 99 }), "org-1");
    assert.equal(Number(u.listings.limit), 99);
  });
});

/* ── Die Migration ────────────────────────────────────────────────────── */

describe("M1.8 · die Tabelle laesst keine unbegruendete Abweichung zu", () => {
  const sqlRoh = () => fs.readFileSync(
    path.join(API, "..", "sql", "migrations", "214_plan_grenze_je_orgtyp.sql"), "utf8");
  /* Kommentare raus, sonst erfuellt die Begruendung die Probe — die Falle,
   * die in dieser Sitzung viermal zugeschlagen hat. `COMMENT ON` bleibt
   * stehen und wird deshalb ueber die Spaltenliste umgangen. */
  const sql = () => sqlRoh().replace(/--.*$/gm, "");

  it("Schluessel ist (org_type, plan, metrik) — kein Protokoll", () => {
    assert.match(sql(), /PRIMARY KEY \(org_type, plan, metrik\)/);
  });

  it("ein Grund ist Pflicht und darf nicht leer sein", () => {
    /* Eine Abweichung ohne Begruendung ist in einem halben Jahr eine Zahl,
     * die niemand mehr erklaeren kann — und die deshalb niemand zurueckzunehmen
     * wagt. */
    assert.match(sql(), /grund\s+TEXT NOT NULL/);
    assert.match(sql(), /length\(btrim\(grund\)\) >= 10/);
  });

  it("nur die zwei Org-Typen, die es gibt", () => {
    assert.match(sql(), /org_type IN \('company', 'agency'\)/);
    assert.deepEqual([...ORG_TYPEN].sort(), ["agency", "company"]);
  });

  it("-1 ist erlaubt, alles darunter nicht", () => {
    assert.match(sql(), /wert >= -1/);
  });

  it("KEINE Zeilen werden mitgeliefert — leer ist die Vorgabe", () => {
    assert.ok(!/INSERT INTO plan_grenze_je_orgtyp/.test(sql()),
      "befuellt waere sie eine zweite Wahrheit, genau die aus M1.7");
    assert.match(sqlRoh(), /-- ROLLBACK/);
  });
});

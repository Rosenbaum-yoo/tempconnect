/**
 * "Deine Kraefte, die niemand findet" (N7.3, 2026-09-05).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ein Mensch erscheint im Marktplatz nur, wenn SECHS Bedingungen zugleich
 * erfuellt sind. Sie standen bisher ausschliesslich in der WHERE-Klausel der
 * Materialisierung — es gab damit keine Moeglichkeit zu sagen, WARUM jemand
 * fehlt. Gemessen am 2026-08-26: 30 von 33 Kraeften unsichtbar. Die Firma sah
 * eine leere Liste und keinen Grund.
 *
 * DIE ENTSCHEIDENDE BAUART: die Diagnose formuliert ihre Bedingungen NICHT
 * selbst. Beides — WHERE-Klausel und Diagnose — faellt aus
 * `PRAESENZ_BEDINGUNGEN`. Eine zweite, handgeschriebene Fassung waere hier
 * besonders gefaehrlich: eine Abweichung fiele niemandem auf, weil beide Seiten
 * fuer sich plausibel aussehen — die Diagnose saehe richtig aus und sagte "alles
 * in Ordnung", waehrend der Mensch unsichtbar bliebe.
 *
 * Genau dieser Fehler stand heute schon einmal da: die beiden Katalog-Tore aus
 * M4b.1 prueften verschiedene Spalten, und der Test bewachte nur eins davon.
 *
 * Abnahme aus dem Plan (N7.3): **die Firma sieht die Luecke, bevor der Kunde
 * sie nicht findet.**
 *
 * Run: node --test --test-force-exit test/unsichtbareKraefte.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRAESENZ_BEDINGUNGEN, unsichtbareKraefte, sweepMarktpraesenz
} from "../services/marktpraesenzService.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

const ORG = "11111111-1111-4111-8111-111111111111";

function musterPool(zeilen = []) {
  const abfragen = [];
  const antworte = async (sql, params = []) => {
    abfragen.push({ sql: String(sql), params });
    return { rows: zeilen, rowCount: zeilen.length };
  };
  return { abfragen, query: antworte, connect: async () => ({ query: antworte, release() {} }) };
}

/** Eine Zeile, in der genau die genannten Bedingungen FEHLEN. */
function kraft(name, fehlend = []) {
  const z = { worker_profile_id: `p-${name}`, name };
  PRAESENZ_BEDINGUNGEN.forEach((b, i) => { z[`b${i}`] = !fehlend.includes(b.schluessel); });
  return z;
}

/* ── 1. Die eine Wahrheit ────────────────────────────────────────────── */

describe("N7.3 · Materialisierung und Diagnose lesen dieselbe Liste", () => {
  it("das Register nennt alle sechs Bedingungen, jede mit Grund", () => {
    assert.equal(PRAESENZ_BEDINGUNGEN.length, 6,
      "die Zahl der Bedingungen hat sich geaendert — dann gehoert auch die " +
      "Abnahme in M4.9 nachgezogen (zwei Feld, vier Zustand)");
    for (const b of PRAESENZ_BEDINGUNGEN) {
      assert.ok(b.schluessel && b.sql, `${b.schluessel}: unvollstaendig`);
      assert.ok((b.grund || "").length > 10, `${b.schluessel}: kein lesbarer Grund`);
      assert.ok((b.hinweis || "").length > 20,
        `${b.schluessel}: kein Hinweis — ein Grund ohne naechsten Schritt laesst ` +
        "den Leser genauso ratlos wie gar keiner");
      assert.ok(["mensch", "firma", "organisation", "zeitlich"].includes(b.wer),
        `${b.schluessel}: unbekannte Zustaendigkeit '${b.wer}'`);
    }
  });

  it("JEDE Bedingung steht wirklich im erzeugten Materialisierungs-SQL", async () => {
    /*
     * Die zentrale Probe. Waere die WHERE-Klausel weiterhin von Hand
     * geschrieben, koennte eine Bedingung im Register stehen und in der Abfrage
     * fehlen — die Diagnose meldete dann einen Grund, der gar nicht blockiert,
     * oder schwiege ueber einen, der es tut.
     */
    const pool = musterPool([]);
    await sweepMarktpraesenz(pool).catch(() => {});
    const ins = pool.abfragen.map((a) => a.sql)
      .find((q) => /INSERT INTO capacity_posts/i.test(q));
    assert.ok(ins, "die Materialisierung wurde nicht gefahren");

    for (const b of PRAESENZ_BEDINGUNGEN) {
      const kern = b.sql.split("\n")[0].trim();
      assert.ok(ins.includes(kern),
        `Bedingung '${b.schluessel}' steht im Register, aber NICHT in der Abfrage:\n  ${kern}`);
    }
  });

  it("die Diagnose fragt genau diese Bedingungen ab", async () => {
    const pool = musterPool([]);
    await unsichtbareKraefte(pool, ORG);
    const { sql, params } = pool.abfragen[0];
    for (const b of PRAESENZ_BEDINGUNGEN) {
      assert.ok(sql.includes(b.sql.split("\n")[0].trim()),
        `die Diagnose prueft '${b.schluessel}' nicht — sie meldete den Menschen als ` +
        "in Ordnung, waehrend er unsichtbar ist");
    }
    /*
     * ZWEI PROBEN, UND DIE ERSTE HAT GEFEHLT.
     *
     * Eine Rueckmutation ersetzte `WHERE wp.supplier_org_id = $1` durch
     * `WHERE TRUE` — und blieb gruen: die Kennung wurde weiterhin UEBERGEBEN,
     * nur filterte sie nichts mehr. Eine Bindungs-Probe ohne Form-Probe
     * beantwortet die Frage "kommt der Wert an?" und nicht die Frage "wirkt
     * er?". Bei einer Mandantengrenze ist das der ganze Unterschied: die
     * Diagnose haette jede Kraft JEDER Organisation aufgelistet.
     */
    assert.match(sql, /WHERE wp\.supplier_org_id = \$1/,
      "die Org-Bedingung steht nicht mehr in der Abfrage — die Diagnose listet " +
      "dann die Kraefte FREMDER Organisationen mit auf");
    assert.equal(params[0], ORG, "gefiltert wird gegen eine andere Org als die der Anfrage");
  });
});

/* ── 2. Was sie zeigt ────────────────────────────────────────────────── */

describe("N7.3 · was die Firma zu sehen bekommt", () => {
  it("wer alle Bedingungen erfuellt, bekommt KEINE Zeile", async () => {
    /* Die Liste zeigt, wer FEHLT. Wer im Markt steht, braucht keine Zeile —
       sonst ist sie bei 300 Kraeften unlesbar und wird nicht mehr geoeffnet. */
    const r = await unsichtbareKraefte(musterPool([kraft("Vollstaendig", [])]), ORG);
    assert.deepEqual(r, []);
  });

  it("je fehlender Bedingung ein Grund, mit Zustaendigkeit", async () => {
    const [zeile] = await unsichtbareKraefte(
      musterPool([kraft("Mara", ["kein_wohnort", "keine_freigegebene_faehigkeit"])]), ORG);
    assert.equal(zeile.name, "Mara");
    assert.deepEqual(zeile.gruende.map((g) => g.schluessel),
      ["kein_wohnort", "keine_freigegebene_faehigkeit"]);
    for (const g of zeile.gruende) {
      assert.equal(g.wer, "mensch");
      assert.ok(g.grund && g.hinweis);
    }
  });

  it("was jemand BEHEBEN kann, steht oben", async () => {
    /*
     * Sonst liest die Firma zuerst drei Krankmeldungen — die sich von selbst
     * loesen — und hoert auf zu scrollen, bevor sie den fehlenden Wohnort
     * sieht. Die Reihenfolge ist der Unterschied zwischen einer Liste, die
     * benutzt wird, und einer, die man einmal ansieht.
     */
    const r = await unsichtbareKraefte(musterPool([
      kraft("Krank", ["heute_abwesend"]),
      kraft("Abgeschaltet", ["marktpraesenz_aus"]),
      kraft("OhneOrt", ["kein_wohnort"])
    ]), ORG);
    assert.deepEqual(r.map((z) => z.name), ["OhneOrt", "Abgeschaltet", "Krank"]);
  });

  it("ohne Org gibt es nichts — und es wird nicht gefragt", async () => {
    const pool = musterPool([kraft("X", ["kein_wohnort"])]);
    assert.deepEqual(await unsichtbareKraefte(pool, null), []);
    assert.equal(pool.abfragen.length, 0,
      "es wurde ohne Org-Kennung abgefragt — die Bindung an die eigene Org ist " +
      "dann die einzige Zusicherung, und sie steht in einem Parameter, der fehlt");
  });

  it("die Menge ist gedeckelt", async () => {
    const pool = musterPool([]);
    await unsichtbareKraefte(pool, ORG, { limit: 99999 });
    assert.equal(pool.abfragen[0].params[1], 500);
  });
});

/* ── 3. Der Weg nach draussen ────────────────────────────────────────── */

describe("N7.3 · der Endpunkt und seine Reihenfolge", () => {
  const ROUTE = fs.readFileSync(path.join(API, "routes", "workers.js"), "utf8");

  it("die Route ist rechte-geprueft und org-gebunden", () => {
    const m = /router\.get\("\/workers\/marktpraesenz\/unsichtbar"[^\n]*/.exec(ROUTE);
    assert.ok(m, "die Route fehlt — die Diagnose bleibt unsichtbar");
    assert.match(m[0], /rperm\("worker\.view"\)/, "ohne Rechtepruefung");
    assert.match(m[0], /requireScope\("read:workers"\)/, "ohne Scope-Pruefung");
    assert.match(ROUTE, /unsichtbareKraefte\(pool, req\.orgId/,
      "die Diagnose wird nicht an die Org der Anfrage gebunden");
  });

  it("sie steht VOR `/workers/:userId` — sonst verschluckt der Platzhalter sie", () => {
    /*
     * Genau die Falle aus M2.5: `/invoices/:id` stand vor
     * `/invoices/operational` und fing sie ab; `WHERE i.id = 'operational'` warf
     * gegen die echte Datenbank. Ein literaler Pfad hinter einem Platzhalter ist
     * nicht "meistens ok", sondern unerreichbar.
     */
    const literal = ROUTE.indexOf('router.get("/workers/marktpraesenz/unsichtbar"');
    const platzhalter = ROUTE.indexOf('router.get("/workers/:userId"');
    assert.ok(literal !== -1 && platzhalter !== -1, "eine der beiden Routen fehlt");
    assert.ok(literal < platzhalter,
      "der literale Pfad steht HINTER dem Platzhalter — Express nimmt den ersten " +
      "Treffer, die Diagnose waere unerreichbar");
  });
});

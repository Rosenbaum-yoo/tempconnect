/**
 * M4 — die 5 A-Faelle aus `utils/orgBoundary.js`.
 *
 * ALLE FUENF SITZEN AN DERSELBEN STELLE: IN DER FRAGE, NICHT IN DER ANTWORT
 * Der Standard-Mock der bestehenden Datei beantwortet jede Abfrage gleich:
 * `{ query: async () => ({ rows }) }` — ohne Blick auf SQL oder Parameter. Damit
 * ist belegt, dass die Funktion bei gegebenem Ergebnis richtig REAGIERT. Nicht
 * belegt ist, dass sie ueberhaupt die richtige Frage STELLT. (Zwei Testfaelle
 * dort schauen sehr wohl ins SQL — fuer die eigene Spaltenwahl `orgColumn` /
 * `userColumn`; deshalb ueberlebt der SQL-Mutant von Zeile 52 auch nicht.)
 *
 * Die fuenf Faelle: zweimal der SQL-Text, in dem `AND org_id = $2` steht — die
 * Mandantengrenze der Standort- und Abteilungspruefung —, und dreimal die
 * Parameterliste.
 *
 * WAS DIE MUTANTEN GEGEN EINE ECHTE DATENBANK TUN
 * Sie stuerzen ab, sie oeffnen nicht: ein geleertes Parameter-Array laesst `$1`
 * im Text stehen (Postgres 42P02), ein geleerter SQL-Text liefert null Zeilen und
 * damit ein OrgBoundaryError fuer JEDEN. Der Mutant ist also der Extremfall.
 * Der Wert dieser Tests liegt im realistischen Fall daneben: eine VERTAUSCHTE
 * Parameterreihenfolge oder eine fehlende `org_id`-Klausel stuerzt nicht ab —
 * sie vergleicht lautlos das Falsche.
 *
 * Diese Datei prueft deshalb ausschliesslich, WELCHE Abfrage mit WELCHEN
 * Parametern lief. Sie ist die Gegenprobe zur bestehenden Datei, nicht ihre
 * Wiederholung.
 *
 * Fallnummern (nr) verweisen auf
 * `docs/qualitaet/mutation/2026-08-14-rbac/triage.json`.
 * Diese Datei muss in `stryker.rbac.conf.json` unter `commandRunner` stehen.
 *
 * Run: node --test --test-force-exit test/orgBoundaryMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertOrgOwnership,
  assertLocationBelongsToOrg,
  assertDepartmentBelongsToOrg,
} from "../utils/orgBoundary.js";

const ORG = "org-1";
const RES = "res-1";
const LOC = "loc-1";
const DEPT = "dept-1";

/** Mock-Pool, der jede Abfrage samt Parametern mitschreibt. */
function spionPool(rows = []) {
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql, params });
      return { rows };
    },
  };
}

describe("M4 — die Besitzpruefung fragt nach der richtigen Zeile", () => {
  it("nr 95: assertOrgOwnership bindet die Abfrage an die Resource-ID", async () => {
    const p = spionPool([{ org_id: ORG }]);
    await assertOrgOwnership(p, "requisitions", RES, ORG);

    assert.equal(p.abfragen.length, 1);
    // Hier gibt es KEINE org_id-Klausel im SQL: die Abfrage holt die Zeile, der
    // Vergleich mit der eigenen Org passiert danach in JS (orgBoundary.js:61).
    // Die Bindung an die Resource-ID ist damit die einzige Frage, die die
    // Datenbank ueberhaupt gestellt bekommt.
    assert.deepEqual(
      p.abfragen[0].params,
      [RES],
      "Eine falsche oder vertauschte Resource-ID holt lautlos die falsche Zeile — " +
        "und der JS-Vergleich danach prueft dann die Org einer fremden Resource"
    );
  });
});

describe("M4 — die Standortgrenze steht im SQL und in den Parametern", () => {
  it("nr 104: die Abfrage traegt die org_id-Klausel", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertLocationBelongsToOrg(p, LOC, ORG);

    const sql = p.abfragen[0].sql;
    // Tolerant gegen Schreibweise (Leerzeichen, Platzhalter-Nummer): geprueft
    // wird, DASS die Klausel da ist — nicht, wie sie formatiert ist.
    assert.match(sql, /FROM org_locations/i);
    assert.match(sql, /org_id\s*=\s*\$\d/, "Ohne diese Klausel wuerde jeder Standort zu jeder Organisation passen");
    assert.match(sql, /is_active\s*=\s*TRUE/i, "Ein stillgelegter Standort darf nicht mehr zaehlen");
  });

  it("nr 105: die Abfrage traegt Standort UND Organisation als Parameter", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertLocationBelongsToOrg(p, LOC, ORG);

    assert.deepEqual(p.abfragen[0].params, [LOC, ORG], "Reihenfolge zaehlt: $1 Standort, $2 Organisation");
  });

  it("die Gegenprobe: ein fremder Standort wird abgewiesen", async () => {
    const p = spionPool([]);
    // Auf den CODE pruefen, nicht auf den Meldungstext: der Text ist in
    // triage.json (nr 106) ausdruecklich als nicht tragend eingestuft.
    await assert.rejects(
      () => assertLocationBelongsToOrg(p, LOC, ORG),
      (err) => err.code === "ORG_BOUNDARY_VIOLATION" && err.status === 403
    );
  });
});

describe("M4 — dasselbe fuer die Abteilungsgrenze", () => {
  it("nr 108: die Abfrage traegt die org_id-Klausel", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertDepartmentBelongsToOrg(p, DEPT, ORG);

    const sql = p.abfragen[0].sql;
    assert.match(sql, /FROM org_departments/i);
    assert.match(sql, /org_id\s*=\s*\$\d/);
    assert.match(sql, /is_active\s*=\s*TRUE/i);
  });

  it("nr 107: die Abfrage traegt Abteilung UND Organisation als Parameter", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertDepartmentBelongsToOrg(p, DEPT, ORG);

    assert.deepEqual(p.abfragen[0].params, [DEPT, ORG]);
  });

  it("die Gegenprobe: eine fremde Abteilung wird abgewiesen", async () => {
    const p = spionPool([]);
    await assert.rejects(
      () => assertDepartmentBelongsToOrg(p, DEPT, ORG),
      (err) => err.code === "ORG_BOUNDARY_VIOLATION" && err.status === 403
    );
  });
});

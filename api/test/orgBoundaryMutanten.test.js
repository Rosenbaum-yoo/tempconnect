/**
 * M4 — die 5 A-Faelle aus `utils/orgBoundary.js`.
 *
 * ALLE FUENF SIND DIESELBE LUECKE
 * Die bestehenden Tests benutzen einen Mock-Pool, der jede Abfrage gleich
 * beantwortet: `{ query: async () => ({ rows }) }` — ohne Blick auf SQL oder
 * Parameter. Damit ist belegt, dass die Funktion bei gegebenem Ergebnis richtig
 * REAGIERT. Nicht belegt ist, dass sie ueberhaupt die richtige Frage STELLT.
 *
 * Genau dort sitzen die fuenf Faelle: zweimal der SQL-Text, in dem die Klausel
 * `AND org_id = $2` steht — die Mandantengrenze selbst —, und dreimal die
 * Parameterliste, ohne die die Klausel nichts zu vergleichen hat. Wird eines
 * davon geleert, prueft die Grenze nichts mehr, und kein bestehender Test
 * bemerkt es.
 *
 * Deshalb prueft diese Datei ausschliesslich, WELCHE Abfrage mit WELCHEN
 * Parametern lief. Sie ist damit die Gegenprobe zur bestehenden Datei, nicht
 * ihre Wiederholung.
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
    assert.deepEqual(
      p.abfragen[0].params,
      [RES],
      "Ohne Parameter prueft die Grenze eine beliebige Zeile — und der Mock antwortet trotzdem brav"
    );
  });
});

describe("M4 — die Standortgrenze steht im SQL und in den Parametern", () => {
  it("nr 104: die Abfrage traegt die org_id-Klausel", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertLocationBelongsToOrg(p, LOC, ORG);

    const sql = p.abfragen[0].sql;
    assert.match(sql, /FROM org_locations/i);
    assert.match(sql, /org_id = \$2/, "Ohne diese Klausel gehoert jeder Standort zu jeder Organisation");
    assert.match(sql, /is_active = TRUE/i, "Ein stillgelegter Standort darf nicht mehr zaehlen");
  });

  it("nr 105: die Abfrage traegt Standort UND Organisation als Parameter", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertLocationBelongsToOrg(p, LOC, ORG);

    assert.deepEqual(p.abfragen[0].params, [LOC, ORG], "Reihenfolge zaehlt: $1 Standort, $2 Organisation");
  });

  it("die Gegenprobe: ein fremder Standort wird abgewiesen", async () => {
    const p = spionPool([]);
    await assert.rejects(() => assertLocationBelongsToOrg(p, LOC, ORG), /Standort gehoert nicht/);
  });
});

describe("M4 — dasselbe fuer die Abteilungsgrenze", () => {
  it("nr 108: die Abfrage traegt die org_id-Klausel", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertDepartmentBelongsToOrg(p, DEPT, ORG);

    const sql = p.abfragen[0].sql;
    assert.match(sql, /FROM org_departments/i);
    assert.match(sql, /org_id = \$2/);
    assert.match(sql, /is_active = TRUE/i);
  });

  it("nr 107: die Abfrage traegt Abteilung UND Organisation als Parameter", async () => {
    const p = spionPool([{ "?column?": 1 }]);
    await assertDepartmentBelongsToOrg(p, DEPT, ORG);

    assert.deepEqual(p.abfragen[0].params, [DEPT, ORG]);
  });

  it("die Gegenprobe: eine fremde Abteilung wird abgewiesen", async () => {
    const p = spionPool([]);
    await assert.rejects(() => assertDepartmentBelongsToOrg(p, DEPT, ORG), /Abteilung gehoert nicht/);
  });
});

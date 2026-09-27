/**
 * ═══════════════════════════════════════════════════════════════════════════
 * reputationSql — die EINE Antwort auf "Organisation → Reputation"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Das Modul ist entstanden, weil NEUN Abfragen in `vendorPoolService.js`
 * `supplier_reputation.supplier_id` (ein NUTZER, per Fremdschluessel) gegen
 * `vendor_pool.supplier_org_id` (eine ORGANISATION, per Fremdschluessel)
 * verbunden haben. Ein LEFT JOIN, der nie trifft: kein Fehler, nur lauter NULL.
 * Die ganze Lieferantenverwaltung zeigte keine Reputation.
 *
 * Diese Datei prueft den Baustein selbst — DB-frei, also ueberall gruen oder rot.
 * Dass er an echten Daten TRIFFT (und die alte Form nicht), steht in
 * test/integration/lieferantAkteUndVerlauf.flow.test.js.
 *
 * Run: node --test --test-force-exit test/reputationSql.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reputationJoinSql, EIGENTUEMER_ROLLE } from "../services/reputationSql.js";

describe("reputationSql — der Weg von der Organisation zur Reputation", () => {
  it("verbindet ueber den Eigentuemer, nicht direkt", () => {
    const sql = reputationJoinSql("vp.supplier_org_id");
    /* Die drei Bestandteile sind der ganze Inhalt: Bruecke, Rolle, Bindung. */
    assert.match(sql, /LEFT JOIN org_memberships srom/);
    assert.match(sql, /srom\.org_id = vp\.supplier_org_id/);
    assert.match(sql, /srom\.role_key = 'owner'/);
    assert.match(sql, /LEFT JOIN supplier_reputation sr/);
    assert.match(sql, /sr\.supplier_id = srom\.user_id/);
  });

  it("verbindet NICHT die Org-Kennung mit supplier_id — das war der Fehler", () => {
    const sql = reputationJoinSql("vp.supplier_org_id");
    assert.equal(/sr\.supplier_id = vp\.supplier_org_id/.test(sql), false,
      "der Baustein erzeugt genau die Verbindung, die er ersetzen soll");
  });

  it("die Rolle steht an EINER Stelle", () => {
    /* Wird im Rechtemodell die Rolle umbenannt, faellt es hier auf und nicht in
       neun Abfragen. */
    assert.equal(EIGENTUEMER_ROLLE, "owner");
    assert.ok(reputationJoinSql("x.org_id").includes("'" + EIGENTUEMER_ROLLE + "'"));
  });

  it("nimmt einen einfachen Spaltennamen ohne Alias", () => {
    assert.match(reputationJoinSql("org_id"), /srom\.org_id = org_id/);
  });

  it("die Aliasse sind waehlbar, damit eine Abfrage sie nicht doppelt belegt", () => {
    const sql = reputationJoinSql("vp.supplier_org_id", { alias: "rep", brueckenAlias: "mit" });
    assert.match(sql, /LEFT JOIN org_memberships mit/);
    assert.match(sql, /LEFT JOIN supplier_reputation rep/);
    assert.match(sql, /rep\.supplier_id = mit\.user_id/);
  });

  it("weist zurueck, was in SQL nichts zu suchen hat", () => {
    /* Der Rueckgabewert geht UNVERAENDERT in eine Abfrage. Ohne diese Schranke
       waere der Baustein ein Einfallstor — dieselbe Vorsicht wie in
       `bindungSql` und `koepfeFormel`. */
    for (const boese of ["vp.org_id; DROP TABLE users", "vp.org_id --", "(SELECT 1)",
                          "vp.org_id OR 1=1", "a.b.c", "", " "]) {
      assert.throws(() => reputationJoinSql(boese), /REPUTATION_SPALTE_UNGUELTIG/,
        "durchgelassen: " + JSON.stringify(boese));
    }
    for (const boeseAlias of ["sr; DROP", "sr-1", "", "sr.x"]) {
      assert.throws(() => reputationJoinSql("vp.org_id", { alias: boeseAlias }),
        /REPUTATION_ALIAS_UNGUELTIG/, "Alias durchgelassen: " + JSON.stringify(boeseAlias));
    }
  });

  it("weist eine Alias-Kollision zurueck — sonst waere die Abfrage unlesbar kaputt", () => {
    assert.throws(() => reputationJoinSql("vp.org_id", { alias: "x", brueckenAlias: "x" }),
      /REPUTATION_ALIAS_KOLLISION/);
  });

  it("der Baustein nennt supplier_metrics NICHT", () => {
    /* `supplier_metrics.agency_id` zeigt selbst auf `organizations` und wird
       direkt verbunden. Wer diese Joins "mitkorrigiert", bricht sie — deshalb
       steht sie hier gar nicht drin. */
    assert.equal(reputationJoinSql("vp.supplier_org_id").includes("supplier_metrics"), false);
  });
});

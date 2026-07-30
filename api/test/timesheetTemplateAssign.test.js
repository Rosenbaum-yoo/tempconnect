/**
 * Vorlagen-Zuweisung: eine Agentur darf ihre Vorlage nicht einer beliebigen fremden
 * Organisation anhaengen.
 *
 * DER BEFUND
 * `assignTemplate` pruefte, ob die VORLAGE der Agentur gehoert — die Kunden-`org_id`
 * aber gar nicht. Damit konnte eine Agentur ihre Vorlage jeder Organisation im System
 * zuordnen, auch einer, zu der sie keinerlei Beziehung hat. Kein Datenabfluss, aber der
 * Zettel taucht in der Ansicht eines Fremden auf: ungefragte Einmischung in eine fremde
 * Mandantenwelt, mit frei waehlbarem Vorlagentext.
 *
 * Notiert war das als kleine Randbeobachtung. Mit dem Wechsel des Repositories auf
 * "oeffentlich" wurde daraus ein oeffentlicher Wegweiser auf eine offene Schwachstelle —
 * deshalb geschlossen statt dokumentiert.
 *
 * ZWEI WEGE, ZWEI ABSICHERUNGEN
 *   (a) ueber einen Einsatz -> die Org wird ABGELEITET, nicht geglaubt
 *   (b) direkt auf eine Org  -> es muss eine nachweisbare Geschaeftsbeziehung geben
 *
 * Run: node --test --test-force-exit test/timesheetTemplateAssign.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/timesheetTemplateService.js";

const AGENTUR = "org-agentur";
const KUNDE = "org-kunde";
const FREMD = "org-fremd";

/**
 * Pool-Attrappe, die nach SQL-Fragment antwortet. `beziehung` steuert, ob die
 * Beziehungsabfrage etwas findet; `assignment` ist die Zeile aus `assignments`.
 */
function poolStub({ template = { id: "tpl-1" }, assignment = null, beziehung = false } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/FROM timesheet_templates/i.test(s)) return { rows: template ? [template] : [] };
      if (/FROM assignments WHERE id/i.test(s)) return { rows: assignment ? [assignment] : [] };
      if (/FROM vendor_pool/i.test(s)) return { rows: beziehung ? [{ ok: 1 }] : [] };
      if (/INSERT INTO timesheet_template_assignments/i.test(s)) {
        return { rows: [{ id: "tta-1", template_id: params[0], assignment_id: params[1], org_id: params[2] }] };
      }
      return { rows: [] };
    },
    insert() { return calls.find((c) => /INSERT INTO timesheet_template_assignments/i.test(c.sql)); }
  };
}

const BASIS = { templateId: "tpl-1", supplierOrgId: AGENTUR, createdBy: "user-1" };

describe("assignTemplate — Zuweisung auf eine Org direkt", () => {
  it("weist ab, wenn keine Geschaeftsbeziehung nachweisbar ist", async () => {
    const pool = poolStub({ beziehung: false });
    const out = await svc.assignTemplate(pool, { ...BASIS, orgId: FREMD });
    assert.equal(out.error, "NO_BUSINESS_RELATIONSHIP");
    assert.equal(pool.insert(), undefined, "Es darf nichts geschrieben werden");
  });

  it("laesst zu, wenn eine Beziehung besteht", async () => {
    const pool = poolStub({ beziehung: true });
    const out = await svc.assignTemplate(pool, { ...BASIS, orgId: KUNDE });
    assert.ok(out.ok, `Erwartet: erlaubt, bekam ${JSON.stringify(out)}`);
    assert.equal(pool.insert().params[2], KUNDE);
  });

  it("prueft die Beziehung zwischen genau diesen beiden Orgs", async () => {
    const pool = poolStub({ beziehung: true });
    await svc.assignTemplate(pool, { ...BASIS, orgId: KUNDE });
    const check = pool.calls.find((c) => /FROM vendor_pool/i.test(c.sql));
    assert.deepEqual(check.params, [KUNDE, AGENTUR],
      "Kunde und Agentur muessen als Paar geprueft werden");
  });

  it("akzeptiert auch gemeinsame Historie, nicht nur die Lieferantenliste", async () => {
    // Die Abfrage vereint vendor_pool, assignments und timesheets — eine Agentur, die
    // real fuer den Kunden gearbeitet hat, soll nicht an einer fehlenden Pool-Zeile
    // scheitern.
    const pool = poolStub({ beziehung: true });
    await svc.assignTemplate(pool, { ...BASIS, orgId: KUNDE });
    const check = pool.calls.find((c) => /FROM vendor_pool/i.test(c.sql));
    assert.match(check.sql, /FROM assignments/i);
    assert.match(check.sql, /FROM timesheets/i);
  });
});

describe("assignTemplate — Zuweisung ueber einen Einsatz", () => {
  it("leitet die Org aus dem Einsatz ab und glaubt dem Aufrufer nicht", async () => {
    // Der Aufrufer behauptet FREMD, der Einsatz gehoert aber zu KUNDE. Geschrieben wird
    // KUNDE — sonst koennte man die Ableitung durch eine Falschangabe aushebeln.
    const pool = poolStub({ assignment: { id: "a-1", org_id: KUNDE, supplier_org_id: AGENTUR } });
    const out = await svc.assignTemplate(pool, { ...BASIS, assignmentId: "a-1", orgId: FREMD });
    assert.ok(out.ok, `Erwartet: erlaubt, bekam ${JSON.stringify(out)}`);
    assert.equal(pool.insert().params[2], KUNDE, "Die Org kommt aus dem Einsatz, nicht aus der Anfrage");
  });

  it("weist einen fremden Einsatz ab", async () => {
    const pool = poolStub({ assignment: { id: "a-1", org_id: KUNDE, supplier_org_id: "org-andere" } });
    const out = await svc.assignTemplate(pool, { ...BASIS, assignmentId: "a-1" });
    assert.equal(out.error, "ASSIGNMENT_NOT_OWNED");
    assert.equal(pool.insert(), undefined);
  });

  it("weist einen nicht existierenden Einsatz ab", async () => {
    const pool = poolStub({ assignment: null });
    const out = await svc.assignTemplate(pool, { ...BASIS, assignmentId: "gibt-es-nicht" });
    assert.equal(out.error, "ASSIGNMENT_NOT_FOUND");
  });

  it("prueft die Beziehung NICHT, wenn der Einsatz sie schon belegt", async () => {
    // Ein eigener Einsatz IST der Beweis. Zusaetzlich die Lieferantenliste zu verlangen
    // wuerde legitime Faelle blockieren.
    const pool = poolStub({ assignment: { id: "a-1", org_id: KUNDE, supplier_org_id: AGENTUR } });
    await svc.assignTemplate(pool, { ...BASIS, assignmentId: "a-1" });
    assert.equal(pool.calls.find((c) => /FROM vendor_pool/i.test(c.sql)), undefined);
  });
});

describe("assignTemplate — unveraenderte Zusagen", () => {
  it("eine fremde Vorlage bleibt unerreichbar", async () => {
    const pool = poolStub({ template: null });
    assert.equal((await svc.assignTemplate(pool, { ...BASIS, orgId: KUNDE })).error, "TEMPLATE_NOT_FOUND");
  });

  it("ohne Einsatz und ohne Org passiert nichts", async () => {
    const pool = poolStub();
    assert.equal((await svc.assignTemplate(pool, { ...BASIS })).error, "ASSIGNMENT_OR_ORG_REQUIRED");
  });
});

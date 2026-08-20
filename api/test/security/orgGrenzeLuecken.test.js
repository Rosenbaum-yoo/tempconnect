/**
 * Die fuenf Stellen ohne Org-Pruefung — als Verhalten nachgestellt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESE DATEI GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Recherche vom 2026-08-19 (docs/features/H_KUNDENANSICHT_UND_ORG_GRENZEN.md,
 * Abschnitt H2) fand fuenf Routen, an denen die Mandantengrenze GAR NICHT stand
 * — drei davon mit schreibendem Cross-Org-Zugriff. Belegt war das am Quelltext,
 * nicht zur Laufzeit; der Plan nennt das selbst als ersten Fallstrick: "sonst
 * gilt derselbe Vorwurf wie gegen einen Quelltext-Waechter".
 *
 * Diese Datei stellt jeden der fuenf Befunde mit einem Spion-Pool nach. Sie war
 * bei ihrer Entstehung ROT — jeder einzelne Fall lieferte 200 statt 403, und
 * drei von ihnen schrieben dabei in fremde Zeilen. Sie ist die Quittung dafuer,
 * dass die Reparatur einen echten Defekt beseitigt hat und nicht eine
 * theoretische Sorge.
 *
 * Geprueft wird jeweils MEHR als der Statuscode:
 *   1. Status 403 (das Ergebnis — allein wertlos)
 *   2. auf dem Spion steht KEIN INSERT/UPDATE/DELETE
 *      → eine Route, die erst schreibt und danach 403 meldet, faellt hier durch
 *   3. die Ressourcen-ID steht in den Parametern des Lesevorgangs
 *      → beweist, dass ueber DIE Zeile geurteilt wurde, die danach angefasst wird
 *   4. wo die Grenze im Service-SQL liegt: req.orgId steht in den Parametern
 *
 * Dazu je eine GEGENPROBE mit der eigenen Org: ohne sie bestuende ein pauschales
 * `return 403` jede dieser Pruefungen.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mockReq, mockRes, noop, baseDeps, findHandlerExact,
  ORG_A, ORG_B, USER_A, USER_B
} from "../helpers/security-mocks.js";
import { spionPool } from "../helpers/orgGrenzenSpion.js";

import { createRateCardsRouter }     from "../../routes/rateCards.js";
import { createInvoicesRouter }      from "../../routes/invoices.js";
import { createApprovalsRouter }     from "../../routes/approvals.js";
import { createRequisitionsRouter }  from "../../routes/requisitions.js";
import { createOrganizationsRouter } from "../../routes/organizations.js";
import { createWorkersRouter }      from "../../routes/workers.js";
import { createSlaSearchJobsRouter } from "../../routes/slaSearchJobs.js";
import { createDataGovernanceRouter } from "../../routes/dataGovernance.js";
import * as dgSvc from "../../services/dataGovernanceService.js";
import * as supplierPoolSvc from "../../services/supplierPoolService.js";
import * as engine from "../../services/matchingEngine.js";
import { createMatchingRouter } from "../../routes/matching.js";

/** Keine Zeile darf geschrieben worden sein. */
function keinSchreibvorgang(pool, was) {
  const schreib = pool.schreibvorgaenge;
  assert.equal(
    schreib.length, 0,
    was + ": es wurde geschrieben, obwohl die Grenze haette greifen muessen — " +
    schreib.map((s) => s.sql.trim().slice(0, 60).replace(/\s+/g, " ")).join(" | ")
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   E-1 · Konditionsrahmen: aktivieren/archivieren schrieb ueber die Grenze
   ═════════════════════════════════════════════════════════════════════════ */

describe("E-1 · POST /rate-cards/:id/activate — fremde Org", () => {
  it("antwortet 403 und schreibt nichts", async () => {
    const fremdeKarte = { id: "rc-fremd", org_id: ORG_B, status: "draft" };
    const pool = spionPool({ zeile: fremdeKarte });
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/rate-cards/:id/activate");

    const req = mockReq({ orgId: ORG_A, params: { id: "rc-fremd" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "fremder Konditionsrahmen darf nicht aktivierbar sein");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    keinSchreibvorgang(pool, "rate-cards activate");
    assert.ok(pool.lasMit("rc-fremd"), "die geprüfte Zeile muss die angefragte sein");
  });

  it("Gegenprobe: eigene Org wird aktiviert", async () => {
    const eigeneKarte = { id: "rc-eigen", org_id: ORG_A, status: "draft" };
    const pool = spionPool({ zeile: eigeneKarte });
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/rate-cards/:id/activate");

    const req = mockReq({ orgId: ORG_A, params: { id: "rc-eigen" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.notEqual(res._status, 403, "die eigene Org darf nicht blockiert werden");
    assert.ok(pool.schreibvorgaenge.length > 0, "der Schreibvorgang muss stattfinden");
    assert.ok(pool.fragteMit(ORG_A), "die Grenze gehoert zusaetzlich ins SQL");
  });
});

describe("E-1 · POST /rate-cards/:id/archive — fremde Org", () => {
  it("antwortet 403 und schreibt nichts", async () => {
    const fremdeKarte = { id: "rc-fremd", org_id: ORG_B, status: "active" };
    const pool = spionPool({ zeile: fremdeKarte });
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/rate-cards/:id/archive");

    const req = mockReq({ orgId: ORG_A, params: { id: "rc-fremd" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    keinSchreibvorgang(pool, "rate-cards archive");
  });

  it("Gegenprobe: eigene Org wird archiviert", async () => {
    const pool = spionPool({ zeile: { id: "rc-eigen", org_id: ORG_A, status: "active" } });
    const router = createRateCardsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/rate-cards/:id/archive");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "rc-eigen" } }), res, noop);

    assert.notEqual(res._status, 403);
    assert.ok(pool.schreibvorgaenge.length > 0);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-2 · Operative Rechnungen: vier Schreibwege ohne Grenze
   ═════════════════════════════════════════════════════════════════════════ */

const RECHNUNG_FREMD = { id: "inv-fremd", status: "draft", org_id: ORG_B, supplier_org_id: ORG_B };

for (const [pfad, zustand] of [["issue", "draft"], ["paid", "issued"], ["void", "draft"]]) {
  describe("E-2 · POST /invoices/operational/:id/" + pfad + " — fremde Org", () => {
    it("antwortet 403 und schreibt nichts", async () => {
      const pool = spionPool({ zeile: { ...RECHNUNG_FREMD, status: zustand } });
      const router = createInvoicesRouter(baseDeps(pool));
      const handler = findHandlerExact(router, "post", "/invoices/operational/:id/" + pfad);

      const req = mockReq({ orgId: ORG_A, params: { id: "inv-fremd" } });
      const res = mockRes();
      await handler(req, res, noop);

      assert.equal(res._status, 403, "fremde Rechnung darf nicht auf " + pfad + " gesetzt werden");
      assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
      keinSchreibvorgang(pool, "invoice " + pfad);
      assert.ok(pool.lasMit("inv-fremd"), "die geprüfte Zeile muss die angefragte sein");
      assert.ok(pool.fragteMit(ORG_A), "req.orgId muss den Service ueberhaupt erreichen");
    });

    it("Gegenprobe: eigene Org geht durch", async () => {
      const pool = spionPool({ zeile: { id: "inv-eigen", status: zustand, org_id: ORG_A, supplier_org_id: ORG_B } });
      const router = createInvoicesRouter(baseDeps(pool));
      const handler = findHandlerExact(router, "post", "/invoices/operational/:id/" + pfad);

      const res = mockRes();
      await handler(mockReq({ orgId: ORG_A, params: { id: "inv-eigen" } }), res, noop);

      assert.notEqual(res._status, 403);
      assert.ok(pool.schreibvorgaenge.length > 0, "der Statuswechsel muss geschrieben werden");
    });
  });
}

describe("E-2 · POST /invoices/operational/:id/correction — fremde Org", () => {
  it("antwortet 403 und schreibt nichts", async () => {
    const pool = spionPool({ zeile: RECHNUNG_FREMD });
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/operational/:id/correction");

    const req = mockReq({
      orgId: ORG_A, params: { id: "inv-fremd" },
      body: { description: "Nachlass", amount_cents: -5000 }
    });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "fremde Rechnung darf keine Korrekturposition bekommen");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    keinSchreibvorgang(pool, "invoice correction");
  });

  it("Gegenprobe: eigene Org bekommt die Position", async () => {
    const pool = spionPool({ zeile: { id: "inv-eigen", status: "draft", org_id: ORG_A, supplier_org_id: null } });
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/operational/:id/correction");

    const res = mockRes();
    await handler(mockReq({
      orgId: ORG_A, params: { id: "inv-eigen" },
      body: { description: "Nachlass", amount_cents: -5000 }
    }), res, noop);

    assert.notEqual(res._status, 403);
    assert.ok(pool.schreibvorgaenge.length > 0);
  });

  it("Lieferantenseite darf ebenfalls — die Grenze ist zweiseitig", async () => {
    const pool = spionPool({ zeile: { id: "inv-liefer", status: "draft", org_id: ORG_B, supplier_org_id: ORG_A } });
    const router = createInvoicesRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/invoices/operational/:id/correction");

    const res = mockRes();
    await handler(mockReq({
      orgId: ORG_A, params: { id: "inv-liefer" },
      body: { description: "Nachlass", amount_cents: -1 }
    }), res, noop);

    assert.notEqual(res._status, 403, "der Lieferant sieht seine eigene Rechnung");
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-3 · Freigaben: entscheiden und Historie lesen ohne Grenze
   ═════════════════════════════════════════════════════════════════════════ */

for (const pfad of ["approve", "reject"]) {
  describe("E-3 · POST /approvals/:id/" + pfad + " — fremde Org", () => {
    it("antwortet 403 und schreibt nichts", async () => {
      const pool = spionPool({ zeile: { id: "ap-fremd", org_id: ORG_B, status: "pending", entity_type: "requisition", entity_id: "r1" } });
      const router = createApprovalsRouter(baseDeps(pool));
      const handler = findHandlerExact(router, "post", "/approvals/:id/" + pfad);

      const req = mockReq({ orgId: ORG_A, params: { id: "ap-fremd" }, body: { reason: "Begruendung mit genug Text" } });
      const res = mockRes();
      await handler(req, res, noop);

      assert.equal(res._status, 403, "fremde Freigabe darf nicht per " + pfad + " entschieden werden");
      assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
      keinSchreibvorgang(pool, "approvals " + pfad);
      assert.ok(pool.lasMit("ap-fremd"));
    });

    it("Gegenprobe: eigene Org entscheidet", async () => {
      const pool = spionPool({ zeile: { id: "ap-eigen", org_id: ORG_A, status: "pending", entity_type: "requisition", entity_id: "r1" } });
      const router = createApprovalsRouter(baseDeps(pool));
      const handler = findHandlerExact(router, "post", "/approvals/:id/" + pfad);

      const res = mockRes();
      await handler(mockReq({
        orgId: ORG_A, params: { id: "ap-eigen" }, body: { reason: "Begruendung mit genug Text" }
      }), res, noop);

      assert.notEqual(res._status, 403);
      assert.ok(pool.schreibvorgaenge.length > 0, "die Entscheidung muss geschrieben werden");
      assert.ok(pool.fragteMit(ORG_A), "die Grenze gehoert zusaetzlich ins SQL");
    });
  });
}

describe("E-3 · GET /approvals/history/:entityType/:entityId — fremde Entitaet", () => {
  it("liest nur mit Org-Bindung — die Historie traegt E-Mail-Adressen", async () => {
    const pool = spionPool({ zeile: { id: "ap-fremd", org_id: ORG_B, requested_by_email: "chef@fremde-firma.de" } });
    const router = createApprovalsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/approvals/history/:entityType/:entityId");

    const req = mockReq({ orgId: ORG_A, params: { entityType: "requisition", entityId: "r-fremd" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.ok(
      pool.lasMit("r-fremd", ORG_A),
      "die Abfrage muss Entitaet UND eigene Org tragen — sonst laeuft sie plattformweit"
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-4 · Requisitions: zwei von drei Tueren zum selben Raum waren bewacht
   ═════════════════════════════════════════════════════════════════════════ */

describe("E-4 · POST /requisitions/:id/submit — fremde Org", () => {
  it("antwortet 403 und schreibt nichts", async () => {
    const pool = spionPool({ zeile: { id: "rq-fremd", org_id: ORG_B, status: "DRAFT" } });
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/requisitions/:id/submit");

    const req = mockReq({ orgId: ORG_A, params: { id: "rq-fremd" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403, "fremde Requisition darf nicht eingereicht werden");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    keinSchreibvorgang(pool, "requisitions submit");
    assert.ok(pool.lasMit("rq-fremd"));
  });

  it("Gegenprobe: eigene Org reicht ein", async () => {
    const pool = spionPool({ zeile: { id: "rq-eigen", org_id: ORG_A, status: "DRAFT" } });
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "post", "/requisitions/:id/submit");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "rq-eigen" } }), res, noop);

    assert.notEqual(res._status, 403);
    assert.ok(pool.schreibvorgaenge.length > 0, "der Statuswechsel muss geschrieben werden");
  });
});

describe("E-4 · PATCH /requisitions/:id — fremde Org", () => {
  it("antwortet 403 statt eines irrefuehrenden 404 und schreibt nichts", async () => {
    const pool = spionPool({ zeile: { id: "rq-fremd", org_id: ORG_B, status: "DRAFT" } });
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "patch", "/requisitions/:id");

    const req = mockReq({ orgId: ORG_A, params: { id: "rq-fremd" }, body: { title: "Uebernommen" } });
    const res = mockRes();
    await handler(req, res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    keinSchreibvorgang(pool, "requisitions patch");
  });

  it("Gegenprobe: eigene Org aendert", async () => {
    const pool = spionPool({ zeile: { id: "rq-eigen", org_id: ORG_A, status: "DRAFT" } });
    const router = createRequisitionsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "patch", "/requisitions/:id");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "rq-eigen" }, body: { title: "Neuer Titel" } }), res, noop);

    assert.notEqual(res._status, 403);
    assert.ok(pool.schreibvorgaenge.length > 0);
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-5 · Die Pruefung bewachte den falschen Knopf
   ═════════════════════════════════════════════════════════════════════════

   Der Nutzer traegt in :id seine EIGENE Org ein — die alte Pruefung
   (`req.params.id !== req.orgId`) war damit immer erfuellt. Der tatsaechliche
   Datenwaehler ist `query.entity_id`, und der lief ungebremst.                */

describe("E-5 · GET /organizations/:id/audit-log/recent-changes — fremde Entitaet", () => {
  it("bindet die Abfrage an die eigene Org, nicht an den frei waehlbaren Pfad", async () => {
    const pool = spionPool({ zeile: { id: "al-1", actor_email: "chef@fremde-firma.de", old_values: { gehalt: 1 }, new_values: { gehalt: 2 } } });
    const router = createOrganizationsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/organizations/:id/audit-log/recent-changes");

    const req = mockReq({
      orgId: ORG_A,
      params: { id: ORG_A },                                    // eigene Org — die alte Pruefung war zufrieden
      query: { entity_type: "timesheet", entity_id: "ts-fremd" } // der echte Waehler
    });
    const res = mockRes();
    await handler(req, res, noop);

    assert.ok(
      pool.lasMit("ts-fremd", ORG_A),
      "die Abfrage muss Entitaet UND eigene Org tragen — sonst gibt sie fremde Werte samt Akteur-E-Mail heraus"
    );
  });

  it("die Nachbarpruefung auf den Pfad bleibt bestehen", async () => {
    const pool = spionPool({ zeile: null });
    const router = createOrganizationsRouter(baseDeps(pool));
    const handler = findHandlerExact(router, "get", "/organizations/:id/audit-log/recent-changes");

    const res = mockRes();
    await handler(mockReq({
      orgId: ORG_A, params: { id: ORG_B },
      query: { entity_type: "timesheet", entity_id: "ts-1" }
    }), res, noop);

    assert.equal(res._status, 403);
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-12 · Ein LESEZUGRIFF schrieb in die fremde Zeile
   ═════════════════════════════════════════════════════════════════════════

   Gefunden vom Org-Grenzen-Waechter, nicht von der Recherche.
   `getAssignmentStaffingOverview` rief `recalcAssignmentStaffing` — ein
   `UPDATE assignments ... WHERE id = $1` OHNE Org-Bindung — und prueste die
   Zugehoerigkeit erst in der Zeile DANACH. Ein GET auf eine fremde
   Einsatz-Kennung hat damit Mengen, Besetzungsstatus und Zeitstempel der
   fremden Zeile angefasst und anschliessend 404 geliefert: kein Datenabfluss,
   aber ein Schreibvorgang ueber die Mandantengrenze, ausgeloest von einem
   blossen Lesezugriff.

   Genau dafuer gibt es die Zusicherung "auf dem Spion steht kein
   INSERT/UPDATE/DELETE" — ein reiner Statuscode-Test haette den 404 gesehen
   und nichts gemerkt.                                                        */

describe("E-12 · GET /staffing-assignments/:id — fremder Einsatz", () => {
  function workersDeps(pool) {
    return {
      ...baseDeps(pool),
      getUserAndPlan: async () => ({ plan: "PRO", id: USER_A }),
      requestLimiter: (_q, _s, next) => next()
    };
  }

  it("schreibt nicht, bevor die Zugehoerigkeit geklaert ist", async () => {
    /* Der Spion beantwortet sonst JEDE Abfrage mit einer Zeile — auch die
       klaerende, deren ganzer Sinn ihr WHERE ist. Genau diese eine Abfrage
       wird deshalb wie eine echte Datenbank beantwortet: fremde Org, kein
       Treffer. Ohne das prueft der Test die Reparatur nicht, sondern den Mock. */
    const pool = spionPool({
      zeile: { id: "asg-fremd", supplier_org_id: ORG_B, status: "active" },
      antwort: (sql, params) =>
        /SELECT 1 FROM assignments/i.test(sql) && !params.includes(ORG_B)
          ? { rows: [] }
          : undefined
    });
    const router = createWorkersRouter(workersDeps(pool));
    const handler = findHandlerExact(router, "get", "/staffing-assignments/:id");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "asg-fremd" } }), res, noop);

    keinSchreibvorgang(pool, "staffing-assignments detail");
    assert.notEqual(res._status, 200, "ein fremder Einsatz darf keine Uebersicht liefern");
    assert.ok(
      pool.fragteMit("asg-fremd", ORG_A),
      "die klaerende Abfrage muss Einsatz UND eigene Org tragen"
    );
  });

  it("Gegenprobe: der eigene Einsatz wird geliefert und darf dabei rechnen", async () => {
    const pool = spionPool({ zeile: { id: "asg-eigen", supplier_org_id: ORG_A, status: "active" } });
    const router = createWorkersRouter(workersDeps(pool));
    const handler = findHandlerExact(router, "get", "/staffing-assignments/:id");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "asg-eigen" } }), res, noop);

    assert.notEqual(res._status, 403);
    assert.notEqual(res._status, 404);
    assert.ok(
      pool.schreibvorgaenge.length > 0,
      "die Neuberechnung MUSS fuer die eigene Org weiterhin stattfinden — " +
      "sonst haette die Reparatur die Funktion stillgelegt statt sie zu begrenzen"
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-13 · Dasselbe Muster, zweite Fundstelle
   ═════════════════════════════════════════════════════════════════════════

   `getStaffingChoiceSet` rief `refreshStaffingChoiceSetLifecycle` — und das
   SCHREIBT (`UPDATE assignment_staffing_choice_sets SET status = ...`). Die
   Zugehoerigkeitspruefung stand erst danach. Ein Zugriff mit fremder
   Auswahl-Kennung hat deren Status fortgeschrieben und anschliessend 404
   geliefert.

   Der Waechter hat das gefunden, nachdem E-12 dieselbe Klasse in einer anderen
   Datei aufgedeckt hatte — ein Muster, das man einmal kennt, findet man wieder.  */

describe("E-13 · POST /staffing-choice-sets/:id/assign — fremde Auswahl", () => {
  function workersDeps(pool) {
    return {
      ...baseDeps(pool),
      getUserAndPlan: async () => ({ plan: "PRO", id: USER_A }),
      requestLimiter: (_q, _s, next) => next()
    };
  }

  it("schreibt nicht, bevor die Zugehoerigkeit geklaert ist", async () => {
    /* Wie bei E-12 wird die eine klaerende Abfrage wie eine echte Datenbank
       beantwortet — fremde Org, kein Treffer. Sonst prueft der Test den Mock. */
    const pool = spionPool({
      zeile: { id: "cs-fremd", supplier_org_id: ORG_B, status: "open", options: [] },
      antwort: (sql, params) =>
        /SELECT 1 FROM assignment_staffing_choice_sets/i.test(sql) && !params.includes(ORG_B)
          ? { rows: [] }
          : undefined
    });
    const router = createWorkersRouter(workersDeps(pool));
    const handler = findHandlerExact(router, "post", "/staffing-choice-sets/:id/assign");

    const res = mockRes();
    await handler(mockReq({
      orgId: ORG_A, params: { id: "cs-fremd" },
      body: { choice_option_id: "11111111-1111-4111-a111-111111111111" }
    }), res, noop);
    for (let i = 0; i < 5; i++) await new Promise((fertig) => setImmediate(fertig));

    keinSchreibvorgang(pool, "staffing-choice-sets assign");
    assert.notEqual(res._status, 200, "eine fremde Auswahl darf nicht zugewiesen werden");
    assert.ok(
      pool.fragteMit("cs-fremd", ORG_A),
      "die klaerende Abfrage muss Auswahl UND eigene Org tragen"
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-15 · Der schwerste Fall: fremde Daten wurden GELOESCHT
   ═════════════════════════════════════════════════════════════════════════

   `deleteSearchJob` raeumte erst auf und prueste dann den Besitzer:

       DELETE FROM sla_search_matches WHERE search_job_id = $1     <- ohne Bindung
       DELETE FROM sla_search_events  WHERE search_job_id = $1     <- ohne Bindung
       DELETE FROM match_alerts       WHERE job_id = $1            <- ohne Bindung
       DELETE FROM sla_search_jobs    WHERE id = $1 AND owner_company_id = $2

   Ein `DELETE /sla/search-jobs/<fremde-id>` hat damit Treffer, Ereignisse und
   Treffermeldungen einer FREMDEN Suche geloescht — und dem Aufrufer danach 404
   gemeldet. Der Bestohlene sah eine leere Suche und keinen Grund dafuer.

   Das ist dieselbe Klasse wie E-12 und E-13 (handeln, dann pruefen), nur in
   ihrer schlimmsten Form: kein Datenabfluss, sondern DATENVERLUST bei einem
   Dritten.                                                                   */

describe("E-15 · DELETE /sla/search-jobs/:id — fremder Suchauftrag", () => {
  it("loescht nichts, bevor der Besitz geklaert ist", async () => {
    /* Die klaerende Abfrage wird wie eine echte Datenbank beantwortet: fremder
       Besitzer, kein Treffer. Sonst prueft der Test den Mock statt der Reparatur. */
    const pool = spionPool({
      zeile: { id: "job-fremd", owner_company_id: USER_B, status: "open" },
      antwort: (sql, params) =>
        /SELECT 1 FROM sla_search_jobs/i.test(sql) && !params.includes(USER_B)
          ? { rows: [] }
          : undefined
    });
    const router = createSlaSearchJobsRouter({
      ...baseDeps(pool),
      requireFeature: () => (_q, _s, next) => next(),
      getUserAndPlan: async () => ({ plan: "PRO", id: USER_A })
    });
    const handler = findHandlerExact(router, "delete", "/sla/search-jobs/:id");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "job-fremd" } }), res, noop);
    for (let i = 0; i < 5; i++) await new Promise((fertig) => setImmediate(fertig));

    keinSchreibvorgang(pool, "sla-search-jobs delete");
    assert.notEqual(res._status, 200, "ein fremder Suchauftrag darf nicht loeschbar sein");
    assert.ok(
      pool.fragteMit("job-fremd", USER_A),
      "die klaerende Abfrage muss Auftrag UND eigene Kennung tragen"
    );
  });

  it("Gegenprobe: der eigene Suchauftrag wird samt Anhang geloescht", async () => {
    const pool = spionPool({ zeile: { id: "job-eigen", owner_company_id: USER_A, status: "open" } });
    const router = createSlaSearchJobsRouter({
      ...baseDeps(pool),
      requireFeature: () => (_q, _s, next) => next(),
      getUserAndPlan: async () => ({ plan: "PRO", id: USER_A })
    });
    const handler = findHandlerExact(router, "delete", "/sla/search-jobs/:id");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { id: "job-eigen" } }), res, noop);
    for (let i = 0; i < 5; i++) await new Promise((fertig) => setImmediate(fertig));

    assert.ok(
      pool.schreibvorgaenge.length >= 4,
      "der eigene Auftrag muss weiterhin samt Treffern, Ereignissen und Meldungen " +
      "verschwinden — die Reparatur begrenzt die Funktion, sie legt sie nicht still"
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-17 · Ein Org-Admin konnte einen FREMDEN Nutzer anonymisieren
   ═════════════════════════════════════════════════════════════════════════

   `data_governance.anonymize` halten laut `services/rbacService.js:121` die
   Rollen `owner` und `admin` — also jede KUNDENorganisation fuer sich selbst,
   nicht die Plattform. `anonymizeUser` hat die Organisation des Ziels aber nie
   geprueft: `canDeleteUser` sieht nur Betriebsblocker (offene Einsaetze,
   Stundenzettel, Rechnungen), alle am ZIEL-Nutzer.

   Damit konnte der Inhaber einer beliebigen Kundenorganisation das Konto eines
   beliebigen fremden Nutzers unwiderruflich anonymisieren: E-Mail, Name,
   Passwort-Hash, Personenbezuege ueberschrieben. Art.-17-Maschinerie auf einen
   Dritten gerichtet — der schwerste Fund dieser Arbeit, weil er nicht Daten
   preisgibt, sondern die eines Dritten ZERSTOERT.

   Die Pruefung nutzt `is_active`, NICHT `status` — genau der Fehler, an dem
   `utils/ownerCheck.js` seit jeher scheitert (Befund E-11). Hier nicht wiederholt. */

describe("E-17 · POST /data-governance/anonymize/user/:userId — fremder Nutzer", () => {
  function dgDeps(pool) {
    return { ...baseDeps(pool), requireFeature: () => (_q, _s, next) => next() };
  }

  it("verweigert die Anonymisierung und fasst nichts an", async () => {
    /* Die Mitgliedschaftsabfrage wird wie eine echte Datenbank beantwortet:
       fremder Nutzer, kein Treffer. Sonst prueft der Test den Mock. */
    const pool = spionPool({
      zeile: { id: "u-fremd", email: "opfer@fremde-firma.de" },
      antwort: (sql) => (/FROM org_memberships/i.test(sql) ? { rows: [] } : undefined)
    });
    const router = createDataGovernanceRouter(dgDeps(pool));
    const handler = findHandlerExact(router, "post", "/data-governance/anonymize/user/:userId");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { userId: "u-fremd" } }), res, noop);
    for (let i = 0; i < 5; i++) await new Promise((fertig) => setImmediate(fertig));

    assert.equal(res._status, 403, "ein fremder Nutzer darf nicht anonymisierbar sein");
    assert.equal(res._json.error, "ORG_BOUNDARY_VIOLATION");
    keinSchreibvorgang(pool, "dsgvo-anonymisierung");
    assert.ok(
      pool.fragteMit("u-fremd", ORG_A),
      "die Zugehoerigkeitsabfrage muss Nutzer UND eigene Org tragen"
    );
  });

  it("Gegenprobe: die SELBSTloeschung bleibt moeglich", async () => {
    /* `DELETE /me` ist das Art.-17-Recht des Nutzers an seinen EIGENEN Daten.
       Es darf an keiner Org-Grenze scheitern — er kann sogar gar keiner
       Organisation mehr angehoeren. Ohne diese Gegenprobe haette die Reparatur
       das legitime Recht mit erschlagen. */
    const pool = spionPool({
      zeile: { c: 0 },
      antwort: (sql) => (/FROM org_memberships/i.test(sql) ? { rows: [] } : undefined)
    });
    const ergebnis = await dgSvc.anonymizeUser(pool, USER_A, USER_A, null);
    assert.notEqual(
      ergebnis.reason, "ORG_BOUNDARY_VIOLATION",
      "wer sich selbst loescht, braucht keine Organisation"
    );
  });

  it("auch die Vorbedingungspruefung verraet nichts ueber Fremde", async () => {
    const pool = spionPool({
      zeile: { c: 0 },
      antwort: (sql) => (/FROM org_memberships/i.test(sql) ? { rows: [] } : undefined)
    });
    const router = createDataGovernanceRouter(dgDeps(pool));
    const handler = findHandlerExact(router, "get", "/data-governance/anonymize/user/:userId/check");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { userId: "u-fremd" } }), res, noop);

    assert.equal(res._status, 403,
      "sonst verraet die Pruefung, dass es den Nutzer gibt und was ihn blockiert");
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-18 · Eine FREMDE Betroffenenanfrage konnte geschlossen werden
   ═════════════════════════════════════════════════════════════════════════

   `PATCH /data-governance/requests/:id/complete` markiert eine DSGVO-Anfrage
   als erledigt. `completeDataRequest` band bis hierher nur an die Kennung und
   den Status: `WHERE id = $1 AND status IN (...)`. Das Tor davor
   (`rperm("data_governance.requests")`) prueft ausschliesslich, ob der Aufrufer
   das Recht in SEINER Organisation hat.

   Damit konnte ein Org-Admin die Auskunfts- oder Loeschanfrage einer FREMDEN
   Organisation als erledigt schliessen — ohne sie zu erfuellen. Der Schaden
   liegt nicht im Datenabfluss, sondern in der Frist: die fremde Organisation
   glaubt, ihre Art.-15/17-Pflicht sei erledigt, waehrend die Uhr weiterlaeuft. */

describe("E-18 · PATCH /data-governance/requests/:id/complete — fremde Org", () => {
  function dgDeps(pool) {
    return { ...baseDeps(pool), requireFeature: () => (_q, _s, next) => next() };
  }

  it("schliesst die fremde Anfrage nicht und schreibt nichts Ungebundenes", async () => {
    const pool = spionPool({ zeile: null });
    const router = createDataGovernanceRouter(dgDeps(pool));
    const handler = findHandlerExact(router, "patch", "/data-governance/requests/:id/complete");

    const res = mockRes();
    await handler(
      mockReq({ orgId: ORG_A, params: { id: "anfrage-fremd" },
                body: { result_summary: { erledigt: true } } }),
      res, noop
    );

    assert.notEqual(res._status, 200, "eine fremde Anfrage darf nicht als erledigt gelten");
    for (const c of pool.schreibvorgaenge) {
      assert.ok(
        c.params.some((p) => String(p) === String(ORG_A)),
        "ein Schreibvorgang ohne die eigene Org-Kennung kann die Grenze nicht fuehren: " +
        c.sql.slice(0, 120)
      );
    }
  });

  it("Gegenprobe: der Dienst traegt die Org in die schreibende Anweisung", async () => {
    /* Ohne diese Gegenprobe wuerde ein Dienst, der GAR NICHTS mehr tut,
       ebenfalls gruen erscheinen. */
    const pool = spionPool({ zeile: { id: "anfrage-eigen", status: "completed" } });
    const ergebnis = await dgSvc.completeDataRequest(
      pool, "anfrage-eigen", "admin-1", { erledigt: true }, ORG_A
    );

    assert.ok(ergebnis, "die eigene Anfrage muss schliessbar bleiben");
    const anweisung = pool.schreibvorgaenge.find((c) => /data_governance_requests/i.test(c.sql));
    assert.ok(anweisung, "es muss ueberhaupt geschrieben werden");
    assert.ok(
      anweisung.params.some((p) => String(p) === String(ORG_A)),
      "die Org gehoert in die Parameter der schreibenden Anweisung"
    );
    assert.match(
      anweisung.sql, /org_id\s*=\s*\$\d/i,
      "die Bindung gehoert ins WHERE, nicht in einen Vergleich davor"
    );
  });

  it("ohne Organisation im Kontext wird gar nicht geschrieben", async () => {
    const pool = spionPool({ zeile: { id: "x" } });
    const ergebnis = await dgSvc.completeDataRequest(pool, "irgendeine", "admin-1", null, null);

    assert.equal(ergebnis, null, "ohne Org gibt es keine Grenze — also keine Wirkung");
    assert.deepStrictEqual(
      pool.schreibvorgaenge.map((c) => c.sql.slice(0, 60)), [],
      "ein Schreibvorgang ohne Org waere genau die Luecke"
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-19 · Der Verteilplan einer FREMDEN Ausschreibung war lesbar
   ═════════════════════════════════════════════════════════════════════════

   `getDistributionPlan(pool, requisitionId)` lud die Verteilstufen allein ueber
   die Ausschreibungs-Kennung. `GET /supplier-pools/distribution/:requisitionId`
   trug dazu nur `requireAuth`. Damit konnte JEDER Angemeldete lesen, an welche
   Lieferanten eine fremde Ausschreibung geht, in welcher Reihenfolge und wo sie
   gerade steht — die Wettbewerbsinformation schlechthin in einem Marktplatz.

   Schwerer noch: `advanceDistribution` haengt am selben Plan. Ein Fremder
   konnte die Ausschreibung eines Wettbewerbers auf die naechste Lieferantenstufe
   weiterschalten und damit dessen Vergabe steuern. */

describe("E-19 · GET /supplier-pools/distribution/:requisitionId — fremde Org", () => {
  it("liefert keine Stufen und nennt die Org in der Abfrage", async () => {
    const pool = spionPool({ zeile: null });
    const plan = await supplierPoolSvc.getDistributionPlan(pool, "req-fremd", ORG_A);

    assert.deepStrictEqual(plan.stages, [], "eine fremde Ausschreibung hat fuer uns keine Stufen");
    const abfrage = pool.calls.find((c) => /requisition_distribution_stages/i.test(c.sql));
    assert.ok(abfrage, "es muss ueberhaupt gefragt werden");
    assert.ok(
      abfrage.params.some((p) => String(p) === String(ORG_A)),
      "ohne die Org in den Parametern kann die Grenze nicht greifen"
    );
    assert.match(
      abfrage.sql, /requisitions\s+r[\s\S]*r\.org_id\s*=\s*\$\d/i,
      "die Bindung laeuft ueber die Ausschreibung — dort steht die Org"
    );
  });

  it("ohne Organisation wird gar nicht erst gefragt", async () => {
    const pool = spionPool({ zeile: { id: "s1", stage_number: 1, status: "active" } });
    const plan = await supplierPoolSvc.getDistributionPlan(pool, "req-fremd", null);

    assert.deepStrictEqual(plan.stages, []);
    assert.equal(plan.active_stage, null);
    assert.deepStrictEqual(
      pool.calls.map((c) => c.sql.slice(0, 40)), [],
      "eine Abfrage ohne Org waere die Luecke selbst"
    );
  });

  it("das Weiterschalten einer fremden Verteilung schreibt nichts", async () => {
    const pool = spionPool({ zeile: null });
    const naechste = await supplierPoolSvc.advanceDistribution(pool, "req-fremd", "actor-1", ORG_A);

    assert.equal(naechste, null, "ohne Treffer gibt es keine aktive Stufe");
    assert.deepStrictEqual(
      pool.schreibvorgaenge.map((c) => c.sql.slice(0, 60)), [],
      "die Vergabe eines Wettbewerbers darf sich nicht weiterschalten lassen"
    );
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-20 · Der DSGVO-VOLLEXPORT eines fremden Nutzers stand offen
   ═════════════════════════════════════════════════════════════════════════

   `GET /data-governance/export/user/:userId` rief `exportUserDataFull` allein
   mit der Kennung aus dem Pfad. Das Recht `data_governance.export` halten
   `owner` und `admin` JEDER Kundenorganisation — fuer die eigene Belegschaft.

   Damit konnte ein beliebiger Org-Admin den vollstaendigen Datensatz eines
   beliebigen fremden Nutzers ziehen: Mailadresse, Telefon, Anschrift,
   Steuernummer, dazu alle Anzeigen, Anfragen, Bewertungen, Angebote, Einsaetze
   und Stundenzettel. Von den drei Befunden dieser Runde ist das der mit dem
   groessten Datenabfluss — ein Werkzeug fuer die Art.-15-Auskunft, auf Dritte
   gerichtet.

   Die Geschwister-Route `/export/org` machte es von Anfang an richtig: sie
   nimmt `req.orgId` und keine Kennung aus dem Pfad. */

describe("E-20 · GET /data-governance/export/user/:userId — fremder Nutzer", () => {
  function dgDeps(pool) {
    return { ...baseDeps(pool), requireFeature: () => (_q, _s, next) => next() };
  }

  it("verweigert den Export und liest keine Personendaten", async () => {
    /* Die Mitgliedschaftsabfrage antwortet wie eine echte Datenbank: der fremde
       Nutzer ist kein Mitglied. Sonst prueft der Test den Mock. */
    const pool = spionPool({
      zeile: { id: "u-fremd", email: "opfer@fremde-firma.de", phone: "0170 1234567" },
      antwort: (sql) => (/FROM org_memberships/i.test(sql) ? { rows: [] } : undefined)
    });
    const router = createDataGovernanceRouter(dgDeps(pool));
    const handler = findHandlerExact(router, "get", "/data-governance/export/user/:userId");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { userId: "u-fremd" } }), res, noop);

    assert.equal(res._status, 403, "der Vollexport eines Fremden ist ein Grenzbruch");
    assert.ok(
      !JSON.stringify(res._json ?? null).includes("opfer@fremde-firma.de"),
      "keine Personendaten in der Absage"
    );
    const gelesen = pool.calls.filter((c) => /FROM users\b/i.test(c.sql));
    assert.deepStrictEqual(
      gelesen.map((c) => c.sql.slice(0, 60)), [],
      "die Absage muss VOR dem Laden der Personendaten fallen — sonst liegen sie schon vor"
    );
  });

  it("Gegenprobe: der eigene Nutzer wird weiterhin exportiert", async () => {
    /* Ohne sie waere eine Route, die IMMER 403 antwortet, ebenfalls gruen —
       und das Auskunftsrecht der eigenen Belegschaft waere kaputt. */
    const pool = spionPool({
      zeile: { id: "u-eigen", email: "kollege@eigene-firma.de" },
      antwort: (sql) => (/FROM org_memberships/i.test(sql)
        ? { rows: [{ id: "m1", user_id: "u-eigen", org_id: ORG_A }] }
        : undefined)
    });
    const router = createDataGovernanceRouter(dgDeps(pool));
    const handler = findHandlerExact(router, "get", "/data-governance/export/user/:userId");

    const res = mockRes();
    await handler(mockReq({ orgId: ORG_A, params: { userId: "u-eigen" } }), res, noop);

    assert.notEqual(res._status, 403, "die eigene Belegschaft muss exportierbar bleiben");
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-14 · Die Matching-Wege liefen ohne jede Bindung
   ═════════════════════════════════════════════════════════════════════════

   `findMatches` lud `SELECT * FROM demand_requests WHERE id = $1`, sonst
   nichts. Jeder Angemeldete mit `requisition.view` konnte die Engine damit
   gegen einen FREMDEN Bedarf laufen lassen und erfuhr, dass es ihn gibt und
   welche Lieferanten zu ihm passen. `logMatch` schrieb den fremden Vorgang
   zusaetzlich unter der EIGENEN Org ins ML-Protokoll — die Trainingsdaten des
   Rankings also mit fremder Herkunft.

   WARUM DIE REPARATUR NICHT "eigene Org" HEISST. Ein Bedarf wird im Marktplatz
   BEWUSST an Lieferanten ausgespielt; eine reine Org-Grenze waere das Ende des
   Marktplatzes. Die Regel musste deshalb nicht erfunden werden — sie steht seit
   jeher in `capacityExchangeService` (`demandVisibilityWhere`, Zeile 538): ein
   Bedarf ist sichtbar, solange er offen ist, freie Plaetze hat, keinen
   Ursprungsauftrag traegt und nicht abgelaufen ist.

   Der Unterschied ist nicht theoretisch: `WHERE id = $1` erreichte auch
   `closed`, `cancelled` und `fulfilled`. Das Matching war die Hintertuer zu
   genau den Bedarfen, die der Marktplatz absichtlich verbirgt.

   Die drei Gegenproben unten sind deshalb wichtiger als die Hauptproben: eine
   Reparatur, die den Marktplatz zumacht, waere schlimmer als der Befund. */

describe("E-14 · GET /matching/demand/:id — fremder, nicht ausgespielter Bedarf", () => {
  function mDeps(pool) {
    return { ...baseDeps(pool), requireFeature: () => (_q, _s, next) => next() };
  }
  const BEDARF = (felder) => ({
    requester_company_id: "u-fremd", status: "open", end_date: null,
    offene_plaetze: 3, hat_ursprungsauftrag: false, ...felder
  });

  it("weist ab, ohne die Engine zu starten oder ins ML-Protokoll zu schreiben", async () => {
    const pool = spionPool({ zeile: BEDARF({ status: "closed", offene_plaetze: 0 }) });
    const router = createMatchingRouter(mDeps(pool));
    const handler = findHandlerExact(router, "get", "/matching/demand/:id");

    const res = mockRes();
    await handler(
      mockReq({ session: { userId: "u-eigen" }, orgId: ORG_A, params: { id: "bedarf-fremd" } }),
      res, noop
    );
    for (let i = 0; i < 5; i++) await new Promise((f) => setImmediate(f));

    assert.equal(res._status, 403, "ein fremder, nicht ausgespielter Bedarf ist eine Grenze");
    assert.deepStrictEqual(
      pool.schreibvorgaenge.map((c) => c.sql.slice(0, 40)), [],
      "logMatch darf den fremden Vorgang nicht unter der eigenen Org verbuchen"
    );
    const kapazitaeten = pool.calls.filter((c) => /FROM capacity_posts/i.test(c.sql));
    assert.deepStrictEqual(
      kapazitaeten.map((c) => c.sql.slice(0, 40)), [],
      "die Engine darf gar nicht erst laufen — Klaerung vor Arbeit"
    );
  });

  it("Gegenprobe: der eigene Bedarf bleibt in JEDEM Status erreichbar", async () => {
    /* Wer seinen Bedarf selbst gestellt hat, muss auch das abgeschlossene
       Gesuch nachvollziehen koennen. Ohne diese Zusicherung waere die
       Reparatur eine Funktionssperre. */
    const pool = spionPool({
      zeile: BEDARF({ requester_company_id: "u-eigen", status: "closed", offene_plaetze: 0 })
    });
    const router = createMatchingRouter(mDeps(pool));
    const handler = findHandlerExact(router, "get", "/matching/demand/:id");

    const res = mockRes();
    await handler(
      mockReq({ session: { userId: "u-eigen" }, orgId: ORG_A, params: { id: "bedarf-eigen" } }),
      res, noop
    );
    for (let i = 0; i < 5; i++) await new Promise((f) => setImmediate(f));

    assert.notEqual(res._status, 403, "der eigene Bedarf ist nie eine Grenzverletzung");
  });

  it("Gegenprobe: ein AUSGESPIELTER fremder Bedarf bleibt matchbar", async () => {
    /* Die wichtigste Zusicherung dieser Datei. Ein Lieferant MUSS die offenen
       Bedarfe anderer matchen koennen — das ist der Marktplatz. Eine
       Reparatur, die das zumacht, waere schlimmer als der Befund. */
    const pool = spionPool({ zeile: BEDARF({}) });
    const router = createMatchingRouter(mDeps(pool));
    const handler = findHandlerExact(router, "get", "/matching/demand/:id");

    const res = mockRes();
    await handler(
      mockReq({ session: { userId: "u-eigen" }, orgId: ORG_A, params: { id: "bedarf-offen" } }),
      res, noop
    );
    for (let i = 0; i < 5; i++) await new Promise((f) => setImmediate(f));

    assert.notEqual(res._status, 403, "ein offen ausgespielter Bedarf ist keine Grenze");
    assert.notEqual(res._status, 404, "und er existiert");
  });

  it("die Sichtbarkeitsregel prueft alle vier Bedingungen, nicht nur den Status", async () => {
    /* Ein Handler, der nur `status === 'open'` prueft, bestuende die Proben
       oben. Die Regel des Marktplatzes hat aber vier Teile — jeder einzelne
       muss abweisen koennen, sonst ist die Hintertuer nur schmaler geworden. */
    const faelle = [
      ["Status geschlossen",        { status: "closed" }],
      ["keine freien Plaetze mehr", { offene_plaetze: 0 }],
      ["Ursprungsauftrag vorhanden",{ hat_ursprungsauftrag: true }],
      ["Zeitraum abgelaufen",       { end_date: "2020-01-01" }]
    ];
    for (const [was, feld] of faelle) {
      const urteil = await engine.darfBedarfSehen(
        spionPool({ zeile: BEDARF(feld) }), "bedarf-fremd", "u-eigen"
      );
      assert.equal(urteil, "ORG_BOUNDARY_VIOLATION", `${was}: muss abweisen`);
    }
    const offen = await engine.darfBedarfSehen(
      spionPool({ zeile: BEDARF({}) }), "bedarf-offen", "u-eigen"
    );
    assert.equal(offen, "OK", "und der offene Bedarf muss durchkommen");
  });
});

describe("E-14 · GET /matching/supply/:id — fremdes, nicht ausgespieltes Angebot", () => {
  function mDeps(pool) {
    return { ...baseDeps(pool), requireFeature: () => (_q, _s, next) => next() };
  }
  const ANGEBOT = (felder) => ({
    supplier_company_id: "u-fremd", org_id: null,
    status: "active", visibility_status: "public", ...felder
  });

  it("weist ein privates fremdes Angebot ab und startet die Engine nicht", async () => {
    const pool = spionPool({ zeile: ANGEBOT({ visibility_status: "private" }) });
    const router = createMatchingRouter(mDeps(pool));
    const handler = findHandlerExact(router, "get", "/matching/supply/:id");

    const res = mockRes();
    await handler(
      mockReq({ session: { userId: "u-eigen" }, orgId: ORG_A, params: { id: "angebot-fremd" } }),
      res, noop
    );
    for (let i = 0; i < 5; i++) await new Promise((f) => setImmediate(f));

    assert.equal(res._status, 403);
    const bedarfe = pool.calls.filter((c) => /FROM (requisitions|demand_requests)/i.test(c.sql));
    assert.deepStrictEqual(bedarfe.map((c) => c.sql.slice(0, 40)), [],
      "die Engine darf gar nicht erst laufen");
  });

  it("Gegenprobe: das EIGENE Angebot bleibt erreichbar, auch privat", async () => {
    const eigen = await engine.darfKapazitaetSehen(
      spionPool({ zeile: ANGEBOT({ supplier_company_id: "u-eigen", visibility_status: "private" }) }),
      "angebot-eigen", "u-eigen", ORG_A
    );
    assert.equal(eigen, "OK", "der Anbieter sieht sein Angebot immer");

    const ueberOrg = await engine.darfKapazitaetSehen(
      spionPool({ zeile: ANGEBOT({ org_id: ORG_A, visibility_status: "private" }) }),
      "angebot-eigen", "u-eigen", ORG_A
    );
    assert.equal(ueberOrg, "OK", "auch ein Kollege derselben Organisation");
  });

  it("Gegenprobe: ein oeffentliches fremdes Angebot bleibt matchbar", async () => {
    const offen = await engine.darfKapazitaetSehen(
      spionPool({ zeile: ANGEBOT({}) }), "angebot-offen", "u-eigen", ORG_A
    );
    assert.equal(offen, "OK", "ein aktives, oeffentliches Angebot ist der Marktplatz");
  });
});

/* ═════════════════════════════════════════════════════════════════════════
   E-21 · GET /matching/worker/:id hat nie funktioniert
   ═════════════════════════════════════════════════════════════════════════

   `matchWorkerToAssignments` liest `FROM workers`. Diese Tabelle hat KEINE
   Migration je angelegt — gegen die laufende Datenbank gemessen antwortet
   Postgres mit 42P01 ("relation does not exist"). Der Weg endet seit jeher in
   500. Kein Frontend, kein E2E-Lauf und keine Dokumentationsseite ruft ihn auf.

   Ob er entfernt oder auf `worker_profiles` gebaut wird, ist eine
   Produktentscheidung (P1-19) und wird hier nicht geraten: `worker_profiles`
   hat weder `role` noch Koordinaten, die Bewertung der Engine liefe also ins
   Leere und wuerde systematisch falsche Treffer erzeugen.

   Was NICHT wartet: die Bindung. Ohne sie waere die Abfrage am Tag, an dem
   jemand eine `workers`-Tabelle anlegt, sofort ein ungebundener
   org-uebergreifender Lesezugriff — ein schlafendes Leck, das niemand mit dem
   Anlegen der Tabelle in Verbindung braechte. */

describe("E-21 · matchWorkerToAssignments — die Bindung steht vor der Tabelle", () => {
  it("traegt die Org im SQL, sobald ein Betrachter bekannt ist", async () => {
    const pool = spionPool({ zeile: null });
    await engine.matchWorkerToAssignments(pool, "w-fremd", { viewerOrgId: ORG_A });

    const abfrage = pool.calls.find((c) => /FROM workers/i.test(c.sql));
    assert.ok(abfrage, "es muss ueberhaupt gefragt werden");
    assert.ok(
      abfrage.params.some((p) => String(p) === String(ORG_A)),
      "ohne die Org in den Parametern kann die Grenze nicht greifen"
    );
    assert.match(
      abfrage.sql, /supplier_org_id\s*=\s*\$\d/i,
      "die Bindung gehoert ins WHERE — sie muss VOR der Tabelle da sein, nicht nach ihr"
    );
  });

  it("ohne Betrachter (Hintergrundlauf) bleibt es beim alten Verhalten", async () => {
    /* Cron- und Trigger-Laeufe haben keine Mandantensicht, die man verletzen
       koennte. Eine Bindung, die dort greift, wuerde die Hintergrundarbeit
       stilllegen — genau die Sorte Reparatur, die schlimmer ist als der Befund. */
    const pool = spionPool({ zeile: null });
    await engine.matchWorkerToAssignments(pool, "w1", {});

    const abfrage = pool.calls.find((c) => /FROM workers/i.test(c.sql));
    assert.ok(abfrage);
    assert.deepStrictEqual(abfrage.params, ["w1"], "kein zusaetzlicher Parameter");
  });
});

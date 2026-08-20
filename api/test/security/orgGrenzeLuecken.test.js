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
  ORG_A, ORG_B, USER_A
} from "../helpers/security-mocks.js";
import { spionPool } from "../helpers/orgGrenzenSpion.js";

import { createRateCardsRouter }     from "../../routes/rateCards.js";
import { createInvoicesRouter }      from "../../routes/invoices.js";
import { createApprovalsRouter }     from "../../routes/approvals.js";
import { createRequisitionsRouter }  from "../../routes/requisitions.js";
import { createOrganizationsRouter } from "../../routes/organizations.js";
import { createWorkersRouter }      from "../../routes/workers.js";

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

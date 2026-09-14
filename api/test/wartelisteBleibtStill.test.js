/**
 * Welle N2.9 — die Warteliste laeuft im Hintergrund.
 *
 * OWNER-VORGABE 2026-09-13: "keiner soll mitbekommen, dass er vorgemerkt ist
 * fuer ein Angebot, das er sehr wahrscheinlich niemals annimmt."
 *
 * Die Warteliste (`assignment_staffing_waitlist`, Migration 089) ist die
 * Nachruecker-Schlange INNERHALB eines Einsatzes: faellt eine Kraft aus, rueckt
 * die naechste nach — in denselben Einsatz. Vorgemerkt zu sein ist ein
 * Planungszustand der Zeitarbeitsfirma, keine Nachricht an den Menschen. Er
 * erfaehrt davon erst, wenn er WIRKLICH eingeladen wird.
 *
 * Gemessen am 2026-09-13: der Code haelt das bereits ein. Diese Datei sorgt
 * dafuer, dass es so bleibt — an der Wirkung, nicht am Quelltext:
 *
 *   1. Vormerken schreibt keine Benachrichtigung, keine Einladung, keine
 *      Nachricht an die Kraft.
 *   2. Eine Kampagne laedt die Ausgewaehlten ein UND fuellt die Schlange mit
 *      weiteren Kandidaten — nur die Eingeladenen werden benachrichtigt.
 *   3. Was die Kraft im Portal sieht (Anfragen, Auswahl-Sets), liest die
 *      Warteliste nicht; ein vorgemerkter Eintrag kann dort nicht auftauchen.
 *   4. Das Kraefte-Portal hat keinen Pfad zur Warteliste.
 *
 * Grenze, benannt: eine formale DSGVO-Auskunft (Art. 15) ist KEINE Oberflaeche.
 * Ob die Vormerkung dort genannt werden muss, ist eine Rechtsfrage und liegt
 * beim Owner (docs/PILOT_GO_LIVE_TODOS.md, N2.9).
 *
 * Run: node --test --test-force-exit test/wartelisteBleibtStill.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/assignmentStaffingService.js";
import { createWorkerPortalRouter } from "../routes/workerPortal.js";
import { listRoutesTief } from "./helpers/security-mocks.js";

const TX = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

/* Schreibt jede Abfrage mit; antwortet nach Stichwort, sonst mit leeren Zeilen. */
function spurPool(antwort) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = String(sql);
    if (TX.has(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params });
    if (/SELECT 1 FROM assignments\s+WHERE id = \$1 AND supplier_org_id = \$2/i.test(text)) {
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    }
    const out = antwort(text, params);
    return out || { rows: [], rowCount: 0 };
  };
  return { query, connect: async () => ({ query, release() {} }), calls };
}
const rows = (arr) => ({ rows: arr, rowCount: arr.length });

/* Alles, womit ein Mensch von einem Vorgang erfahren kann. */
const KONTAKT = [
  /INSERT INTO notifications/i,
  /INSERT INTO assignment_staffing_invites/i,
  /INSERT INTO assignment_staffing_messages/i,
  /INSERT INTO [a-z_]*(mail|outbox|push)[a-z_]*/i
];
const kontaktAn = (pool, workerId) => pool.calls.filter((c) =>
  KONTAKT.some((m) => m.test(c.sql)) && c.params.some((p) => p === workerId || (typeof p === "string" && p.includes(workerId))));

const EINSATZ = {
  id: "asg-still-1", org_id: "org-kunde", supplier_org_id: "org-zaf",
  worker_description: "Lagerhelfer", requested_quantity: 3, worker_count: 3,
  filled_quantity: 0, reserved_quantity: 0, open_quantity: 3, staffing_status: "open",
  status: "planned", start_date: "2026-10-01", planned_end_date: "2026-10-31",
  client_org_name: "Kunde A", requisition_role: "Lagerhelfer",
  requisition_skill_tags: ["lager"], requisition_qualifications: [],
  requisition_location_city: "Berlin", requisition_location_lat: 52.52, requisition_location_lng: 13.405,
  requisition_radius_km: 25, requisition_shift_requirements: null,
  demand_skill_tags: [], demand_requirements: null, demand_request_id: null
};

function kraft(userId, vorname) {
  return {
    user_id: userId, first_name: vorname, last_name: "Beispiel", personnel_number: userId,
    city: "Berlin", skill_tags: ["lager"], qualifications: [], profile_text: "Lager",
    is_active: true, email: `${userId}@example.com`, worker_latitude: 52.52, worker_longitude: 13.41,
    active_assignment_count: 0, current_assignment_count: 0, same_client_assignment_count: 0,
    confirmed_assignment_count: 3, conflict_count: 0, reservation_conflict_count: 0,
    current_reservation_count: 0, verified_doc_count: 1, expired_doc_count: 0, verified_doc_names: [],
    open_invite_count: 0, historical_invite_count: 0, approved_submission_count: 2,
    customer_confirmed_submission_count: 1, posted_submission_count: 1,
    needs_attention_submission_count: 0, customer_rejected_submission_count: 0
  };
}

describe("N2.9 — Vormerken ist keine Nachricht", () => {
  it("queueAssignmentWaitlistWorkers merkt vor — und schreibt nichts, was die Kraft erreicht", async () => {
    const pool = spurPool((sql) => {
      if (sql.includes("LEFT JOIN organizations buyer")) return rows([EINSATZ]);
      if (sql.includes("FROM worker_profiles wp")) return rows([kraft("w-vorgemerkt", "Vera")]);
      if (sql.includes("COALESCE(source_campaign_id, id)")) return rows([{ root_campaign_id: "root-1" }]);
      if (sql.includes("COALESCE(MAX(queue_rank)")) return rows([{ max_rank: 0 }]);
      if (sql.includes("INSERT INTO assignment_staffing_waitlist")) {
        return rows([{ id: "wl-1", worker_user_id: "w-vorgemerkt", status: "queued", queue_rank: 1 }]);
      }
      if (sql.includes("AS filled_quantity") || sql.includes("AS live_invite_quantity")) {
        return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: 0 }]);
      }
      if (sql.includes("UPDATE assignments")) return rows([{ ...EINSATZ }]);
      return null;
    });

    const result = await svc.queueAssignmentWaitlistWorkers(pool, {
      assignmentId: EINSATZ.id, supplierOrgId: EINSATZ.supplier_org_id, actorId: "dispo-1",
      workerUserIds: ["w-vorgemerkt"]
    });

    // Nicht leer gruen: die Vormerkung MUSS stattgefunden haben.
    assert.equal(result.error, undefined, `Vormerken schlug fehl: ${result.error}`);
    const vormerkung = pool.calls.find((c) => c.sql.includes("INSERT INTO assignment_staffing_waitlist"));
    assert.ok(vormerkung, "es wurde gar nicht vorgemerkt — die Probe haette nichts bewiesen");
    assert.ok(vormerkung.params.includes("w-vorgemerkt") && vormerkung.params.includes("queued"));

    assert.deepEqual(kontaktAn(pool, "w-vorgemerkt").map((c) => c.sql.slice(0, 60)), [],
      "die vorgemerkte Kraft wurde benachrichtigt, eingeladen oder angeschrieben");
    assert.equal(pool.calls.filter((c) => KONTAKT.some((m) => m.test(c.sql))).length, 0,
      "Vormerken erzeugt Kontakt — an irgendwen");
  });
});

describe("N2.9 — die Kampagne benachrichtigt nur die Eingeladenen", () => {
  it("ausgewaehlt = eingeladen + benachrichtigt; nachgeruecktes Polster = still vorgemerkt", async () => {
    let einladungen = 0;
    const pool = spurPool((sql, params) => {
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) return rows([EINSATZ]);
      if (sql.includes("AS live_invite_quantity") || sql.includes("AS filled_quantity")) {
        return rows([{ filled_quantity: 0, pending_quantity: 0, reservation_quantity: 0, live_invite_quantity: einladungen }]);
      }
      if (sql.includes("UPDATE assignments") && sql.includes("staffing_last_recalculated_at")) {
        return rows([{ ...EINSATZ, open_quantity: 3 }]);
      }
      if (sql.includes("FROM worker_profiles wp")) {
        return rows([kraft("w-eingeladen", "Eva"), kraft("w-polster", "Paul")]);
      }
      if (sql.includes("COALESCE(MAX(queue_rank)")) return rows([{ max_rank: 1 }]);
      if (sql.includes("INSERT INTO assignment_staffing_waitlist")) {
        return rows([{ id: `wl-${params[7]}`, worker_user_id: params[7], status: params[10], queue_rank: params[11] }]);
      }
      if (sql.includes("INSERT INTO assignment_staffing_campaigns")) {
        return rows([{ id: "camp-1", assignment_id: EINSATZ.id, target_quantity: 1, promotion_mode: "auto_finalize" }]);
      }
      if (sql.includes("INSERT INTO assignment_staffing_invites")) {
        einladungen += 1;
        return rows([{ id: `inv-${params[2]}`, assignment_id: EINSATZ.id, campaign_id: "camp-1", worker_user_id: params[2], status: "sent" }]);
      }
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) {
        return rows([{ id: "camp-1", assignment_id: EINSATZ.id, status: "active", completed_at: null }]);
      }
      if (sql.includes("COUNT(*)::INT AS total_count")) {
        return rows([{ total_count: einladungen, viewed_count: 0, interested_count: 0, accepted_count: 0,
          declined_count: 0, expired_count: 0, cancelled_count: 0, live_count: einladungen }]);
      }
      if (sql.includes("UPDATE assignment_staffing_campaigns") && sql.includes("SET status = $2")) {
        return rows([{ id: "camp-1", assignment_id: EINSATZ.id, status: "active", sent_count: einladungen }]);
      }
      // Zustellung: erst "in Warteschlange", dann der Zustell-Kontext der Einladung.
      if (sql.includes("UPDATE assignment_staffing_invites") && sql.includes("delivery_status = 'queued'")) {
        return rows([{ id: params[0], assignment_id: EINSATZ.id, campaign_id: "camp-1", worker_user_id: String(params[0]).replace(/^inv-/, "") }]);
      }
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("WHERE i.id = $1")) {
        return rows([{ id: params[0], assignment_id: EINSATZ.id, campaign_id: "camp-1", status: "sent",
          worker_user_id: String(params[0]).replace(/^inv-/, ""), worker_description: "Lagerhelfer", open_quantity: 3 }]);
      }
      if (sql.includes("INSERT INTO notifications")) return rows([{ id: `n-${params[0]}`, user_id: params[0] }]);
      return null;
    });

    const result = await svc.createStaffingCampaign(pool, {
      assignmentId: EINSATZ.id, supplierOrgId: EINSATZ.supplier_org_id, actorId: "dispo-1",
      workerUserIds: ["w-eingeladen"]
    });

    assert.equal(result.error, undefined, `Kampagne schlug fehl: ${result.error}`);
    assert.deepEqual(result.invites.map((i) => i.worker_user_id), ["w-eingeladen"]);

    // Das Polster ist WIRKLICH vorgemerkt worden — sonst beweist das Folgende nichts.
    const polster = pool.calls.find((c) => c.sql.includes("INSERT INTO assignment_staffing_waitlist") && c.params[7] === "w-polster");
    assert.ok(polster, "das Polster wurde nicht vorgemerkt — die Probe haette keinen Gegenstand");
    assert.equal(polster.params[10], "queued");

    // Die Eingeladene wird benachrichtigt: der Zustellweg ist in dieser Probe gelaufen.
    const anEva = pool.calls.filter((c) => /INSERT INTO notifications/i.test(c.sql) && c.params[0] === "w-eingeladen");
    assert.equal(anEva.length, 1, "die eingeladene Kraft wurde nicht benachrichtigt — Zustellweg nicht durchlaufen");

    // Und das Polster erfaehrt nichts.
    assert.deepEqual(kontaktAn(pool, "w-polster").map((c) => c.sql.slice(0, 60)), [],
      "eine nur vorgemerkte Kraft wurde benachrichtigt, eingeladen oder angeschrieben");
  });
});

describe("N2.9 — was die Kraft sieht, liest die Warteliste nicht", () => {
  /* Die Warteliste antwortet in dieser Welt mit einem erkennbaren Eintrag. Liest
     eine Kraefte-Sicht sie, taucht er im Ergebnis auf — oder die Abfrage steht
     in der Spur. */
  const MARKE = "VORGEMERKT-GEHEIM";
  const welt = (sql) => {
    if (sql.includes("assignment_staffing_waitlist")) {
      return rows([{ id: MARKE, assignment_id: MARKE, worker_user_id: "w-1", status: "queued", queue_rank: 1 }]);
    }
    return null;
  };

  for (const [name, aufruf, quelle] of [
    ["listWorkerStaffingRequests", (p) => svc.listWorkerStaffingRequests(p, "w-1", { limit: 25 }), /assignment_staffing_invites/],
    ["listWorkerStaffingChoiceSets", (p) => svc.listWorkerStaffingChoiceSets(p, "w-1", { limit: 10 }), /assignment_staffing_choice_sets/]
  ]) {
    it(`${name}: keine Abfrage auf die Warteliste, kein vorgemerkter Eintrag im Ergebnis`, async () => {
      const pool = spurPool(welt);
      const ergebnis = await aufruf(pool);
      assert.ok(pool.calls.some((c) => quelle.test(c.sql)), `${name} hat seine eigentliche Quelle nicht gelesen — Probe ohne Gegenstand`);
      assert.deepEqual(pool.calls.filter((c) => c.sql.includes("assignment_staffing_waitlist")).map((c) => c.sql.slice(0, 80)), [],
        `${name} liest die Warteliste`);
      assert.equal(JSON.stringify(ergebnis).includes(MARKE), false, `${name} liefert einen vorgemerkten Eintrag aus`);
    });
  }

  it("das Kraefte-Portal hat keinen Pfad zur Warteliste", () => {
    const noop = (_req, _res, next) => next();
    const router = createWorkerPortalRouter({
      pool: { query: async () => ({ rows: [] }) }, requireAuth: noop, logger: { info() {}, warn() {}, error() {}, debug() {} }
    });
    const routen = listRoutesTief(router);
    assert.ok(routen.some((r) => r.path.includes("staffing-requests")), "Portal-Routen nicht gefunden — Probe ohne Gegenstand");
    assert.deepEqual(routen.filter((r) => /wait|warte|queue|nachr/i.test(r.path)).map((r) => `${r.method} ${r.path}`), []);
  });
});

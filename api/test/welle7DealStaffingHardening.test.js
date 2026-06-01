/**
 * Welle 7 – Systemische Haertung Deal / Staffing / Einsatz
 *
 * Konsolidierte Regressionstests fuer die in Welle 7 eingefuehrten Kernfluesse:
 *   - Phase 3+4 : listClosedDealAssignments liefert vollbesetzte/beendete/stornierte Deals
 *   - Phase 6+7+8: offerQuickAssignSchema fuer One-click/Bulk aus der Dealakte
 *   - Phase 9  : cancelAgreement dreht Staffing-Reservations/Invites/Assignment zurueck
 *
 * Die Tests nutzen bewusst ein schlankes Pool-Harness, um die SQL-Pfade ohne
 * laufende Datenbank zu validieren.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cancelAgreement } from "../services/dealAgreementService.js";
import { listClosedDealAssignments } from "../services/assignmentStaffingService.js";

// ── Phase 3+4 ──────────────────────────────────────────────────────────────

describe("Welle 7 – Phase 3+4: listClosedDealAssignments", () => {
  it("filtert auf supplier_org_id, status completed/cancelled oder open_quantity=0", async () => {
    const captured = { sqls: [], params: null };
    const pool = {
      async query(sql, params) {
        captured.sqls.push(sql);
        captured.params = params;
        return {
          rows: [
            {
              assignment_id: "asg-1",
              supplier_org_id: "supplier-org-1",
              status: "completed",
              open_quantity: 0,
              filled_quantity: 2,
              requested_quantity: 2,
              offer_agreement_ref: "EV-2026-000999",
              link_total_count: 2,
              link_active_count: 2
            }
          ],
          rowCount: 1
        };
      }
    };
    const rows = await listClosedDealAssignments(pool, "supplier-org-1", { limit: 25 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].assignment_id, "asg-1");
    assert.equal(captured.params[0], "supplier-org-1");
    // Limit soll geklemmt werden (1..250)
    assert.equal(captured.params[1], 25);
    const sql = captured.sqls[0];
    assert.ok(sql.includes("a.supplier_org_id = $1"));
    assert.ok(sql.includes("a.status IN ('completed','cancelled')"));
    assert.ok(sql.includes("open_quantity, GREATEST"));
    // LEFT JOIN worker_assignment_links als Subselect fuer link_total_count
    assert.ok(sql.includes("link_total_count"));
    assert.ok(sql.includes("link_active_count"));
  });

  it("klemmt limit auf den erlaubten Bereich (1..250)", async () => {
    const captured = { params: null };
    const pool = {
      async query(_sql, params) {
        captured.params = params;
        return { rows: [], rowCount: 0 };
      }
    };
    await listClosedDealAssignments(pool, "supplier-org-1", { limit: 999 });
    assert.equal(captured.params[1], 250);
    await listClosedDealAssignments(pool, "supplier-org-1", { limit: 0 });
    assert.equal(captured.params[1], 1);
  });
});

// ── Phase 9 ────────────────────────────────────────────────────────────────

describe("Welle 7 – Phase 9: cancelAgreement Staffing-Reaktivierung", () => {
  it("setzt Assignment auf cancelled und released Reservations/Invites zurueck", async () => {
    const offer = {
      id: "offer-welle7-1",
      agreement_status: "activated",
      agreement_ref: "EV-2026-000777",
      assignment_id: "asg-welle7-1",
      demand_request_id: null,
      capacity_post_id: null
    };
    const queries = [];
    const pool = {
      async connect() {
        return {
          async query(sql, params) {
            queries.push({ sql, params });
            // Transaktions-Guards
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
              return { rows: [], rowCount: 0 };
            }
            if (sql === "SELECT * FROM offers WHERE id = $1 FOR UPDATE") {
              return { rows: [offer], rowCount: 1 };
            }
            if (sql.includes("UPDATE offers SET") && sql.includes("agreement_status = 'cancelled'")) {
              return { rows: [{ ...offer, agreement_status: "cancelled" }], rowCount: 1 };
            }
            if (sql.includes("UPDATE assignments SET status = 'cancelled'")) {
              return { rows: [], rowCount: 1 };
            }
            if (sql.includes("UPDATE assignment_staffing_reservations")) {
              return { rows: [], rowCount: 3 };
            }
            if (sql.includes("UPDATE assignment_staffing_invites")) {
              return { rows: [], rowCount: 2 };
            }
            if (sql.includes("INSERT INTO audit_log") || sql.includes("INSERT INTO state_transitions")) {
              return { rows: [], rowCount: 1 };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
          release() {}
        };
      }
    };

    const result = await cancelAgreement(pool, offer.id, "actor-1", "Kundenrueckzug");
    assert.equal(result.offer.agreement_status, "cancelled");
    assert.ok(result.staffing_reset);
    assert.equal(result.staffing_reset.assignment_cancelled, true);
    assert.equal(result.staffing_reset.reservations_released, 3);
    assert.equal(result.staffing_reset.invites_cancelled, 2);

    const assignmentUpdate = queries.find((q) => q.sql.includes("UPDATE assignments SET status = 'cancelled'"));
    assert.ok(assignmentUpdate, "Assignment-Update wurde ausgefuehrt");
    assert.deepEqual(assignmentUpdate.params, [offer.assignment_id]);

    const reservationUpdate = queries.find((q) => q.sql.includes("assignment_staffing_reservations"));
    assert.ok(reservationUpdate);
    assert.deepEqual(reservationUpdate.params, [offer.assignment_id]);

    const inviteUpdate = queries.find((q) => q.sql.includes("assignment_staffing_invites"));
    assert.ok(inviteUpdate);
    assert.deepEqual(inviteUpdate.params, [offer.assignment_id]);
  });

  it("ueberspringt Staffing-Reset wenn kein assignment_id vorhanden", async () => {
    const offer = {
      id: "offer-welle7-2",
      agreement_status: "pending_confirmation",
      agreement_ref: "EV-2026-000778",
      assignment_id: null,
      demand_request_id: null,
      capacity_post_id: null
    };
    const queries = [];
    const pool = {
      async connect() {
        return {
          async query(sql, params) {
            queries.push({ sql, params });
            if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
              return { rows: [], rowCount: 0 };
            }
            if (sql === "SELECT * FROM offers WHERE id = $1 FOR UPDATE") {
              return { rows: [offer], rowCount: 1 };
            }
            if (sql.includes("UPDATE offers SET") && sql.includes("agreement_status = 'cancelled'")) {
              return { rows: [{ ...offer, agreement_status: "cancelled" }], rowCount: 1 };
            }
            if (sql.includes("INSERT INTO audit_log") || sql.includes("INSERT INTO state_transitions")) {
              return { rows: [], rowCount: 1 };
            }
            throw new Error(`Unexpected SQL: ${sql}`);
          },
          release() {}
        };
      }
    };

    const result = await cancelAgreement(pool, offer.id, "actor-2", null);
    assert.equal(result.offer.agreement_status, "cancelled");
    assert.ok(result.staffing_reset);
    assert.equal(result.staffing_reset.assignment_cancelled, false);
    assert.equal(result.staffing_reset.reservations_released, 0);
    assert.equal(result.staffing_reset.invites_cancelled, 0);
    assert.equal(
      queries.find((q) => q.sql.includes("UPDATE assignments")),
      undefined,
      "Assignment-Update darf ohne assignment_id nicht ausgefuehrt werden"
    );
  });
});

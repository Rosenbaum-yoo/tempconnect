import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { listAssignmentSuggestions } from "../services/assignmentStaffingService.js";

function createTransactionalPool(queryFn) {
  const wrappedQuery = async (sql, params) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    return queryFn(sql, params);
  };
  return {
    query: wrappedQuery,
    connect: async () => ({
      query: wrappedQuery,
      release: () => {}
    })
  };
}

function buildStaffingAssignment(overrides = {}) {
  return {
    id: "asg-worker-filter-1",
    org_id: "org-1",
    supplier_org_id: "sup-1",
    worker_description: "Lagerhelfer",
    requested_quantity: 1,
    worker_count: 1,
    filled_quantity: 0,
    reserved_quantity: 0,
    open_quantity: 1,
    staffing_status: "open",
    status: "planned",
    start_date: "2026-06-01",
    planned_end_date: "2026-06-30",
    client_org_name: "Kunde A",
    requisition_role: "Lagerhelfer",
    requisition_skill_tags: ["lager"],
    requisition_qualifications: [],
    requisition_location_city: "Berlin",
    requisition_location_lat: 52.52,
    requisition_location_lng: 13.405,
    requisition_radius_km: 25,
    requisition_shift_requirements: { model: "Frühschicht" },
    demand_role: null,
    demand_skill_tags: [],
    demand_requirements: null,
    demand_location_city: null,
    demand_location_lat: null,
    demand_location_lng: null,
    demand_radius_km: null,
    demand_shifts: null,
    demand_request_id: null,
    ...overrides
  };
}

function buildSuggestionWorker(overrides = {}) {
  return {
    user_id: "worker-1",
    first_name: "Anna",
    last_name: "Beispiel",
    personnel_number: "1001",
    city: "Berlin",
    skill_tags: ["lager"],
    qualifications: [],
    profile_text: "Lagerhelfer Frühschicht",
    availability_note: null,
    is_active: true,
    email: "anna@example.com",
    worker_latitude: 52.52,
    worker_longitude: 13.41,
    active_assignment_count: 0,
    current_assignment_count: 0,
    same_client_assignment_count: 2,
    confirmed_assignment_count: 8,
    conflict_count: 0,
    reservation_conflict_count: 0,
    current_reservation_count: 0,
    verified_doc_count: 1,
    expired_doc_count: 0,
    verified_doc_names: [],
    open_invite_count: 0,
    historical_invite_count: 0,
    approved_submission_count: 6,
    customer_confirmed_submission_count: 2,
    posted_submission_count: 2,
    needs_attention_submission_count: 0,
    customer_rejected_submission_count: 0,
    ...overrides
  };
}

describe("assignment staffing suggestions worker filter", () => {
  it("scopes suggestion evaluation to one targeted worker", async () => {
    const assignment = buildStaffingAssignment();
    const workerRows = [
      buildSuggestionWorker({
        user_id: "worker-target",
        first_name: "Tina",
        last_name: "Target"
      }),
      buildSuggestionWorker({
        user_id: "worker-other",
        first_name: "Olli",
        last_name: "Other",
        same_client_assignment_count: 0,
        confirmed_assignment_count: 1
      })
    ];
    let workerFilterIds = null;

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) {
        return { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM worker_profiles wp")) {
        workerFilterIds = params.find((value) => Array.isArray(value)) || null;
        const rows = workerFilterIds
          ? workerRows.filter((worker) => workerFilterIds.includes(worker.user_id))
          : workerRows;
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("COUNT(*) FILTER (WHERE status = 'queued')::INT AS queued_count")) {
        return {
          rows: [{
            queued_count: 0,
            invited_count: 0,
            reserved_count: 0,
            assigned_count: 0,
            removed_count: 0
          }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM worker_assignment_links wal") && sql.includes("AS live_invite_quantity")) {
        return {
          rows: [{
            filled_quantity: 0,
            pending_quantity: 0,
            reservation_quantity: 0,
            live_invite_quantity: 0
          }],
          rowCount: 1
        };
      }
      if (sql.includes("UPDATE assignments") && sql.includes("staffing_last_recalculated_at")) {
        return {
          rows: [{
            ...assignment,
            requested_quantity: params[1],
            worker_count: params[1],
            filled_quantity: params[2],
            reserved_quantity: params[3],
            open_quantity: params[4],
            staffing_status: params[5]
          }],
          rowCount: 1
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await listAssignmentSuggestions(pool, assignment.id, assignment.supplier_org_id, {
      limit: 10,
      includeBlocked: true,
      workerUserId: "worker-target"
    });

    assert.deepEqual(workerFilterIds, ["worker-target"]);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].worker_user_id, "worker-target");
  });
});

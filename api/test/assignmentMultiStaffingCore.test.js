import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAssignment, updateAssignment } from "../services/assignmentService.js";
import { activateAgreement } from "../services/dealAgreementService.js";
import {
  createStaffingCampaign,
  listWorkerStaffingChoiceSets,
  listWorkerStaffingRequests,
  dispatchDueStaffingReminders,
  getAutoBackfillBatchSize,
  listAssignmentSuggestions,
  listOpenStaffingAssignments,
  respondToStaffingInvite,
  runAutoBackfill,
  runStaffingMaintenance,
  submitStaffingChoicePreferences,
  submitStaffingChoiceRanking
} from "../services/assignmentStaffingService.js";

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
    id: "asg-staffing-1",
    org_id: "org-1",
    supplier_org_id: "sup-1",
    worker_description: "Lagerhelfer",
    requested_quantity: 2,
    worker_count: 2,
    filled_quantity: 0,
    reserved_quantity: 0,
    open_quantity: 2,
    staffing_status: "open",
    status: "planned",
    start_date: "2026-06-01",
    planned_end_date: "2026-06-30",
    client_org_name: "Kunde A",
    requisition_role: "Lagerhelfer",
    requisition_skill_tags: ["lager", "kommissionierung"],
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

function buildChoiceSetRow(overrides = {}) {
  const setId = overrides.id || "choice-set-1";
  const optionId = overrides.option_id || "choice-opt-1";
  const assignmentId = overrides.option_assignment_id || "asg-choice-1";
  const inviteId = overrides.option_invite_id || "invite-choice-1";
  const campaignId = overrides.option_campaign_id || "camp-choice-1";
  const title = overrides.title || "Worker-Auswahl";
  const optionTitle = overrides.worker_description || overrides.request_title || `Option ${optionId}`;
  const clientOrgName = overrides.option_client_org_name || "Kunde A";
  const snapshot = {
    assignment_id: assignmentId,
    campaign_id: campaignId,
    title: optionTitle,
    role: optionTitle,
    client_org_name: clientOrgName,
    location_label: overrides.location_label || "Berlin",
    start_date: overrides.start_date || "2026-06-01",
    planned_end_date: overrides.planned_end_date || "2026-06-07",
    duration_label: overrides.duration_label || "01.06.2026 – 07.06.2026",
    pay_label: overrides.pay_label || "18,50 €/h",
    requested_quantity: overrides.requested_quantity ?? 1,
    filled_quantity: overrides.filled_quantity ?? 0,
    reserved_quantity: overrides.reserved_quantity ?? 0,
    open_quantity: overrides.open_quantity ?? 1
  };
  return {
    id: setId,
    worker_user_id: overrides.worker_user_id || "worker-choice-1",
    supplier_org_id: overrides.supplier_org_id || "sup-1",
    status: overrides.status || "options_presented",
    choice_mode: overrides.choice_mode || "preference_only",
    title,
    message: overrides.message || "Bitte wählen Sie Ihre bevorzugte Option.",
    response_deadline_at: overrides.response_deadline_at || "2026-05-10T10:00:00.000Z",
    worker_note: overrides.worker_note || null,
    manual_override_note: overrides.manual_override_note || null,
    final_assignment_id: overrides.final_assignment_id || null,
    final_link_id: overrides.final_link_id || null,
    final_choice_option_id: overrides.final_choice_option_id || null,
    presented_at: overrides.presented_at || "2026-05-01T08:00:00.000Z",
    viewed_at: overrides.viewed_at || null,
    responded_at: overrides.responded_at || null,
    manual_override_at: overrides.manual_override_at || null,
    assigned_at: overrides.assigned_at || null,
    declined_at: overrides.declined_at || null,
    expired_at: overrides.expired_at || null,
    cancelled_at: overrides.cancelled_at || null,
    created_by: overrides.created_by || "dispatcher-1",
    created_at: overrides.created_at || "2026-05-01T07:00:00.000Z",
    updated_at: overrides.updated_at || "2026-05-01T07:00:00.000Z",
    first_name: overrides.first_name || "Mia",
    last_name: overrides.last_name || "Choice",
    personnel_number: overrides.personnel_number || "WC-1001",
    worker_email: overrides.worker_email || "mia.choice@example.com",
    option_id: optionId,
    option_assignment_id: assignmentId,
    option_invite_id: inviteId,
    option_campaign_id: campaignId,
    option_order: overrides.option_order ?? 1,
    worker_response: overrides.worker_response || "pending",
    worker_rank: overrides.worker_rank ?? null,
    option_worker_note: overrides.option_worker_note || null,
    worker_responded_at: overrides.worker_responded_at || null,
    dispatcher_state: overrides.dispatcher_state || "pending",
    dispatcher_note: overrides.dispatcher_note || null,
    dispatcher_updated_at: overrides.dispatcher_updated_at || null,
    invite_status: overrides.invite_status || "viewed",
    expires_at: overrides.expires_at || "2026-05-10T10:00:00.000Z",
    request_snapshot: JSON.stringify(overrides.request_snapshot || snapshot),
    delivery_status: overrides.delivery_status || "delivered",
    last_worker_action_at: overrides.last_worker_action_at || null,
    worker_description: optionTitle,
    start_date: overrides.start_date || "2026-06-01",
    planned_end_date: overrides.planned_end_date || "2026-06-07",
    requested_quantity: overrides.requested_quantity ?? 1,
    filled_quantity: overrides.filled_quantity ?? 0,
    reserved_quantity: overrides.reserved_quantity ?? 0,
    open_quantity: overrides.open_quantity ?? 1,
    hourly_rate_cents: overrides.hourly_rate_cents ?? 1850,
    option_client_org_name: clientOrgName,
    option_campaign_name: overrides.option_campaign_name || "Choice Campaign",
    reservation_id: overrides.reservation_id || null,
    reservation_status: overrides.reservation_status || null,
    reservation_expires_at: overrides.reservation_expires_at || null,
    promoted_link_id: overrides.promoted_link_id || null
  };
}

function buildSuggestionWorker(overrides = {}) {
  return {
    user_id: "worker-1",
    first_name: "Anna",
    last_name: "Beispiel",
    personnel_number: "1001",
    city: "Berlin",
    skill_tags: ["lager", "kommissionierung"],
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

describe("assignment multi-staffing core", () => {
  it("createAssignment initializes staffing counters from requested quantity", async () => {
    let insertParams = null;
    const insertedAssignment = {
      id: "asg-1",
      requested_quantity: 4,
      worker_count: 4,
      filled_quantity: 0,
      reserved_quantity: 0,
      open_quantity: 4,
      staffing_status: "open"
    };
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("INSERT INTO assignments")) {
        insertParams = params;
        return { rows: [insertedAssignment], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createAssignment(pool, {
      org_id: "org-1",
      supplier_org_id: "sup-1",
      worker_description: "Lagerhelfer",
      requested_quantity: 4,
      start_date: "2026-05-01",
      created_by: "actor-1",
      status: "planned"
    });

    assert.equal(result.id, "asg-1");
    // Params nach Migration 112: [0]=org_id,[1]=req_id,[2]=supplier,[3]=deal,[4]=demand,[5]=offer,
    // [6]=contract,[7]=location_id,[8]=department_id,[9]=worker_desc,[10]=worker_count,[11]=req_qty,[12]=open_qty,[13]=staffing_status
    assert.equal(insertParams[10], 4, "worker_count should mirror requested quantity");
    assert.equal(insertParams[11], 4, "requested_quantity should be stored explicitly");
    assert.equal(insertParams[12], 4, "open_quantity should start with the full requested quantity");
    assert.equal(insertParams[13], "open", "planned multi-staffing assignments should start open");
  });

  it("updateAssignment keeps requested_quantity and worker_count synchronized", async () => {
    let captured = null;
    const pool = {
      query: async (sql, params) => {
        captured = { sql, params };
        return {
          rows: [{
            id: "asg-2",
            requested_quantity: 6,
            worker_count: 6,
            filled_quantity: 2,
            reserved_quantity: 1,
            open_quantity: 3
          }],
          rowCount: 1
        };
      }
    };

    const result = await updateAssignment(pool, "asg-2", { requested_quantity: 6 }, "actor-2");

    assert.equal(result.requested_quantity, 6);
    assert.equal(result.worker_count, 6);
    assert.match(captured.sql, /requested_quantity = \$2/);
    assert.match(captured.sql, /worker_count = \$3/);
    assert.match(captured.sql, /open_quantity = GREATEST\(\$2 - COALESCE\(filled_quantity, 0\) - COALESCE\(reserved_quantity, 0\), 0\)/);
    assert.deepStrictEqual(captured.params, ["asg-2", 6, 6]);
  });

  it("activateAgreement creates a slot-aware assignment linked to demand and offer", async () => {
    let assignmentInsertParams = null;
    const offerRow = {
      id: "offer-1",
      demand_request_id: "demand-1",
      requester_company_id: "buyer-user-1",
      supplier_company_id: "supplier-user-1",
      demand_role: "CNC-Fachkraft",
      demand_title: "CNC Nachtschicht",
      demand_start: "2026-06-01",
      demand_end: "2026-09-30",
      demand_headcount: 7,
      offered_quantity: 4,
      offered_hourly_rate: 27.5,
      start_confirmed: "2026-06-03",
      end_date: "2026-09-15",
      agreement_status: "confirmed",
      agreement_ref: "EV-2026-000123",
      assignment_id: null
    };
    const createdAssignment = {
      id: "asg-99",
      requested_quantity: 4,
      worker_count: 4,
      offer_id: "offer-1",
      demand_request_id: "demand-1"
    };
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM offers o") && sql.includes("JOIN demand_requests d")) {
        return { rows: [offerRow], rowCount: 1 };
      }
      if (sql === "SELECT org_id FROM users WHERE id = $1") {
        if (params[0] === "buyer-user-1") return { rows: [{ org_id: "buyer-org-1" }], rowCount: 1 };
        if (params[0] === "supplier-user-1") return { rows: [{ org_id: "supplier-org-1" }], rowCount: 1 };
      }
      if (sql.includes("FROM org_memberships om") && sql.includes("WHERE om.user_id = $1 AND om.org_id = $2")) {
        return {
          rows: [{
            user_id: params[0],
            org_id: params[1],
            role_key: "owner",
            is_active: true,
            org_name: params[1],
            org_type: "company",
            org_plan: "PLUS"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignments")) {
        assignmentInsertParams = params;
        return { rows: [createdAssignment], rowCount: 1 };
      }
      if (sql.includes("UPDATE offers SET") && sql.includes("agreement_status = 'activated'")) {
        return {
          rows: [{
            id: "offer-1",
            agreement_status: "activated",
            assignment_id: "asg-99"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO notifications")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await activateAgreement(pool, "offer-1", "actor-99");

    assert.equal(result.assignment.id, "asg-99");
    assert.equal(assignmentInsertParams[0], "buyer-org-1");
    assert.equal(assignmentInsertParams[2], "supplier-org-1");
    assert.equal(assignmentInsertParams[4], "demand-1");
    assert.equal(assignmentInsertParams[5], "offer-1");
    // Params nach Migration 112 (location_id/department_id an Index 7/8 → alles +2 verschoben)
    assert.equal(assignmentInsertParams[10], 4, "worker_count should use offered quantity");
    assert.equal(assignmentInsertParams[11], 4, "requested_quantity should use offered quantity");
    assert.equal(assignmentInsertParams[12], 4, "open_quantity should start fully open");
    assert.equal(assignmentInsertParams[16], 2750, "hourly rate should be converted to cents");
  });

  it("listOpenStaffingAssignments applies the caller limit to slot-aware open assignments", async () => {
    let captured = null;
    const rows = [{ assignment_id: "asg-open-1", open_quantity: 2 }];
    const pool = {
      query: async (sql, params) => {
        captured = { sql, params };
        return { rows, rowCount: rows.length };
      }
    };

    const result = await listOpenStaffingAssignments(pool, "sup-1", { limit: 7 });

    assert.equal(result.length, 1);
    assert.equal(captured.params[0], "sup-1");
    assert.equal(captured.params[1], 7);
    assert.match(captured.sql, /open_quantity/);
    assert.match(captured.sql, /LIMIT \$2/);
  });

  it("getAutoBackfillBatchSize scales with open quantity and stays capped", () => {
    assert.equal(getAutoBackfillBatchSize(1), 3);
    assert.equal(getAutoBackfillBatchSize(4), 12);
    assert.equal(getAutoBackfillBatchSize(12), 20);
    assert.equal(getAutoBackfillBatchSize(0), 3);
  });

  it("createStaffingCampaign persists auto-backfill metadata for bulk follow-up campaigns", async () => {
    let campaignInsertParams = null;
    let inviteInsertCount = 0;
    let waitlistUpsertCount = 0;
    const waitlistEntries = new Map();
    const assignment = buildStaffingAssignment({
      id: "asg-auto-1",
      requested_quantity: 2,
      worker_count: 2,
      open_quantity: 2
    });

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) {
        return { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM worker_assignment_links wal") && sql.includes("AS live_invite_quantity")) {
        return {
          rows: [{
            filled_quantity: 0,
            pending_quantity: 0,
            reservation_quantity: 0,
            live_invite_quantity: inviteInsertCount
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
      if (sql.includes("FROM worker_profiles wp")) {
        return {
          rows: [
            buildSuggestionWorker({
              user_id: "worker-1",
              first_name: "Anna",
              verified_doc_names: ["staplerschein"]
            }),
            buildSuggestionWorker({
              user_id: "worker-2",
              first_name: "Ben",
              last_name: "Beispiel",
              personnel_number: "1002",
              worker_longitude: 13.43,
              verified_doc_count: 0,
              same_client_assignment_count: 1,
              confirmed_assignment_count: 3
            })
          ],
          rowCount: 2
        };
      }
      if (sql.includes("UPDATE assignment_staffing_waitlist") && sql.includes("root_campaign_id IS NULL")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_waitlist")) {
        waitlistUpsertCount += 1;
        const row = {
          assignment_id: params[0],
          root_campaign_id: params[1],
          source_campaign_id: params[2],
          current_campaign_id: params[3],
          current_invite_id: params[4],
          worker_user_id: params[7],
          status: params[10],
          queue_rank: params[11]
        };
        waitlistEntries.set(row.worker_user_id, row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("SELECT COALESCE(MAX(queue_rank), 0)::INT AS max_rank")) {
        const maxRank = [...waitlistEntries.values()].reduce((max, entry) => Math.max(max, Number(entry.queue_rank || 0)), 0);
        return { rows: [{ max_rank: maxRank }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_campaigns")) {
        campaignInsertParams = params;
        return {
          rows: [{
            id: "camp-1",
            assignment_id: assignment.id,
            target_quantity: 2,
            promotion_mode: "auto_finalize",
            auto_backfill_enabled: true,
            source_campaign_id: "camp-root-1"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignment_staffing_invites")) {
        inviteInsertCount += 1;
        return {
          rows: [{
            id: `invite-${inviteInsertCount}`,
            assignment_id: assignment.id,
            campaign_id: "camp-1",
            worker_user_id: params[2]
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignment_staffing_events")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "camp-1",
            assignment_id: assignment.id,
            status: "active",
            completed_at: null
          }],
          rowCount: 1
        };
      }
      if (sql.includes("COUNT(*)::INT AS total_count") && sql.includes("FROM assignment_staffing_invites")) {
        return {
          rows: [{
            total_count: inviteInsertCount,
            viewed_count: 0,
            interested_count: 0,
            accepted_count: 0,
            declined_count: 0,
            expired_count: 0,
            cancelled_count: 0,
            live_count: inviteInsertCount
          }],
          rowCount: 1
        };
      }
      if (sql.includes("UPDATE assignment_staffing_campaigns") && sql.includes("SET status = $2")) {
        return {
          rows: [{
            id: "camp-1",
            assignment_id: assignment.id,
            status: "active",
            sent_count: inviteInsertCount,
            auto_backfill_enabled: true,
            source_campaign_id: "camp-root-1"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO notifications")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createStaffingCampaign(pool, {
      assignmentId: assignment.id,
      supplierOrgId: assignment.supplier_org_id,
      actorId: "actor-1",
      workerUserIds: ["worker-1", "worker-2"],
      autoBackfillEnabled: true,
      sourceCampaignId: "camp-root-1"
    });

    assert.equal(result.error, undefined);
    assert.equal(result.invites.length, 2);
    assert.equal(campaignInsertParams[8], true);
    assert.equal(campaignInsertParams[9], "camp-root-1");
    assert.ok(campaignInsertParams[10] instanceof Date);
    assert.equal(result.campaign.auto_backfill_enabled, true);
    assert.equal(result.campaign.source_campaign_id, "camp-root-1");
    assert.equal(result.root_campaign_id, "camp-root-1");
    assert.equal(waitlistUpsertCount, 2);
    assert.equal(result.queued_waitlist.length, 0);
  });

  it("createStaffingCampaign can address a 15-worker outreach wave on one demand", async () => {
    let inviteInsertCount = 0;
    const assignment = buildStaffingAssignment({
      id: "asg-bulk-15",
      requested_quantity: 3,
      worker_count: 3,
      open_quantity: 3
    });
    const workers = Array.from({ length: 15 }, (_entry, index) => buildSuggestionWorker({
      user_id: `worker-bulk-${index + 1}`,
      first_name: `Worker${index + 1}`,
      last_name: "Wave",
      personnel_number: String(2000 + index)
    }));

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) {
        return { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM worker_assignment_links wal") && sql.includes("AS live_invite_quantity")) {
        return {
          rows: [{
            filled_quantity: 0,
            pending_quantity: 0,
            reservation_quantity: 0,
            live_invite_quantity: inviteInsertCount
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
      if (sql.includes("FROM worker_profiles wp")) {
        return { rows: workers, rowCount: workers.length };
      }
      if (sql.includes("UPDATE assignment_staffing_waitlist") && sql.includes("root_campaign_id IS NULL")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_waitlist")) {
        return {
          rows: [{
            assignment_id: params[0],
            worker_user_id: params[7],
            status: params[10]
          }],
          rowCount: 1
        };
      }
      if (sql.includes("SELECT COALESCE(MAX(queue_rank), 0)::INT AS max_rank")) {
        return { rows: [{ max_rank: 0 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_campaigns")) {
        return {
          rows: [{
            id: "camp-bulk-15",
            assignment_id: assignment.id,
            target_quantity: 3,
            promotion_mode: "auto_finalize",
            auto_backfill_enabled: false,
            source_campaign_id: null
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignment_staffing_invites")) {
        inviteInsertCount += 1;
        return {
          rows: [{
            id: `invite-bulk-${inviteInsertCount}`,
            assignment_id: assignment.id,
            campaign_id: "camp-bulk-15",
            worker_user_id: params[2]
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignment_staffing_events")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "camp-bulk-15",
            assignment_id: assignment.id,
            status: "active",
            completed_at: null
          }],
          rowCount: 1
        };
      }
      if (sql.includes("COUNT(*)::INT AS total_count") && sql.includes("FROM assignment_staffing_invites")) {
        return {
          rows: [{
            total_count: inviteInsertCount,
            viewed_count: 0,
            interested_count: 0,
            accepted_count: 0,
            declined_count: 0,
            expired_count: 0,
            cancelled_count: 0,
            live_count: inviteInsertCount
          }],
          rowCount: 1
        };
      }
      if (sql.includes("UPDATE assignment_staffing_campaigns") && sql.includes("SET status = $2")) {
        return {
          rows: [{
            id: "camp-bulk-15",
            assignment_id: assignment.id,
            status: "active",
            sent_count: inviteInsertCount
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO audit_log") || sql.includes("INSERT INTO notifications")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createStaffingCampaign(pool, {
      assignmentId: assignment.id,
      supplierOrgId: assignment.supplier_org_id,
      actorId: "actor-bulk",
      workerUserIds: workers.map((worker) => worker.user_id),
      autoBackfillEnabled: false
    });

    assert.equal(result.error, undefined);
    assert.equal(result.invites.length, 15);
    assert.equal(inviteInsertCount, 15);
  });

  it("listAssignmentSuggestions separates hard matches, soft fits, and blocked workers", async () => {
    const assignment = buildStaffingAssignment({
      id: "asg-suggest-1",
      requested_quantity: 1,
      worker_count: 1,
      open_quantity: 1
    });
    const workerRows = [
      buildSuggestionWorker({
        user_id: "worker-hard",
        first_name: "Anna",
        last_name: "Alpha"
      }),
      buildSuggestionWorker({
        user_id: "worker-soft",
        first_name: "Berta",
        last_name: "Beta",
        skill_tags: ["lager"],
        profile_text: "Hilfskraft Tagschicht",
        same_client_assignment_count: 0,
        confirmed_assignment_count: 1,
        approved_submission_count: 1,
        customer_confirmed_submission_count: 0,
        posted_submission_count: 0
      }),
      buildSuggestionWorker({
        user_id: "worker-blocked",
        first_name: "Carla",
        last_name: "Gamma",
        conflict_count: 1,
        profile_text: "Lagerhelfer Frühschicht"
      })
    ];

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) {
        return { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM worker_profiles wp")) {
        return { rows: workerRows, rowCount: workerRows.length };
      }
      if (sql.includes("COUNT(*) FILTER (WHERE status = 'queued')::INT AS queued_count")) {
        return {
          rows: [{ queued_count: 0, invited_count: 0, reserved_count: 0, assigned_count: 0, removed_count: 0 }],
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

    const allSuggestions = await listAssignmentSuggestions(pool, assignment.id, assignment.supplier_org_id, {
      limit: 10,
      includeBlocked: true
    });
    assert.equal(allSuggestions.summary.hard_match_count, 1);
    assert.equal(allSuggestions.summary.soft_match_count, 1);
    assert.equal(allSuggestions.summary.blocked_count, 1);
    assert.equal(allSuggestions.suggestions[0].worker_user_id, "worker-hard");
    assert.equal(allSuggestions.suggestions[1].suggestion_status, "soft_match");
    assert.equal(allSuggestions.suggestions[2].suggestion_status, "blocked");
    assert.ok(allSuggestions.suggestions[0].factor_scores.some((entry) => entry.factor === "availabilityMatch"));
    assert.ok(allSuggestions.suggestions[1].missing_requirements.some((entry) => entry.code === "role"));
    assert.equal(allSuggestions.suggestions[2].hard_failures[0].code, "schedule_conflict");

    const hardOnly = await listAssignmentSuggestions(pool, assignment.id, assignment.supplier_org_id, {
      limit: 10,
      hardOnly: true
    });
    assert.equal(hardOnly.suggestions.length, 1);
    assert.equal(hardOnly.suggestions[0].worker_user_id, "worker-hard");
  });


  it("runAutoBackfill prioritizes queued waitlist workers before fresh rescoring", async () => {
    const assignment = buildStaffingAssignment({
      id: "asg-backfill-1",
      requested_quantity: 1,
      worker_count: 1,
      open_quantity: 1
    });
    const readinessRow = {
      assignment_id: assignment.id,
      org_id: assignment.org_id,
      supplier_org_id: assignment.supplier_org_id,
      worker_description: assignment.worker_description,
      start_date: assignment.start_date,
      planned_end_date: assignment.planned_end_date,
      open_quantity: 1,
      campaign_id: "camp-root-1",
      root_campaign_id: "camp-root-1",
      campaign_name: "Auto-Backfill",
      campaign_message: "Nachsteuerung",
      promotion_mode: "auto_finalize",
      reservation_window_minutes: 30,
      created_by: "actor-1",
      last_auto_backfill_at: null
    };
    const workerDirectory = new Map([
      ["worker-queued", buildSuggestionWorker({
        user_id: "worker-queued",
        first_name: "Queue",
        last_name: "First"
      })],
      ["worker-fresh", buildSuggestionWorker({
        user_id: "worker-fresh",
        first_name: "Fresh",
        last_name: "Second",
        same_client_assignment_count: 0,
        confirmed_assignment_count: 2
      })]
    ]);
    const waitlistEntries = new Map([
      ["worker-queued", {
        assignment_id: assignment.id,
        worker_user_id: "worker-queued",
        status: "queued",
        queue_rank: 1,
        root_campaign_id: "camp-root-1",
        created_at: "2026-05-01T10:00:00.000Z"
      }]
    ]);
    const invitedWorkerIds = [];

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("SELECT a.id AS assignment_id") && sql.includes("auto_backfill_enabled = TRUE")) {
        return { rows: [readinessRow], rowCount: 1 };
      }
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) {
        return { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM assignment_staffing_waitlist") && sql.includes("status = 'queued'")) {
        return {
          rows: [...waitlistEntries.values()].filter((entry) => entry.status === "queued"),
          rowCount: [...waitlistEntries.values()].filter((entry) => entry.status === "queued").length
        };
      }
      if (sql.includes("COUNT(*) FILTER (WHERE status = 'queued')::INT AS queued_count")) {
        return {
          rows: [{
            queued_count: [...waitlistEntries.values()].filter((entry) => entry.status === "queued").length,
            invited_count: [...waitlistEntries.values()].filter((entry) => entry.status === "invited").length,
            reserved_count: 0,
            assigned_count: 0,
            removed_count: [...waitlistEntries.values()].filter((entry) => entry.status === "removed").length
          }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM worker_profiles wp")) {
        const workerIds = Array.isArray(params[5]) ? params[5] : null;
        const rows = workerIds
          ? workerIds.map((workerId) => workerDirectory.get(workerId)).filter(Boolean)
          : [...workerDirectory.values()];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM worker_assignment_links wal") && sql.includes("AS live_invite_quantity")) {
        return {
          rows: [{
            filled_quantity: 0,
            pending_quantity: 0,
            reservation_quantity: 0,
            live_invite_quantity: invitedWorkerIds.length
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
      if (sql.includes("UPDATE assignment_staffing_waitlist") && sql.includes("root_campaign_id IS NULL")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT COALESCE(MAX(queue_rank), 0)::INT AS max_rank")) {
        const maxRank = [...waitlistEntries.values()].reduce((max, entry) => Math.max(max, Number(entry.queue_rank || 0)), 0);
        return { rows: [{ max_rank: maxRank }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_campaigns")) {
        return {
          rows: [{
            id: "camp-follow-up-1",
            assignment_id: assignment.id,
            target_quantity: 1,
            promotion_mode: "auto_finalize",
            auto_backfill_enabled: true,
            source_campaign_id: "camp-root-1"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignment_staffing_invites")) {
        invitedWorkerIds.push(params[2]);
        return {
          rows: [{
            id: `invite-${invitedWorkerIds.length}`,
            assignment_id: assignment.id,
            campaign_id: "camp-follow-up-1",
            worker_user_id: params[2]
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO assignment_staffing_waitlist")) {
        const workerId = params[7];
        const existing = waitlistEntries.get(workerId) || {};
        const next = {
          ...existing,
          assignment_id: params[0],
          worker_user_id: workerId,
          root_campaign_id: existing.root_campaign_id || params[1],
          status: params[10],
          queue_rank: existing.queue_rank || params[11],
          current_invite_id: params[4] || existing.current_invite_id || null
        };
        waitlistEntries.set(workerId, next);
        return { rows: [next], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_events")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM assignment_staffing_campaigns") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "camp-follow-up-1",
            assignment_id: assignment.id,
            status: "active",
            completed_at: null
          }],
          rowCount: 1
        };
      }
      if (sql.includes("COUNT(*)::INT AS total_count") && sql.includes("FROM assignment_staffing_invites")) {
        return {
          rows: [{
            total_count: invitedWorkerIds.length,
            viewed_count: 0,
            interested_count: 0,
            accepted_count: 0,
            declined_count: 0,
            expired_count: 0,
            cancelled_count: 0,
            live_count: invitedWorkerIds.length
          }],
          rowCount: 1
        };
      }
      if (sql.includes("UPDATE assignment_staffing_campaigns") && sql.includes("SET status = $2")) {
        return {
          rows: [{
            id: "camp-follow-up-1",
            assignment_id: assignment.id,
            status: "active",
            sent_count: invitedWorkerIds.length,
            auto_backfill_enabled: true,
            source_campaign_id: "camp-root-1"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO notifications") || sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await runAutoBackfill(pool, { limit: 1, cooldownMinutes: 5 });

    assert.equal(result.assignments_backfilled, 1);
    assert.equal(result.invited_workers, 2);
    assert.deepEqual(invitedWorkerIds, ["worker-queued", "worker-fresh"]);
    assert.equal(waitlistEntries.get("worker-queued")?.status, "invited");
  });

  it("respondToStaffingInvite blocks acceptances that conflict with active reservations", async () => {
    const assignment = buildStaffingAssignment({
      id: "asg-conflict-1",
      requested_quantity: 1,
      worker_count: 1,
      open_quantity: 1
    });

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("SELECT i.*, c.promotion_mode")) {
        return {
          rows: [{
            id: "invite-conflict-1",
            assignment_id: assignment.id,
            campaign_id: "camp-conflict-1",
            supplier_org_id: assignment.supplier_org_id,
            worker_user_id: "worker-conflict-1",
            status: "viewed",
            expires_at: null,
            reservation_window_minutes: 30,
            promotion_mode: "auto_finalize",
            campaign_created_by: "dispatcher-1",
            source_campaign_id: "camp-root-1",
            first_name: "Konflikt",
            last_name: "Worker",
            email: "konflikt@example.com"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM assignments a") && sql.includes("LEFT JOIN organizations buyer")) {
        return { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM worker_assignment_links wal") && sql.includes("AS live_invite_quantity")) {
        return {
          rows: [{
            filled_quantity: 0,
            pending_quantity: 0,
            reservation_quantity: 0,
            live_invite_quantity: 1
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
      if (sql.includes("SELECT 'assignment'::TEXT AS conflict_type")) {
        return {
          rows: [{
            conflict_type: "reservation",
            conflict_id: "res-1",
            assignment_id: "asg-other-1",
            title: "Parallelreservierung",
            start_date: "2026-06-10",
            planned_end_date: "2026-06-12",
            status: "reserved"
          }],
          rowCount: 1
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await respondToStaffingInvite(pool, {
      inviteId: "invite-conflict-1",
      workerUserId: "worker-conflict-1",
      action: "accept"
    });

    assert.equal(result.error, "SCHEDULE_CONFLICT");
    assert.deepEqual(result.conflicting_reservation_ids, ["res-1"]);
    assert.deepEqual(result.conflicting_link_ids, []);
  });

  it("listWorkerStaffingRequests keeps active choice-set invites out of the standalone worker queue", async () => {
    let capturedSql = "";
    const requestSnapshot = JSON.stringify({
      title: "Einzelanfrage Lager",
      role: "Lager",
      client_org_name: "Kunde A",
      location_label: "Berlin",
      start_date: "2026-06-01",
      planned_end_date: "2026-06-03",
      duration_label: "01.06.2026 – 03.06.2026",
      pay_label: "18,50 €/h",
      requested_quantity: 1,
      filled_quantity: 0,
      reserved_quantity: 0,
      open_quantity: 1
    });
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignment_staffing_invites i") && sql.includes("LEFT JOIN assignment_staffing_choice_options cso")) {
        capturedSql = sql;
        return {
          rows: [{
            id: "invite-standalone-1",
            assignment_id: "asg-standalone-1",
            campaign_id: "camp-standalone-1",
            worker_user_id: "worker-standalone-1",
            status: "viewed",
            score: 82,
            score_reasons: JSON.stringify({}),
            personal_message: null,
            sent_at: "2026-05-01T08:00:00.000Z",
            viewed_at: "2026-05-01T09:00:00.000Z",
            responded_at: null,
            accepted_at: null,
            declined_at: null,
            response_note: null,
            expires_at: null,
            created_at: "2026-05-01T08:00:00.000Z",
            request_snapshot: requestSnapshot,
            delivery_status: "delivered",
            delivery_attempt_count: 1,
            delivery_last_attempt_at: "2026-05-01T08:00:00.000Z",
            delivery_last_success_at: "2026-05-01T08:00:00.000Z",
            delivery_last_error: null,
            remind_after: null,
            reminder_requested_at: null,
            last_reminder_sent_at: null,
            reminder_count: 0,
            last_worker_action_at: "2026-05-01T09:00:00.000Z",
            choice_set_id: null,
            choice_option_id: null,
            choice_mode: null,
            choice_set_status: null,
            worker_description: "Einzelanfrage Lager",
            start_date: "2026-06-01",
            planned_end_date: "2026-06-03",
            requested_quantity: 1,
            filled_quantity: 0,
            reserved_quantity: 0,
            hourly_rate_cents: 1850,
            open_quantity: 1,
            staffing_status: "open",
            campaign_name: "Standalone Campaign",
            promotion_mode: "manual_review",
            root_campaign_id: "camp-root-1",
            client_org_name: "Kunde A",
            request_title: "Einzelanfrage Lager",
            request_role: "Lager",
            location_city: "Berlin"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("WITH latest_messages AS")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT 'assignment'::TEXT AS conflict_type")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await listWorkerStaffingRequests(pool, "worker-standalone-1", { limit: 10, markViewed: false });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, "invite-standalone-1");
    assert.match(capturedSql, /cso\.id IS NULL/);
    assert.match(capturedSql, /cs\.status IN \('assigned','declined','expired','cancelled'\)/);
  });

  it("listWorkerStaffingChoiceSets groups multiple active options into one worker-facing choice set", async () => {
    const groupedRows = [
      buildChoiceSetRow({
        id: "choice-set-grouped-1",
        choice_mode: "ranked_choice",
        option_id: "choice-opt-a",
        option_assignment_id: "asg-choice-a",
        option_invite_id: "invite-choice-a",
        option_campaign_id: "camp-choice-a",
        option_order: 1,
        worker_description: "Frühschicht Lager",
        option_client_org_name: "Kunde A"
      }),
      buildChoiceSetRow({
        id: "choice-set-grouped-1",
        choice_mode: "ranked_choice",
        option_id: "choice-opt-b",
        option_assignment_id: "asg-choice-b",
        option_invite_id: "invite-choice-b",
        option_campaign_id: "camp-choice-b",
        option_order: 2,
        worker_description: "Spätschicht Produktion",
        option_client_org_name: "Kunde B"
      })
    ];
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("SELECT DISTINCT cs.id") && sql.includes("FROM assignment_staffing_choice_sets cs")) {
        return {
          rows: [{ id: "choice-set-grouped-1", sort_at: "2026-05-01T08:00:00.000Z" }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("JOIN assignment_staffing_choice_options opt")) {
        assert.deepEqual(params[0], ["choice-set-grouped-1"]);
        return { rows: groupedRows, rowCount: groupedRows.length };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await listWorkerStaffingChoiceSets(pool, "worker-choice-1", { limit: 5, markViewed: false });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, "choice-set-grouped-1");
    assert.equal(result[0].mode_label, "Priorisierte Auswahl");
    assert.equal(result[0].options.length, 2);
    assert.equal(result[0].summary.active_option_count, 2);
    assert.equal(result[0].worker.email, "mia.choice@example.com");
  });

  it("submitStaffingChoicePreferences stores preferred and acceptable options without breaking the invite core", async () => {
    const currentRows = [
      buildChoiceSetRow({
        id: "choice-set-pref-1",
        choice_mode: "preference_only",
        option_id: "choice-opt-pref-a",
        option_assignment_id: "asg-pref-a",
        option_invite_id: "invite-pref-a",
        option_campaign_id: "camp-pref-a",
        option_order: 1,
        worker_description: "Lager Frühschicht"
      }),
      buildChoiceSetRow({
        id: "choice-set-pref-1",
        choice_mode: "preference_only",
        option_id: "choice-opt-pref-b",
        option_assignment_id: "asg-pref-b",
        option_invite_id: "invite-pref-b",
        option_campaign_id: "camp-pref-b",
        option_order: 2,
        worker_description: "Produktion Spätschicht"
      })
    ];
    let notificationCount = 0;
    const writtenEvents = [];
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("JOIN assignment_staffing_choice_options opt")) {
        return { rows: currentRows, rowCount: currentRows.length };
      }
      if (sql.includes("UPDATE assignment_staffing_choice_options")) {
        const row = currentRows.find((entry) => entry.option_id === params[0]);
        row.worker_response = params[1];
        row.worker_rank = null;
        row.option_worker_note = params[2];
        if (params[1] !== "pending") row.worker_responded_at = "2026-05-02T10:00:00.000Z";
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE assignment_staffing_choice_sets") && sql.includes("SET status = 'preference_submitted'")) {
        currentRows.forEach((row) => {
          row.status = "preference_submitted";
          row.worker_note = params[1];
          row.responded_at = "2026-05-02T10:00:00.000Z";
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_events")) {
        writtenEvents.push(params[7]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO notifications")) {
        notificationCount += 1;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await submitStaffingChoicePreferences(pool, {
      choiceSetId: "choice-set-pref-1",
      workerUserId: "worker-choice-1",
      primaryOptionId: "choice-opt-pref-a",
      acceptableOptionIds: ["choice-opt-pref-b"],
      note: "Frühschicht passt besser zu meiner Betreuung."
    });

    assert.equal(result.error, undefined);
    assert.equal(result.status, "preference_submitted");
    assert.equal(result.summary.primary_option_id, "choice-opt-pref-a");
    assert.equal(result.options.find((entry) => entry.id === "choice-opt-pref-a")?.worker_response, "preferred");
    assert.equal(result.options.find((entry) => entry.id === "choice-opt-pref-b")?.worker_response, "acceptable");
    assert.deepEqual(writtenEvents, ["choice_preference_submitted", "choice_preference_submitted"]);
    assert.equal(notificationCount, 1);
  });

  it("submitStaffingChoiceRanking stores an ordered worker ranking for ranked choice sets", async () => {
    const currentRows = [
      buildChoiceSetRow({
        id: "choice-set-rank-1",
        choice_mode: "ranked_choice",
        option_id: "choice-opt-rank-a",
        option_assignment_id: "asg-rank-a",
        option_invite_id: "invite-rank-a",
        option_campaign_id: "camp-rank-a",
        option_order: 1,
        worker_description: "Lager Frühschicht"
      }),
      buildChoiceSetRow({
        id: "choice-set-rank-1",
        choice_mode: "ranked_choice",
        option_id: "choice-opt-rank-b",
        option_assignment_id: "asg-rank-b",
        option_invite_id: "invite-rank-b",
        option_campaign_id: "camp-rank-b",
        option_order: 2,
        worker_description: "Produktion Spätschicht"
      }),
      buildChoiceSetRow({
        id: "choice-set-rank-1",
        choice_mode: "ranked_choice",
        option_id: "choice-opt-rank-c",
        option_assignment_id: "asg-rank-c",
        option_invite_id: "invite-rank-c",
        option_campaign_id: "camp-rank-c",
        option_order: 3,
        worker_description: "Kommissionierung Nacht"
      })
    ];
    let notificationCount = 0;
    const writtenEvents = [];
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignment_staffing_choice_sets cs") && sql.includes("JOIN assignment_staffing_choice_options opt")) {
        return { rows: currentRows, rowCount: currentRows.length };
      }
      if (sql.includes("UPDATE assignment_staffing_choice_options")) {
        const row = currentRows.find((entry) => entry.option_id === params[0]);
        row.worker_response = params[1];
        row.worker_rank = params[2];
        if (params[2] === 1) row.option_worker_note = params[3];
        if (params[1] !== "pending") row.worker_responded_at = "2026-05-03T09:00:00.000Z";
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE assignment_staffing_choice_sets") && sql.includes("SET status = 'preference_ranked'")) {
        currentRows.forEach((row) => {
          row.status = "preference_ranked";
          row.worker_note = params[1];
          row.responded_at = "2026-05-03T09:00:00.000Z";
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_events")) {
        writtenEvents.push(params[7]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO notifications")) {
        notificationCount += 1;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await submitStaffingChoiceRanking(pool, {
      choiceSetId: "choice-set-rank-1",
      workerUserId: "worker-choice-1",
      rankedOptionIds: ["choice-opt-rank-b", "choice-opt-rank-a"],
      note: "B ist mein Wunsch, A wäre Plan B."
    });

    assert.equal(result.error, undefined);
    assert.equal(result.status, "preference_ranked");
    assert.equal(result.options.find((entry) => entry.id === "choice-opt-rank-b")?.worker_rank, 1);
    assert.equal(result.options.find((entry) => entry.id === "choice-opt-rank-a")?.worker_rank, 2);
    assert.equal(result.options.find((entry) => entry.id === "choice-opt-rank-c")?.worker_rank, null);
    assert.deepEqual(writtenEvents, ["choice_ranking_submitted", "choice_ranking_submitted"]);
    assert.equal(notificationCount, 1);
  });

  it("runStaffingMaintenance returns a combined no-op summary when nothing is due", async () => {
    let maintenanceQueryParams = null;
    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignment_staffing_invites") && sql.includes("expires_at <= NOW()")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM assignment_staffing_invites") && sql.includes("remind_after <= NOW()")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM assignment_staffing_reservations") && sql.includes("expires_at <= NOW()")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT a.id AS assignment_id") && sql.includes("auto_backfill_enabled = TRUE")) {
        maintenanceQueryParams = params;
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await runStaffingMaintenance(pool, { limit: 9, cooldownMinutes: 33 });

    assert.deepEqual(result, {
      expired_invites: 0,
      expired_reservations: 0,
      reminders_queued: 0,
      assignments_considered: 0,
      assignments_backfilled: 0,
      campaigns_created: 0,
      invited_workers: 0,
      skipped_no_candidates: 0
    });
    assert.deepEqual(maintenanceQueryParams, [33, 9]);
  });

  it("dispatchDueStaffingReminders queues and delivers due worker reminders once", async () => {
    let notificationCount = 0;
    let reminderMessageCount = 0;
    let queuedEventCount = 0;
    let deliveredEventCount = 0;

    const pool = createTransactionalPool(async (sql, params) => {
      if (sql.includes("FROM assignment_staffing_invites") && sql.includes("remind_after <= NOW()")) {
        return { rows: [{ id: "invite-rem-1" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE assignment_staffing_invites") && sql.includes("SET delivery_status = 'queued'")) {
        return {
          rows: [{
            id: "invite-rem-1",
            assignment_id: "asg-1",
            campaign_id: "camp-1",
            worker_user_id: "worker-1"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("SELECT i.*, c.name AS campaign_name")) {
        return {
          rows: [{
            id: "invite-rem-1",
            assignment_id: "asg-1",
            campaign_id: "camp-1",
            worker_user_id: "worker-1",
            status: "viewed",
            remind_after: "2026-01-01T10:00:00.000Z",
            request_snapshot: JSON.stringify({
              title: "Lagerhelfer Nachtschicht",
              client_org_name: "Kunde A",
              response_deadline_label: "02.06.2026, 10:00"
            }),
            worker_description: "Lagerhelfer Nachtschicht",
            open_quantity: 1,
            client_org_name: "Kunde A"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("INSERT INTO notifications")) {
        notificationCount += 1;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE assignment_staffing_invites") && sql.includes("delivery_attempt_count = delivery_attempt_count + 1")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_messages")) {
        reminderMessageCount += 1;
        return { rows: [{ id: "msg-1" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO assignment_staffing_events")) {
        if (String(params[7]) === "invite_delivery_queued") queuedEventCount += 1;
        if (String(params[7]) === "invite_reminder_sent") deliveredEventCount += 1;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await dispatchDueStaffingReminders(pool, { limit: 5 });

    // dispatchDueStaffingReminders always: marks invite as 'queued' + fires the queued event
    assert.deepEqual(result, { reminders_queued: 1 });
    assert.equal(queuedEventCount, 1, "invite_delivery_queued event must fire regardless of Redis");
    // When Redis is available (Docker): delivery is deferred to BullMQ job → no inline delivery
    // When Redis is unavailable (local/CI): inline delivery fires notification + message + delivered event
    // We don't assert the inline-delivery counts here because behavior depends on Redis availability.
    // The delivery path is covered by processStaffingDeliveryJob tests.
  });
});

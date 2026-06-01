import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerNotificationService.js";

describe("workerNotificationService", () => {
  it("falls back to general when notifications_type_check rejects custom type", async () => {
    const calls = [];
    let first = true;

    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (first) {
          first = false;
          const err = new Error("check violation");
          err.constraint = "notifications_type_check";
          throw err;
        }
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifySubmissionCorrectionRequested(
      pool,
      "worker-1",
      "11111111-1111-1111-1111-111111111111",
      "Bitte nachtragen"
    );

    assert.equal(calls.length, 2, "Expected retry with fallback type");
    assert.equal(calls[0].params[1], "worker_submission_correction_requested");
    assert.equal(calls[1].params[1], "general");
    assert.match(String(calls[1].params[3] || ""), /\[worker_submission_correction_requested\]/);
  });

  it("creates worker document notifications with profile deep links", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifyWorkerDocumentVerified(pool, "worker-1", "doc-1", "Staplerschein");
    await svc.notifyWorkerDocumentExpiring(pool, "worker-1", "doc-2", "Aufenthaltstitel", "2026-04-10", 5);
    await svc.notifyWorkerDocumentExpired(pool, "worker-1", "doc-3", "Ausweis", "2026-04-01");

    assert.equal(calls.length, 3);
    assert.equal(calls[0].params[1], "worker_document_verified");
    assert.equal(calls[0].params[7], "/public/einsatzportal-profil.html#documents");
    assert.equal(calls[1].params[1], "worker_document_expiring");
    assert.match(String(calls[1].params[3] || ""), /5 Tagen/);
    assert.equal(calls[2].params[1], "worker_document_expired");
    assert.match(String(calls[2].params[3] || ""), /01\.04\.2026/);
  });

  it("creates staffing request notifications with portal deep links", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifyStaffingRequestNew(pool, "worker-2", "invite-1", {
      title: "Lagerhelfer Nachtschicht",
      clientName: "Nordbau GmbH",
      openQuantity: 3
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].params[1], "worker_staffing_request_new");
    assert.match(String(calls[0].params[3] || ""), /Lagerhelfer Nachtschicht/);
    assert.match(String(calls[0].params[3] || ""), /Nordbau GmbH/);
    assert.match(String(calls[0].params[3] || ""), /Noch offen: 3/);
    assert.equal(calls[0].params[4], "assignment_staffing_invite");
    assert.equal(calls[0].params[5], "invite-1");
    assert.equal(calls[0].params[7], "/public/einsatzportal-benachrichtigungen.html");
  });

  it("creates staffing reminder and dispatcher question notifications", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifyStaffingRequestReminder(pool, "worker-3", "invite-2", {
      title: "CNC Nachtschicht",
      deadlineLabel: "02.06.2026, 10:00"
    });
    await svc.notifyStaffingQuestionToDispatcher(pool, "dispatcher-1", "invite-2", "Anna Beispiel", "Gibt es eine Schichtzulage?");

    assert.equal(calls.length, 2);
    assert.equal(calls[0].params[1], "worker_staffing_request_reminder");
    assert.match(String(calls[0].params[3] || ""), /CNC Nachtschicht/);
    assert.match(String(calls[0].params[3] || ""), /02\.06\.2026/);
    assert.equal(calls[0].params[7], "/public/einsatzportal-benachrichtigungen.html");
    assert.equal(calls[1].params[1], "worker_staffing_request_question");
    assert.match(String(calls[1].params[3] || ""), /Anna Beispiel/);
    assert.match(String(calls[1].params[3] || ""), /Schichtzulage/);
    assert.equal(calls[1].params[7], "/public/worker-submissions-review.html");
  });
});


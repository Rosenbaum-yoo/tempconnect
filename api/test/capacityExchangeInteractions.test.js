import { describe, it } from "node:test";
import assert from "node:assert";
import { createInteraction, createDemandInteraction } from "../services/capacityExchangeService.js";

describe("capacityExchangeService interactions", () => {
  it("stores structured interaction message for qualified modal flows", async () => {
    let capturedParams = null;
    let capturedSql = null;
    const mockPool = {
      query: async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return {
          rows: [{
            id: "interaction-1",
            capacity_post_id: params[0],
            company_user_id: params[1],
            interaction_type: params[2],
            message: params[3],
            requisition_id: params[4] || null
          }]
        };
      }
    };

    const msg = "[TC-Interaction]\nTyp: Angebotsanfrage\nStart: 2026-03-30\nUmfang: 8";
    const row = await createInteraction(mockPool, "entry-1", "company-1", {
      interaction_type: "offer_request",
      message: msg,
      requisition_id: null
    });

    assert.ok(row);
    assert.strictEqual(row.interaction_type, "offer_request");
    assert.strictEqual(row.message, msg);
    assert.strictEqual(capturedParams[3], msg);
    assert.match(capturedSql, /WHERE NOT EXISTS/i);
  });

  it("stores structured interaction for demand requests", async () => {
    let capturedParams = null;
    let capturedSql = null;
    const mockPool = {
      query: async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return {
          rows: [{
            id: "interaction-2",
            capacity_post_id: null,
            demand_request_id: params[0],
            company_user_id: params[1],
            interaction_type: params[2],
            message: params[3]
          }]
        };
      }
    };

    const msg = "[TC-Interaction]\nTyp: Interesse\nFlow: Nachfrage";
    const row = await createDemandInteraction(mockPool, "demand-1", "agency-1", {
      interaction_type: "interest",
      message: msg,
      requisition_id: null
    });

    assert.ok(row);
    assert.strictEqual(row.demand_request_id, "demand-1");
    assert.strictEqual(row.interaction_type, "interest");
    assert.strictEqual(capturedParams[3], msg);
    assert.match(capturedSql, /demand_request_id/i);
    assert.match(capturedSql, /WHERE NOT EXISTS/i);
  });
});


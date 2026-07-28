import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  createPool,
  cleanupUser,
  getCsrf,
  registerAndLoginWithPlan,
  registerAndLoginAgency
} from "./helpers.js";

describe("Offers — counterparty-first flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let requester;
  let supplier;
  let demandId;
  let offerId;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    requester = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "company",
      company_name: "E2E Requester GmbH"
    });
    createdEmails.push(requester.email);

    // Agency registration helper does not set plan; ensure PLUS for SLA access.
    supplier = await registerAndLoginAgency({ company_name: "E2E Supplier GmbH" });
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status)
       VALUES ($1, 'PLUS', 'active')
       ON CONFLICT (user_id) DO UPDATE SET plan = 'PLUS', status = 'active', updated_at = NOW()`,
      [supplier.user.id]
    ).catch(async () => {
      await pool.query(
        "UPDATE subscriptions SET plan = 'PLUS', status = 'active', updated_at = NOW() WHERE user_id = $1",
        [supplier.user.id]
      ).catch(() => {});
    });
    createdEmails.push(supplier.email);
  });

  after(async () => {
    if (!pool) return;
    // Best-effort cleanup of marketplace rows first
    try {
      if (offerId) await pool.query("DELETE FROM offers WHERE id = $1", [offerId]).catch(() => {});
      if (demandId) await pool.query("DELETE FROM demand_requests WHERE id = $1", [demandId]).catch(() => {});
    } catch {
      // ignore
    }
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  it("prioritizes action_required for the counterparty and enforces actor guards", async () => {
    // requester creates demand
    const reqCsrf = await getCsrf(requester.agent);
    const dRes = await requester.agent
      .post("/api/marketplace/demand-requests")
      .set("x-csrf-token", reqCsrf)
      .send({
        title: "Staplerfahrer Bedarf",
        role: "Staplerfahrer",
        start_date: "2026-03-30",
        end_date: "2026-04-03",
        location_city: "Berlin",
        urgency: "normal",
        headcount: 1
      })
      .expect(201);
    demandId = dRes.body?.id;
    assert.ok(demandId, "demand id must be returned");

    // supplier creates offer (draft)
    const supCsrf = await getCsrf(supplier.agent);
    const oRes = await supplier.agent
      .post(`/api/marketplace/demand-requests/${demandId}/offers`)
      .set("x-csrf-token", supCsrf)
      .send({
        offered_quantity: 1,
        offered_hourly_rate: 28.5,
        start_confirmed: "2026-03-30",
        end_date: "2026-04-03",
        price_type: "hourly"
      })
      .expect(201);
    offerId = oRes.body?.id;
    assert.ok(offerId, "offer id must be returned");

    // Supplier sends offer
    const supCsrf2 = await getCsrf(supplier.agent);
    await supplier.agent
      .patch(`/api/marketplace/offers/${offerId}/status`)
      .set("x-csrf-token", supCsrf2)
      .send({ status: "sent" })
      .expect(200);

    // Requester sees it as action_required in received-offers
    const inbox = await requester.agent.get("/api/marketplace/received-offers").expect(200);
    const items = inbox.body?.data?.items || [];
    const row = items.find((x) => x.id === offerId);
    assert.ok(row, "offer must be present in requester inbox");
    assert.strictEqual(row.next_action?.viewer_state, "action_required");
    assert.ok(Array.isArray(row.next_action?.actions), "next_action.actions must be array");
    assert.ok(row.next_action.actions.includes("accept"));
    assert.ok(row.next_action.actions.includes("reject"));
    assert.ok(row.next_action.actions.includes("counter"));

    // Guard: supplier cannot accept
    const supCsrf3 = await getCsrf(supplier.agent);
    await supplier.agent
      .post(`/api/marketplace/offers/${offerId}/accept`)
      .set("x-csrf-token", supCsrf3)
      .send({})
      .expect(403);

    // Requester counters → supplier must become action_required
    const reqCsrf2 = await getCsrf(requester.agent);
    await requester.agent
      .post(`/api/marketplace/offers/${offerId}/counter`)
      .set("x-csrf-token", reqCsrf2)
      .send({ notes: "Bitte 27 EUR möglich?" })
      .expect(200);

    const sentList = await supplier.agent.get("/api/marketplace/my-offers").expect(200);
    const sItems = sentList.body?.data?.items || [];
    const sRow = sItems.find((x) => x.id === offerId);
    assert.ok(sRow, "offer must be present in supplier my-offers");
    assert.strictEqual(sRow.next_action?.viewer_state, "action_required");
    assert.ok(sRow.next_action.actions.includes("send"));

    // Supplier re-sends (countered -> sent)
    const supCsrf4 = await getCsrf(supplier.agent);
    await supplier.agent
      .patch(`/api/marketplace/offers/${offerId}/status`)
      .set("x-csrf-token", supCsrf4)
      .send({ status: "sent" })
      .expect(200);

    // Requester accepts via dedicated endpoint
    const reqCsrf3 = await getCsrf(requester.agent);
    const acc = await requester.agent
      .post(`/api/marketplace/offers/${offerId}/accept`)
      .set("x-csrf-token", reqCsrf3)
      .send({})
      .expect(200);
    // `offer_status` statt `status`: letzteres traegt aus historischen Gruenden den
    // Status der ANFRAGE ('fulfilled' o. ae.) und war damit nie der Angebotsstatus,
    // den dieser Test meint.
    assert.ok(acc.body, "Antwort muss einen Koerper haben");
    assert.strictEqual(acc.body.offer_status, "accepted", `Angebot muss angenommen sein: ${JSON.stringify(acc.body)}`);
    assert.strictEqual(acc.body.offer?.status, "accepted", "Auch das eingebettete Angebot traegt den Status");
    assert.ok(acc.body.demand_status, "Der Anfragestatus wird getrennt ausgewiesen");
  });
});


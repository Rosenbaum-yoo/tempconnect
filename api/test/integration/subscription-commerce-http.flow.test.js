/**
 * Subscription / Pricing / Enterprise / SCC HTTP Roundtrip Tests.
 *
 * Mounts the real Express app via createApp() and exercises cookies, CSRF,
 * customer auth, public routes and the separated Staff Control Center session.
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  hasDb,
  makeAgent,
  getCsrf,
  registerAndLogin,
  uniqueEmail,
  createPool,
  cleanupUser,
  ensureSubscription,
  getUserOrgId
} from "./helpers.js";
import { generateDocument } from "../../services/subscriptionDocumentService.js";

describe("Subscription Commercial HTTP Roundtrip", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  const enterpriseEmails = [];
  const orgIds = [];
  const requestIds = [];
  const documentIds = [];
  const staffUserIds = [];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
  });

  after(async () => {
    await cleanupCommercialArtifacts();
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool?.end();
  });

  it("serves the public catalog without auth and blocks public writes without CSRF", async () => {
    const agent = await makeAgent();

    const catalog = await agent.get("/api/public/catalog").expect(200);
    assert.ok(catalog.headers["cache-control"]?.includes("max-age=300"));
    assert.ok(catalog.headers.etag?.includes("catalog-"));
    assert.ok(Array.isArray(catalog.body.plans), "catalog contains plans");
    assert.ok(catalog.body.plans.some((plan) => plan.key === "INDIVIDUELL"));

    const noCsrf = await agent
      .post("/api/enterprise-request")
      .send(validEnterprisePayload(uniqueEmail()));
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error, "CSRF_INVALID");
  });

  it("creates a public enterprise request with cost-preview document and public download", async () => {
    const agent = await makeAgent();
    const csrf = await getCsrf(agent);
    const email = uniqueEmail();
    enterpriseEmails.push(email);

    const res = await agent
      .post("/api/enterprise-request")
      .set("x-csrf-token", csrf)
      .set("User-Agent", "subscription-commerce-http-test")
      .send(validEnterprisePayload(email));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id, "enterprise request id returned");

    const preview = res.body.data.cost_preview_document;
    assert.ok(preview?.id, "cost preview document id returned");
    assert.match(preview.download_url, /^\/api\/subscription-documents\/[^/]+\/public-download$/);
    documentIds.push(preview.id);

    const download = await agent.get(preview.download_url).expect(200);
    assert.match(download.headers["content-type"], /text\/html|application\/pdf/);
    assert.ok(download.text?.includes("TempConnect") || Buffer.isBuffer(download.body));
  });

  it("keeps customer cookies, enforces CSRF and covers upgrade + mine routes", async () => {
    const { agent, csrfToken, email, user } = await registerAndLogin({
      company_name: "HTTP Roundtrip Upgrade GmbH",
      plan: "PLUS"
    });
    createdEmails.push(email);
    await rememberOrg(user.id);
    await ensureSubscription(pool, user.id, "PLUS");

    await agent.get("/api/me").expect(200);

    const anonymous = await makeAgent();
    await anonymous.get("/api/me").expect(401);
    await anonymous.get("/api/subscription-requests/mine").expect(401);

    const noCsrf = await agent
      .post("/api/subscription-requests/upgrade")
      .send({ desired_plan: "PRO" });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error, "CSRF_INVALID");

    const upgrade = await agent
      .post("/api/subscription-requests/upgrade")
      .set("x-csrf-token", csrfToken)
      .set("Idempotency-Key", `it-upgrade-${Date.now()}`)
      .send({ desired_plan: "PRO", message: "HTTP Roundtrip Upgrade" });

    assert.equal(upgrade.status, 201, JSON.stringify(upgrade.body));
    assert.equal(upgrade.body.data.request_type, "upgrade");
    assert.equal(upgrade.body.data.status, "submitted");
    requestIds.push(upgrade.body.data.id);

    const mine = await agent.get("/api/subscription-requests/mine").expect(200);
    assert.ok(Array.isArray(mine.body.data.items));
    assert.ok(mine.body.data.items.some((item) => item.id === upgrade.body.data.id));

    const duplicate = await agent
      .post("/api/subscription-requests/upgrade")
      .set("x-csrf-token", await getCsrf(agent))
      .send({ desired_plan: "PRO" });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "DUPLICATE_OPEN_REQUEST");
  });

  it("covers downgrade, cancellation and org-bound subscription documents via HTTP", async () => {
    const { agent, csrfToken, email, user } = await registerAndLogin({
      company_name: "HTTP Roundtrip Docs GmbH",
      plan: "PRO"
    });
    createdEmails.push(email);
    const orgId = await rememberOrg(user.id);
    await ensureSubscription(pool, user.id, "PRO");

    const downgrade = await agent
      .post("/api/subscription-requests/downgrade")
      .set("x-csrf-token", csrfToken)
      .send({
        desired_plan: "PLUS",
        acknowledge_impact: true,
        message: "HTTP Roundtrip Downgrade"
      });
    assert.equal(downgrade.status, 201, JSON.stringify(downgrade.body));
    assert.equal(downgrade.body.data.request_type, "downgrade");
    requestIds.push(downgrade.body.data.id);

    const cancel = await agent
      .post("/api/subscription-requests/cancellation")
      .set("x-csrf-token", await getCsrf(agent))
      .send({
        cancellation_effective_at: "2026-12-31",
        reason: "HTTP Roundtrip Kuendigung"
      });
    assert.equal(cancel.status, 201, JSON.stringify(cancel.body));
    assert.equal(cancel.body.data.request_type, "cancellation");
    requestIds.push(cancel.body.data.id);

    const generated = await generateDocument(pool, {
      documentType: "change_confirmation",
      orgId,
      actorUserId: user.id,
      dataOverride: {
        desired_plan: "PRO",
        contact_email: email,
        requester_company_name: "HTTP Roundtrip Docs GmbH",
        total_cents: 79900
      }
    });
    assert.equal(generated.ok, true);
    documentIds.push(generated.row.id);

    const docsMine = await agent.get("/api/subscription-documents/mine").expect(200);
    assert.ok(docsMine.body.data.items.some((doc) => doc.id === generated.row.id));

    const metadata = await agent.get(`/api/subscription-documents/${generated.row.id}`).expect(200);
    assert.equal(metadata.body.data.id, generated.row.id);
    assert.equal(metadata.body.data.has_content, true);

    const download = await agent.get(`/api/subscription-documents/${generated.row.id}/download`).expect(200);
    assert.match(download.headers["content-disposition"], /inline; filename=/);
    assert.match(download.text, /TempConnect/);
  });

  it("covers public cost-preview CSRF and prevents auth users from reading public previews as own documents", async () => {
    const agent = await makeAgent();
    const noCsrf = await agent
      .post("/api/subscription-documents/cost-preview")
      .send({ desired_plan: "PLUS", total_cents: 49900 });
    assert.equal(noCsrf.status, 403);

    const csrf = await getCsrf(agent);
    const created = await agent
      .post("/api/subscription-documents/cost-preview")
      .set("x-csrf-token", csrf)
      .send({
        desired_plan: "PLUS",
        total_cents: 49900,
        contact_email: uniqueEmail(),
        contact_name: "Preview Tester",
        requester_company_name: "Preview GmbH"
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    documentIds.push(created.body.data.id);

    await agent.get(created.body.data.download_url).expect(200);

    const { agent: authAgent, email } = await registerAndLogin({
      company_name: "HTTP Roundtrip Foreign Preview GmbH",
      plan: "PLUS"
    });
    createdEmails.push(email);
    const forbidden = await authAgent.get(`/api/subscription-documents/${created.body.data.id}`);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, "FORBIDDEN_CROSS_ORG");
  });

  it("uses the separated Staff session for SCC subscription routes and step-up guarded mutations", async () => {
    const { agent: customerAgent, csrfToken, email: customerEmail, user: customerUser } = await registerAndLogin({
      company_name: "HTTP Roundtrip Staff Target GmbH",
      plan: "PLUS"
    });
    createdEmails.push(customerEmail);
    await rememberOrg(customerUser.id);
    await ensureSubscription(pool, customerUser.id, "PLUS");

    const upgrade = await customerAgent
      .post("/api/subscription-requests/upgrade")
      .set("x-csrf-token", csrfToken)
      .send({ desired_plan: "PRO", message: "SCC HTTP Roundtrip Approval" });
    assert.equal(upgrade.status, 201, JSON.stringify(upgrade.body));
    requestIds.push(upgrade.body.data.id);

    const staffPassword = "IntegrationTest123!";
    const staff = await registerAndLogin({
      company_name: "TempConnect Staff HTTP",
      plan: "PLUS"
    });
    createdEmails.push(staff.email);
    staffUserIds.push(staff.user.id);
    await pool.query(
      `INSERT INTO tempconnect_staff (user_id, email, display_name, is_active, requires_step_up, notes)
       VALUES ($1, $2, 'HTTP Staff', TRUE, TRUE, 'integration test')
       ON CONFLICT (user_id) DO UPDATE
          SET email = EXCLUDED.email,
              is_active = TRUE,
              requires_step_up = TRUE,
              revoked_at = NULL`,
      [staff.user.id, staff.email]
    );

    const anonymousStaff = await makeAgent();
    const denied = await anonymousStaff.get("/staff/api/subscription-requests");
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, "SCC_NOT_AUTHENTICATED");

    const staffAgent = await makeAgent();
    const login = await staffAgent
      .post("/staff/api/auth/login")
      .send({ email: staff.email, password: staffPassword });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.ok(login.headers["set-cookie"]?.some((cookie) => cookie.includes("tc.staff.sid")));

    const list = await staffAgent.get("/staff/api/subscription-requests").expect(200);
    assert.ok(Array.isArray(list.body.data.items));

    const blockedTransition = await staffAgent
      .post(`/staff/api/subscription-requests/${upgrade.body.data.id}/transition`)
      .send({
        confirmed: true,
        reason: "Roundtrip Transition Grund",
        next_status: "under_review"
      });
    assert.equal(blockedTransition.status, 428);
    assert.equal(blockedTransition.body.error.code, "SCC_STEP_UP_REQUIRED");

    const stepUp = await staffAgent
      .post("/staff/api/auth/step-up")
      .send({ confirmed: true });
    assert.equal(stepUp.status, 200, JSON.stringify(stepUp.body));

    const transition = await staffAgent
      .post(`/staff/api/subscription-requests/${upgrade.body.data.id}/transition`)
      .send({
        confirmed: true,
        reason: "Roundtrip Transition Grund",
        next_status: "under_review"
      });
    assert.equal(transition.status, 200, JSON.stringify(transition.body));
    assert.equal(transition.body.data.status, "under_review");

    const approve = await staffAgent
      .post(`/staff/api/subscription-requests/${upgrade.body.data.id}/approve`)
      .send({
        confirmed: true,
        reason: "Roundtrip Approval Grund"
      });
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    assert.equal(approve.body.data.status, "accepted");
  });

  async function rememberOrg(userId) {
    const orgId = await getUserOrgId(pool, userId);
    if (orgId) orgIds.push(orgId);
    return orgId;
  }

  async function cleanupCommercialArtifacts() {
    if (!pool) return;
    await safeQuery("DELETE FROM subscription_documents WHERE id = ANY($1::uuid[])", [documentIds]);
    await safeQuery("DELETE FROM subscription_documents WHERE subscription_request_id = ANY($1::uuid[])", [requestIds]);
    await safeQuery("DELETE FROM subscription_request_status_history WHERE request_id = ANY($1::uuid[])", [requestIds]);
    await safeQuery("DELETE FROM subscription_requests WHERE id = ANY($1::uuid[])", [requestIds]);
    await safeQuery("DELETE FROM subscription_requests WHERE org_id = ANY($1::uuid[])", [orgIds]);
    await safeQuery("DELETE FROM strategic_collaboration_requests WHERE contact_email = ANY($1::text[])", [enterpriseEmails]);
    await safeQuery("DELETE FROM tempconnect_staff WHERE user_id = ANY($1::uuid[])", [staffUserIds]);
  }

  async function safeQuery(sql, params) {
    if (!params[0]?.length) return;
    try {
      await pool.query(sql, params);
    } catch {
      // Cleanup is best-effort; failing cleanup must not hide the test result.
    }
  }
});

function validEnterprisePayload(email) {
  return {
    company: "HTTP Roundtrip Enterprise GmbH",
    contact: "Erika Muster",
    email,
    phone: "+49 30 123456",
    street: "Musterstrasse 1",
    city: "10115 Berlin",
    vat_id: "DE123456789",
    expected_start: "2026-05-01",
    notes: "HTTP Roundtrip Test fuer Enterprise Anfrage",
    plan: "INDIVIDUELL",
    base_price: 2499,
    seats: 75,
    seats_included: 50,
    extra_seat_price: 29,
    monthly_estimate: 3224,
    onetime_estimate: 0,
    addons: [
      { id: "vendor_pool", name: "Vendor Pool", price: 299, type: "monthly" }
    ],
    strategic_collaboration_interest: true,
    strategic_collaboration_message: "Bitte Rahmenbedingungen fuer mehrere Standorte pruefen.",
    strategic_collaboration_site_count: 3,
    strategic_collaboration_region_scope: "DACH"
  };
}

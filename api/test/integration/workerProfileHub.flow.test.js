import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  makeAgent,
  getCsrf,
  registerAndLoginWithPlan,
  uniqueEmail,
  createPool,
  cleanupUser
} from "./helpers.js";

describe("Worker Profile Hub Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let agency;
  let workerUserId;
  let publicSlug;

  const createdEmails = [];
  const workerEmail = uniqueEmail();
  const workerPassword = "WorkerProfile123!";
  const inviteEmail = uniqueEmail();
  const importEmail = uniqueEmail();

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    agency = await registerAndLoginWithPlan(pool, "PLUS", {
      role: "agency",
      company_name: "E2E Worker Hub GmbH"
    });
    createdEmails.push(agency.email);
  });

  after(async () => {
    if (!pool) return;
    for (const email of [...createdEmails].reverse()) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  it("creates a worker account for the hub flow", async () => {
    const csrf = await getCsrf(agency.agent);
    const res = await agency.agent
      .post("/api/workers")
      .set("x-csrf-token", csrf)
      .send({
        email: workerEmail,
        first_name: "Max",
        last_name: "Huber",
        password: workerPassword,
        personnel_number: "HUB-2026-001",
        city: "Berlin"
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body?.user?.id, "Expected created worker user");
    workerUserId = res.body.user.id;
    createdEmails.push(workerEmail);
  });

  it("updates hub fields and returns enriched worker hub payload", async () => {
    const csrf = await getCsrf(agency.agent);
    const res = await agency.agent
      .patch(`/api/workers/${workerUserId}`)
      .set("x-csrf-token", csrf)
      .send({
        preferred_locale: "de",
        date_of_birth: "1990-01-15",
        profile_text: "Erfahrener Lagerlogistiker mit sicherem Stapler- und Versandprozess.",
        availability_note: "Ab KW 20 kurzfristig verfügbar",
        skill_tags: ["Stapler", " stapler ", "Kommissionierung"],
        qualifications: [
          "Staplerschein",
          {
            name: "Schweißschein",
            issuer: "DEKRA",
            expires_at: "2027-12-31",
            document_label: "Zertifikat",
            document_url: "https://internal.example/doc.pdf",
            note: "Interner Nachweis"
          }
        ],
        profile_public: true,
        public_profile_fields: ["name", "skill_tags", "qualifications", "profile_text", "availability_note"]
      });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(res.body.skill_tags, ["Stapler", "Kommissionierung"]);
    assert.equal(res.body.qualifications.length, 2);
    assert.equal(res.body.profile_public, true);
    assert.ok(Array.isArray(res.body.public_profile_fields));
    assert.ok(res.body.public_profile_fields.includes("name"));
    assert.ok(res.body.linkage, "Expected linkage block");
    assert.ok(res.body.operational_context, "Expected operational context block");
    assert.ok(typeof res.body.profile_completion_percent === "number");
    assert.ok(res.body.public_profile_path?.includes("worker-profile-public.html?slug="));
    assert.ok(res.body.public_profile_preview?.public_fields?.includes("qualifications"));
    publicSlug = res.body.public_profile_slug || res.body.public_profile_preview?.slug;
    assert.ok(publicSlug, "Expected public profile slug");
  });

  it("uploads, verifies, downloads and deletes worker documents within the hub flow", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
    const uploadCsrf = await getCsrf(agency.agent);
    const uploadRes = await agency.agent
      .post(`/api/workers/${workerUserId}/documents`)
      .set("x-csrf-token", uploadCsrf)
      .field("category", "qualification")
      .field("title", "Staplerschein Scan")
      .field("qualification_name", "Staplerschein")
      .field("issuer", "DEKRA")
      .field("valid_until", "2027-12-31")
      .field("notes", "Gescannt aus Personalakte")
      .attach("file", pdfBuffer, { filename: "staplerschein.pdf", contentType: "application/pdf" });

    assert.strictEqual(uploadRes.status, 201, `Expected 201, got ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);
    assert.equal(uploadRes.body.category, "qualification");
    assert.equal(uploadRes.body.qualification_name, "Staplerschein");
    assert.ok(uploadRes.body.download_path, "Expected download path");

    const documentId = uploadRes.body.id;

    const verifyCsrf = await getCsrf(agency.agent);
    const verifyRes = await agency.agent
      .post(`/api/workers/${workerUserId}/documents/${documentId}/verify`)
      .set("x-csrf-token", verifyCsrf)
      .send({ note: "Geprüft und intern freigegeben" });

    assert.strictEqual(verifyRes.status, 200, `Expected 200, got ${verifyRes.status}: ${JSON.stringify(verifyRes.body)}`);
    assert.equal(verifyRes.body.status, "verified");
    assert.equal(verifyRes.body.review_note, "Geprüft und intern freigegeben");

    const hubRes = await agency.agent.get(`/api/workers/${workerUserId}`);
    assert.strictEqual(hubRes.status, 200, `Expected 200, got ${hubRes.status}: ${JSON.stringify(hubRes.body)}`);
    assert.equal(hubRes.body.document_hub.summary.total, 1);
    assert.equal(hubRes.body.document_hub.summary.verified, 1);
    assert.ok(hubRes.body.document_hub.recent_documents.some((item) => item.id === documentId), "Expected uploaded document in worker hub");

    const downloadRes = await agency.agent.get(`/api/workers/${workerUserId}/documents/${documentId}/download`);
    assert.strictEqual(downloadRes.status, 200, `Expected 200, got ${downloadRes.status}`);
    assert.match(String(downloadRes.headers["content-type"] || ""), /application\/pdf/);

    const deleteCsrf = await getCsrf(agency.agent);
    const deleteRes = await agency.agent
      .delete(`/api/workers/${workerUserId}/documents/${documentId}`)
      .set("x-csrf-token", deleteCsrf);
    assert.strictEqual(deleteRes.status, 200, `Expected 200, got ${deleteRes.status}: ${JSON.stringify(deleteRes.body)}`);

    const listRes = await agency.agent.get(`/api/workers/${workerUserId}/documents`);
    assert.strictEqual(listRes.status, 200, `Expected 200, got ${listRes.status}: ${JSON.stringify(listRes.body)}`);
    assert.equal(listRes.body.items.length, 0);
  });

  it("supports worker self-service documents, expiry steering and document notifications", async () => {
    const workerAgent = await makeAgent();
    const loginCsrf = await getCsrf(workerAgent);
    const loginRes = await workerAgent
      .post("/api/auth/login")
      .set("x-csrf-token", loginCsrf)
      .send({ email: workerEmail, password: workerPassword });

    assert.strictEqual(loginRes.status, 200, `Expected 200, got ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);

    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
    const firstUploadCsrf = await getCsrf(workerAgent);
    const firstUploadRes = await workerAgent
      .post("/api/worker/documents")
      .set("x-csrf-token", firstUploadCsrf)
      .field("category", "identity")
      .field("title", "Ausweis Kopie")
      .field("notes", "Vorläufiger Upload")
      .attach("file", pdfBuffer, { filename: "ausweis.pdf", contentType: "application/pdf" });

    assert.strictEqual(firstUploadRes.status, 201, `Expected 201, got ${firstUploadRes.status}: ${JSON.stringify(firstUploadRes.body)}`);
    const pendingDocumentId = firstUploadRes.body.id;

    const pendingListRes = await workerAgent.get("/api/worker/documents");
    assert.strictEqual(pendingListRes.status, 200, `Expected 200, got ${pendingListRes.status}: ${JSON.stringify(pendingListRes.body)}`);
    assert.ok(pendingListRes.body.items.some((item) => item.id === pendingDocumentId), "Expected worker document in self-service list");

    const deletePendingCsrf = await getCsrf(workerAgent);
    const deletePendingRes = await workerAgent
      .delete(`/api/worker/documents/${pendingDocumentId}`)
      .set("x-csrf-token", deletePendingCsrf);
    assert.strictEqual(deletePendingRes.status, 200, `Expected 200, got ${deletePendingRes.status}: ${JSON.stringify(deletePendingRes.body)}`);

    const expiringSoon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const verifiedUploadCsrf = await getCsrf(workerAgent);
    const verifiedUploadRes = await workerAgent
      .post("/api/worker/documents")
      .set("x-csrf-token", verifiedUploadCsrf)
      .field("category", "qualification")
      .field("title", "Staplerschein")
      .field("qualification_name", "Staplerschein")
      .field("issuer", "DEKRA")
      .field("valid_until", expiringSoon)
      .field("notes", "Muss bald erneuert werden")
      .attach("file", pdfBuffer, { filename: "staplerschein-worker.pdf", contentType: "application/pdf" });

    assert.strictEqual(verifiedUploadRes.status, 201, `Expected 201, got ${verifiedUploadRes.status}: ${JSON.stringify(verifiedUploadRes.body)}`);
    const verifiedDocumentId = verifiedUploadRes.body.id;
    assert.match(String(verifiedUploadRes.body.download_path || ""), /\/api\/worker\/documents\/.+\/download/);

    const verifyCsrf = await getCsrf(agency.agent);
    const verifyRes = await agency.agent
      .post(`/api/workers/${workerUserId}/documents/${verifiedDocumentId}/verify`)
      .set("x-csrf-token", verifyCsrf)
      .send({ note: "Freigegeben für den Einsatz" });

    assert.strictEqual(verifyRes.status, 200, `Expected 200, got ${verifyRes.status}: ${JSON.stringify(verifyRes.body)}`);
    assert.equal(verifyRes.body.status, "verified");

    let verifiedNotification = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const notifRes = await workerAgent.get("/api/worker/notifications");
      assert.strictEqual(notifRes.status, 200, `Expected 200, got ${notifRes.status}: ${JSON.stringify(notifRes.body)}`);
      verifiedNotification = (notifRes.body.items || []).find((item) => (
        item.entity_id === verifiedDocumentId && (
          item.type === "worker_document_verified"
          || (item.type === "general" && /\[worker_document_verified\]/.test(String(item.message || "")))
        )
      ));
      if (verifiedNotification) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.ok(verifiedNotification, "Expected worker document verification notification");
    assert.equal(verifiedNotification.link_path, "/public/einsatzportal-profil.html#documents");

    const dashboardRes = await workerAgent.get("/api/worker/dashboard");
    assert.strictEqual(dashboardRes.status, 200, `Expected 200, got ${dashboardRes.status}: ${JSON.stringify(dashboardRes.body)}`);
    assert.equal(dashboardRes.body.document_hub.summary.total, 1);
    assert.equal(dashboardRes.body.document_hub.summary.verified, 1);
    assert.equal(dashboardRes.body.document_hub.summary.expiring_soon, 1);
    assert.equal(dashboardRes.body.document_hub.summary.action_required, 1);
    assert.ok(
      dashboardRes.body.document_hub.recent_documents.some((item) => item.id === verifiedDocumentId && item.download_path),
      "Expected verified worker document in dashboard hub"
    );

    const workerDownloadRes = await workerAgent.get(`/api/worker/documents/${verifiedDocumentId}/download`);
    assert.strictEqual(workerDownloadRes.status, 200, `Expected 200, got ${workerDownloadRes.status}`);
    assert.match(String(workerDownloadRes.headers["content-type"] || ""), /application\/pdf/);

    const lockedDeleteCsrf = await getCsrf(workerAgent);
    const lockedDeleteRes = await workerAgent
      .delete(`/api/worker/documents/${verifiedDocumentId}`)
      .set("x-csrf-token", lockedDeleteCsrf);
    assert.strictEqual(lockedDeleteRes.status, 409, `Expected 409, got ${lockedDeleteRes.status}: ${JSON.stringify(lockedDeleteRes.body)}`);
    assert.equal(lockedDeleteRes.body.error, "VERIFIED_DOCUMENT_LOCKED");

    const cleanupCsrf = await getCsrf(agency.agent);
    const cleanupRes = await agency.agent
      .delete(`/api/workers/${workerUserId}/documents/${verifiedDocumentId}`)
      .set("x-csrf-token", cleanupCsrf);
    assert.strictEqual(cleanupRes.status, 200, `Expected 200, got ${cleanupRes.status}: ${JSON.stringify(cleanupRes.body)}`);
  });

  it("serves only the explicitly released public profile fields", async () => {
    const publicAgent = await makeAgent();
    const res = await publicAgent.get(`/api/public/worker-profiles/${publicSlug}`);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.name, "Max Huber");
    assert.equal(res.body.profile_text, "Erfahrener Lagerlogistiker mit sicherem Stapler- und Versandprozess.");
    assert.equal(res.body.availability_note, "Ab KW 20 kurzfristig verfügbar");
    assert.deepStrictEqual(res.body.skill_tags, ["Stapler", "Kommissionierung"]);
    assert.equal(res.body.city, undefined);
    assert.equal(res.body.email, undefined);
    assert.equal(res.body.notes, undefined);
    assert.equal(res.body.qualifications[1].document_label, "Zertifikat");
    assert.equal(res.body.qualifications[1].document_url, undefined);
    assert.equal(res.body.qualifications[1].note, undefined);
  });

  it("keeps invite listing functional after the hub changes", async () => {
    const csrf = await getCsrf(agency.agent);
    const createRes = await agency.agent
      .post("/api/worker-invites")
      .set("x-csrf-token", csrf)
      .send({
        email: inviteEmail,
        first_name: "Invite",
        last_name: "Worker",
        personnel_number: "INV-2026-001"
      });

    assert.strictEqual(createRes.status, 201, `Expected 201, got ${createRes.status}: ${JSON.stringify(createRes.body)}`);

    const listRes = await agency.agent.get("/api/worker-invites");
    assert.strictEqual(listRes.status, 200, `Expected 200, got ${listRes.status}: ${JSON.stringify(listRes.body)}`);
    assert.ok(Array.isArray(listRes.body.items), "Expected invite list items array");
    assert.ok(listRes.body.items.some((item) => item.email === inviteEmail), "Expected created invite in list");
  });

  it("keeps worker csv import functional after the hub changes", async () => {
    const csrf = await getCsrf(agency.agent);
    const res = await agency.agent
      .post("/api/workers/import")
      .set("x-csrf-token", csrf)
      .send({
        workers: [
          {
            email: importEmail,
            first_name: "Import",
            last_name: "Worker",
            personnel_number: "CSV-2026-001",
            city: "Hamburg",
            notes: "Import-Regressionsfall"
          }
        ],
        on_duplicate: "skip"
      });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.created.length, 1);
    assert.equal(res.body.created[0].email, importEmail);
    createdEmails.push(importEmail);
  });
});

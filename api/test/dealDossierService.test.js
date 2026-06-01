import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDossier } from "../services/dealDossierService.js";

function makeDossierPool() {
  return {
    query: async (sql) => {
      if (sql.includes("FROM offers o")) {
        return {
          rows: [{
            id: "offer-1",
            status: "accepted",
            agreement_status: "activated",
            agreement_ref: "EV-2025-000321",
            agreement_version: 2,
            agreement_snapshot: null,
            confirmed_at: "2025-12-10T08:00:00.000Z",
            activated_at: "2025-12-12T09:30:00.000Z",
            assignment_id: "assignment-1",
            signature_required: false,
            signature_status: "not_required",
            signed_at: null,
            signed_by_party_a: null,
            signed_by_party_b: null,
            signature_provider: null,
            signature_reference: null,
            demand_title: "Altbestand Schweisser Winterprojekt",
            requester_company_id: "company-1",
            supplier_company_id: "supplier-1",
            requester_company_name: "Nordbau GmbH",
            supplier_company_name: "Legacy Staff GmbH"
          }],
          rowCount: 1
        };
      }
      if (sql.includes("FROM deal_documents dd")) {
        return {
          rows: [
            {
              id: "doc-1",
              offer_id: "offer-1",
              document_type: "agreement",
              version: 2,
              title: "Einsatzvereinbarung EV-2025-000321",
              source: "generated",
              content_hash: "abc",
              asset_id: null,
              generated_by: null,
              generated_at: "2025-12-12T09:30:00.000Z",
              status: "current",
              agreement_ref: "EV-2025-000321",
              agreement_version: 2,
              created_at: "2025-12-12T09:30:00.000Z",
              updated_at: "2025-12-12T09:30:00.000Z",
              generated_by_email: null,
              generated_by_company: null,
              asset_file_path: null,
              asset_original_name: null,
              asset_mime_type: null
            },
            {
              id: "doc-0",
              offer_id: "offer-1",
              document_type: "agreement",
              version: 1,
              title: "Einsatzvereinbarung EV-2025-000321 v1",
              source: "generated",
              content_hash: "def",
              asset_id: null,
              generated_by: null,
              generated_at: "2025-12-10T08:00:00.000Z",
              status: "archived",
              agreement_ref: "EV-2025-000321",
              agreement_version: 1,
              created_at: "2025-12-10T08:00:00.000Z",
              updated_at: "2025-12-12T09:30:00.000Z",
              generated_by_email: null,
              generated_by_company: null,
              asset_file_path: null,
              asset_original_name: null,
              asset_mime_type: null
            }
          ],
          rowCount: 2
        };
      }
      if (sql.includes("FROM offer_assets")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM audit_log")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

describe("getDossier", () => {
  it("keeps archived deal documents visible so older completed history stays auditable", async () => {
    const dossier = await getDossier(makeDossierPool(), "offer-1");

    assert.equal(dossier.offer_id, "offer-1");
    assert.equal(dossier.agreement_status, "activated");
    assert.equal(dossier.documents.generated.length, 2);
    assert.ok(dossier.documents.generated.some((doc) => doc.status === "archived"));
    assert.equal(dossier.document_count, 2);
  });
});

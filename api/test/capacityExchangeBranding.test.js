import { describe, it } from "node:test";
import assert from "node:assert";
import { getEntryById } from "../services/capacityExchangeService.js";

describe("capacityExchangeService branding projection", () => {
  it("projects supplier_logo_url via organization/company profile fallback", async () => {
    // getEntryById ruft intern zwei Queries ab (Projektion + Commercial-State);
    // der Test sammelt ALLE SQL-Statements und prueft die Projektion auf dem
    // passenden Statement, damit Folge-Queries sie nicht verdecken.
    const capturedSql = [];
    const mockPool = {
      query: async (sql) => {
        capturedSql.push(sql);
        return {
          rows: [{
            id: "entry-1",
            status: "active",
            visibility_status: "public",
            supplier_company_id: "supplier-1",
            supplier_logo_url: "/uploads/company/logo.webp"
          }]
        };
      }
    };

    const row = await getEntryById(mockPool, "entry-1", "viewer-1");
    assert.ok(row);
    assert.strictEqual(row.supplier_logo_url, "/uploads/company/logo.webp");

    const projectionSql = capturedSql.find((sql) =>
      /COALESCE\(o\.logo_url,\s*cfp\.logo_url\)\s+AS supplier_logo_url/i.test(sql)
    );
    assert.ok(projectionSql, "supplier_logo_url projection missing from all captured SQL statements");
    assert.match(projectionSql, /LEFT JOIN company_profiles cfp ON cfp\.user_id = cp\.supplier_company_id/i);
  });
});


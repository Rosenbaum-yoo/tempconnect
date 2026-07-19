/**
 * skillCatalogService — Zero-State, Gruppierung, kuratierte Kategorie-Reihenfolge.
 * DB-frei: Mock-Pool liefert feste rows; geprüft wird das Aggregations-/Sortier-Verhalten.
 * Run: node --test test/skillCatalog.service.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/skillCatalogService.js";

function poolReturning(rows) {
  return { query: async () => ({ rows, rowCount: rows.length }) };
}

describe("skillCatalogService.getSkillCatalog", () => {
  it("Zero-State: leerer Katalog → available:false, keine Kategorien, kein Fehler", async () => {
    const res = await svc.getSkillCatalog(poolReturning([]));
    assert.equal(res.available, false);
    assert.equal(res.total, 0);
    assert.equal(res.category_count, 0);
    assert.deepEqual(res.categories, []);
    assert.equal(typeof res.generated_at, "string");
  });

  it("gruppiert nach Kategorie in kuratierter Reihenfolge (Pflege vor Büro)", async () => {
    const rows = [
      { id: "a1", name: "Bürokraft", category: "Büro & Verwaltung", aliases: [], usage_count: 0 },
      { id: "b1", name: "Altenpflege", category: "Pflege & Betreuung", aliases: ["Seniorenpflege"], usage_count: 2 },
      { id: "b2", name: "Grundpflege", category: "Pflege & Betreuung", aliases: [], usage_count: 0 }
    ];
    const res = await svc.getSkillCatalog(poolReturning(rows));
    assert.equal(res.available, true);
    assert.equal(res.total, 3);
    assert.equal(res.categories[0].category, "Pflege & Betreuung");
    assert.equal(res.categories[0].skill_count, 2);
    assert.equal(res.categories[1].category, "Büro & Verwaltung");
    const altenpflege = res.categories[0].skills.find((s) => s.name === "Altenpflege");
    assert.deepEqual(altenpflege.aliases, ["Seniorenpflege"]);
    assert.equal(altenpflege.usage_count, 2);
  });

  it("unbekannte Kategorie wird ans Ende sortiert (robust gegen Erweiterung)", async () => {
    const rows = [
      { id: "z1", name: "Sonderskill", category: "Zukunftsbranche", aliases: [], usage_count: 0 },
      { id: "p1", name: "Altenpflege", category: "Pflege & Betreuung", aliases: [], usage_count: 0 }
    ];
    const res = await svc.getSkillCatalog(poolReturning(rows));
    assert.equal(res.categories[0].category, "Pflege & Betreuung");
    assert.equal(res.categories[res.categories.length - 1].category, "Zukunftsbranche");
  });
});

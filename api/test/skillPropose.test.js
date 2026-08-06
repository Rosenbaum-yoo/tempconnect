/**
 * Eigene Faehigkeiten von Arbeitern (Mig 160).
 *
 * Der Katalog ist die gemeinsame Matching-Achse der Plattform. Duerfte jeder
 * Arbeiter frei neue Zeilen anlegen, zerfiele "Gabelstaplerfahrer" binnen Wochen
 * in vier Schreibweisen — und ein Unternehmen, das nach einer davon sucht, faende
 * drei Viertel der passenden Arbeiter nicht mehr.
 *
 * Diese Suite haelt die drei Regeln fest, die das verhindern:
 *   1. Erst suchen, dann anlegen (Name, dann Alias) — die haeufigste Eingabe ist
 *      eine andere Schreibweise, keine neue Faehigkeit.
 *   2. Wirklich Neues wird 'proposed', nicht 'approved'.
 *   3. Ein Vorschlag beruehrt die Plattform nicht: weder Auswahlkatalog noch
 *      automatisch erzeugte Marktplatz-Angebote.
 *
 * Run: node --test --test-force-exit test/skillPropose.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as skillCatalogService from "../services/skillCatalogService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");

/** Pool-Attrappe: beantwortet je nach SQL-Form und haelt alle Abfragen fest. */
function makePool({ nameHit = null, aliasHit = null, inserted = null } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (/INSERT INTO platform_skills/i.test(text)) {
        return { rows: [inserted || { id: "new-1", name: params[0], category: params[1], status: "proposed" }] };
      }
      if (/unnest\(aliases\)/i.test(text)) return { rows: aliasHit ? [aliasHit] : [] };
      if (/LOWER\(name\) = LOWER/i.test(text)) return { rows: nameHit ? [nameHit] : [] };
      return { rows: [] };
    }
  };
}

describe("proposeSkill — erst suchen, dann anlegen", () => {
  it("trifft den kuratierten Skill ueber den Namen, unabhaengig von Gross-/Kleinschreibung", async () => {
    const pool = makePool({ nameHit: { id: "s1", name: "Altenpflege", category: "Pflege", status: "approved" } });
    const out = await skillCatalogService.proposeSkill(pool, { name: "  altenPFLEGE " });
    assert.equal(out.matched, true);
    assert.equal(out.matched_on, "name");
    assert.equal(out.skill.id, "s1");
    // Kein INSERT: es gab die Faehigkeit ja bereits.
    assert.equal(pool.calls.filter((c) => /INSERT/i.test(c.sql)).length, 0);
  });

  it("trifft ueber eine bekannte Schreibvariante (aliases)", async () => {
    const pool = makePool({ aliasHit: { id: "s2", name: "Gesundheits- und Krankenpflege", category: "Pflege", status: "approved" } });
    const out = await skillCatalogService.proposeSkill(pool, { name: "Krankenschwester" });
    assert.equal(out.matched, true);
    assert.equal(out.matched_on, "alias");
    assert.equal(out.skill.name, "Gesundheits- und Krankenpflege",
      "der Arbeiter bekommt den kuratierten Skill, nicht seinen Suchbegriff");
    assert.equal(pool.calls.filter((c) => /INSERT/i.test(c.sql)).length, 0);
  });

  it("legt wirklich Neues als 'proposed' an — nie als 'approved'", async () => {
    const pool = makePool();
    const out = await skillCatalogService.proposeSkill(pool, {
      name: "Hubarbeitsbuehne", userId: "u1", orgId: "o1"
    });
    assert.equal(out.matched, false);
    assert.equal(out.skill.status, "proposed");
    const insert = pool.calls.find((c) => /INSERT/i.test(c.sql));
    assert.ok(insert, "es muss eingefuegt werden");
    assert.match(insert.sql, /'proposed'/, "Status ist im SQL festgenagelt, nicht parametrisiert");
    assert.deepEqual(insert.params.slice(0, 1), ["Hubarbeitsbuehne"]);
    assert.equal(insert.params[2], "u1", "Herkunft wird festgehalten");
    assert.match(insert.sql, /ON CONFLICT \(name\)/,
      "zwei Arbeiter duerfen dieselbe Faehigkeit gleichzeitig vorschlagen, ohne Fehler");
  });

  it("verweigert unbrauchbare Eingaben, statt Muell anzulegen", async () => {
    const pool = makePool();
    await assert.rejects(() => skillCatalogService.proposeSkill(pool, { name: "x" }),
      (e) => e.code === "INVALID_SKILL_NAME");
    await assert.rejects(() => skillCatalogService.proposeSkill(pool, { name: "a".repeat(101) }),
      (e) => e.code === "INVALID_SKILL_NAME");
    assert.equal(pool.calls.length, 0, "gar nicht erst zur Datenbank");
  });
});

describe("Ein Vorschlag beruehrt die Plattform nicht", () => {
  it("der Auswahlkatalog zeigt ausschliesslich kuratierte Faehigkeiten", async () => {
    const pool = makePool();
    await skillCatalogService.getSkillCatalog(pool);
    const q = pool.calls[0].sql;
    assert.match(q, /status = 'approved'/,
      "sonst waehlen andere Arbeiter ungeprueffte Schreibvarianten aus");
  });

  it("aus einem Vorschlag entsteht KEIN automatisches Marktplatz-Angebot", () => {
    // Der Generator liest die Skills eines Arbeiters selbst — die Regel muss
    // dort in der Abfrage stehen, sonst landet Ungeprueftes im Marktplatz.
    const src = fs.readFileSync(path.join(API_ROOT, "services/capacityOfferGeneratorService.js"), "utf8");
    const block = src.match(/async function loadWorkerSkills[\s\S]*?\n}/);
    assert.ok(block, "loadWorkerSkills nicht gefunden");
    assert.match(block[0], /ps\.status = 'approved'/);
  });

  it("das Arbeiterprofil zeigt den Pruefstatus, statt ihn zu verschweigen", () => {
    const src = fs.readFileSync(path.join(API_ROOT, "services/workerService.js"), "utf8");
    const block = src.match(/export async function getWorkerSkills[\s\S]*?\n}/);
    assert.ok(block, "getWorkerSkills nicht gefunden");
    assert.match(block[0], /ps\.status/,
      "sonst wundert sich der Arbeiter, warum seine Faehigkeit nirgends auftaucht");
  });
});

describe("Migration 160", () => {
  const sql = fs.readFileSync(
    path.resolve(API_ROOT, "..", "sql/migrations/160_worker_proposed_skills.sql"), "utf8"
  );

  it("bestehende Katalogzeilen bleiben ohne Datenmigration kuratiert", () => {
    assert.match(sql, /status TEXT NOT NULL DEFAULT 'approved'/);
  });

  it("laesst nur die drei bekannten Zustaende zu", () => {
    assert.match(sql, /CHECK \(status IN \('approved', 'proposed', 'rejected'\)\)/);
  });

  it("nennt einen Rollback-Weg", () => {
    assert.match(sql, /Rollback:/);
    assert.match(sql, /DROP COLUMN IF EXISTS status/);
  });
});

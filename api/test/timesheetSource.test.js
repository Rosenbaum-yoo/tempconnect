/**
 * Herkunft eines Stundenzettels (Audit-Backlog C-1, Owner-Freigabe 2026-07-26).
 *
 * Es gibt zwei Wege in die Abrechnungsschicht `timesheets`:
 *   - aus einer freigegebenen Worker-Meldung  -> `source = 'worker_submission'` (Nachweis da)
 *   - direkt ueber POST /api/timesheets       -> `source = 'manual'` (kein Gegennachweis)
 *
 * Beides ist erlaubt — nicht jede Agentur hat ihre Kraefte im Portal. Aber in der
 * Abrechnung und erst recht im Streitfall ist der Unterschied entscheidend, und er war
 * vorher nur ueber einen Umweg (LEFT JOIN auf worker_time_submissions) erkennbar.
 *
 * Run: node --test --test-force-exit test/timesheetSource.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as timesheetService from "../services/timesheetService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const API_ROOT = path.resolve(__dirname, "..");

/** Pool-Attrappe: haelt jede Query fest und beantwortet den INSERT mit der Zeile. */
function capturePool(row = {}) {
  const calls = [];
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      if (/INSERT INTO timesheets/i.test(String(sql))) {
        const source = params[9];
        return { rows: [{ id: "ts-1", org_id: "org-a", supplier_org_id: "org-b", worker_name: "Anna", week_start: "2026-04-06", source, ...row }] };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  return {
    calls,
    query: client.query,
    connect: async () => ({ ...client, release() {} }),
    insert() { return calls.find((c) => /INSERT INTO timesheets/i.test(c.sql)); }
  };
}

const BASE = {
  org_id: "org-a", supplier_org_id: "org-b",
  worker_name: "Anna Muster", week_start: "2026-04-06", week_end: "2026-04-10",
  created_by: "user-1"
};

describe("createTimesheet — Herkunft", () => {
  it("kennzeichnet die direkte Erfassung als 'manual'", async () => {
    const pool = capturePool();
    await timesheetService.createTimesheet(pool, { ...BASE });
    assert.equal(pool.insert().params[9], "manual");
  });

  it("uebernimmt 'worker_submission', wenn der Aufrufer es angibt", async () => {
    const pool = capturePool();
    await timesheetService.createTimesheet(pool, { ...BASE, source: "worker_submission" });
    assert.equal(pool.insert().params[9], "worker_submission");
  });

  it("faellt bei einem unbekannten Wert auf 'manual' zurueck — nie auf 'geprueft'", async () => {
    // Konservative Richtung: im Zweifel "kein Nachweis". Andersherum wuerde ein Tippfehler
    // einen Zettel als belegt ausweisen, der es nicht ist.
    const pool = capturePool();
    await timesheetService.createTimesheet(pool, { ...BASE, source: "irgendwas" });
    assert.equal(pool.insert().params[9], "manual");
  });

  it("schreibt die Herkunft in den Audit-Eintrag", async () => {
    const pool = capturePool();
    await timesheetService.createTimesheet(pool, { ...BASE });
    const audit = pool.calls.find((c) => /INSERT INTO audit_log/i.test(c.sql));
    assert.ok(audit, "Es muss ein Audit-Eintrag geschrieben werden");
    const details = audit.params.find((p) => typeof p === "string" && p.includes("source"));
    assert.ok(details, "Die Herkunft gehoert in die Audit-Details");
    assert.match(details, /"source":"manual"/);
  });
});

describe("Worker-Meldung — der andere Weg", () => {
  const svc = fs.readFileSync(path.join(API_ROOT, "services", "workerSubmissionService.js"), "utf8");

  it("beide Uebernahme-Pfade setzen 'worker_submission'", () => {
    const inserts = svc.match(/INSERT INTO timesheets[\s\S]{0,400}?RETURNING \*/g) || [];
    assert.equal(inserts.length, 2, "Erwartet genau zwei Uebernahme-Pfade");
    for (const stmt of inserts) {
      assert.match(stmt, /'worker_submission'/,
        "Ein Zettel aus einer Worker-Meldung muss als belegt gekennzeichnet sein");
    }
  });
});

describe("Migration 156", () => {
  const MIG = "sql/migrations/156_timesheet_source.sql";
  const sql = fs.readFileSync(path.join(REPO_ROOT, MIG), "utf8");

  it("laesst nur die beiden bekannten Werte zu", () => {
    assert.match(sql, /CHECK \(source = ANY \(ARRAY\['manual', 'worker_submission'\]/);
  });

  it("fuellt den Bestand anhand vorhandener Worker-Meldungen — nicht geraten", () => {
    assert.match(sql, /SET source = 'worker_submission'[\s\S]*worker_time_submissions s WHERE s\.timesheet_id = ts\.id/);
    assert.match(sql, /UPDATE timesheets SET source = 'manual' WHERE source IS NULL/);
  });

  it("setzt NOT NULL erst NACH dem Backfill", () => {
    assert.ok(
      sql.indexOf("SET source = 'manual' WHERE source IS NULL") < sql.indexOf("SET NOT NULL"),
      "NOT NULL vor dem Backfill wuerde die Migration auf jedem Bestand sprengen"
    );
  });

  it("nennt einen Rollback-Weg", () => {
    assert.match(sql, /DROP COLUMN IF EXISTS source/);
  });
});

describe("Anzeige", () => {
  const page = fs.readFileSync(path.join(REPO_ROOT, "frontend/public/js/pages/timesheets.js"), "utf8");

  it("beschriftet nur den Ausnahmefall", () => {
    assert.match(page, /function sourceBadge/);
    assert.match(page, /if \(source !== 'manual'\) return '';/);
  });

  it("erklaert die Kennzeichnung im Klartext, nicht nur als Kuerzel", () => {
    // Geprueft wird das VERHALTEN: das Abzeichen traegt eine Kurzform UND eine
    // Klartext-Erklaerung im title. Seit der i18n-Migration (P6) stehen beide
    // Texte im Woerterbuch statt als Literal im Markup — die frueheren
    // Literal-Treffer (/title="Direkt erfasst/) pruefen deshalb ein
    // Implementierungsdetail und wurden ersetzt, nicht abgeschwaecht:
    // die Erklaerung muss weiterhin existieren, laenger als die Kurzform sein
    // UND als title verdrahtet werden — jetzt zusaetzlich in BEIDEN Sprachen.
    const label = (locale) => {
      const block = page.match(new RegExp("TCi18n\\.register\\('" + locale + "',\\s*\\{[\\s\\S]*?\\}\\);"));
      assert.ok(block, `Woerterbuch ${locale} nicht gefunden`);
      const kurz = block[0].match(/'ts\.source\.manual':\s*'([^']+)'/);
      const lang = block[0].match(/'ts\.source\.manualTitle':\s*'([^']+)'/);
      assert.ok(kurz, `Kurzform fehlt (${locale})`);
      assert.ok(lang, `Klartext-Erklaerung fehlt (${locale})`);
      return { kurz: kurz[1], lang: lang[1] };
    };
    for (const locale of ["de", "en"]) {
      const { kurz, lang } = label(locale);
      assert.ok(lang.length > kurz.length + 10,
        `Erklaerung (${locale}) ist keine echte Erklaerung: "${lang}"`);
    }
    assert.match(label("de").lang, /Direkt erfasst/, "deutsche Fassung darf sich nicht still aendern");
    // … und sie landet wirklich im title-Attribut des Abzeichens
    assert.match(page, /title="' \+ esc\(t\('ts\.source\.manualTitle'\)\) \+ '"/);
  });

  it("ist im Zellen-Markup tatsaechlich verdrahtet", () => {
    assert.match(page, /sourceBadge\(ts\.source\)/);
  });
});

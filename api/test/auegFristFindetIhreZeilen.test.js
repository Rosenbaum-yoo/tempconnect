/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER INDEX, AUF DEM DIE AÜG-FRIST NACHSCHLÄGT (M11.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ein Index ist das Leichteste, was man still verliert: er steht in genau einer
 * Migration, niemand ruft ihn auf, und kein Test wird rot, wenn er fehlt — nur
 * langsamer. Deshalb diese Probe.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * GEMESSEN AM 2026-10-02
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   Indizes auf worker_assignment_links        11
 *   davon mit org_id als führender Spalte       0
 *   seq_scan / seq_tup_read / n_live_tup    13 381 / 317 432 / 26
 *
 * Die Zahl „1 Index mit org_id", die eine erste Messung meldete, war ein
 * TEILZEICHENKETTEN-TREFFER auf `supplier_org_id`. Es gab keinen.
 *
 * **Die Lastprobe, die M11.7 als Nachweis verlangt** — 300 Kunden, je 12 Kräfte,
 * je 6 Einsätze = 21 600 Zeilen, in einer zurückgerollten Transaktion gegen eine
 * Kopie der Tabelle:
 *
 *   ohne Index   Seq Scan,   503 Buffer, „Rows Removed by Filter: 21 576"
 *   mit Index    Index Scan,  20 Buffer
 *   nur org_id   Index Only Scan, 35 Buffer
 *
 * Die Abfrage liest also heute die ganze Tabelle und wirft 21 576 von 21 600
 * Zeilen weg, um 24 zu finden.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM DIE AÜG-FRIST UND NICHT DIE RLS-BEDINGUNG DIE BEGRÜNDUNG IST
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Zwei Begründungen waren im Umlauf. Die eine trägt:
 * `auegFristService.js` filtert an zwei Stellen mit `org_id` + `worker_user_id`
 * + `ORDER BY start_date` — die **AÜG-Höchstüberlassungsdauer**, eine gesetzliche
 * Frist, nachgeschlagen je Kraft je Entleiher.
 *
 * Die andere trägt nicht: „Migration 196 legt RLS auf diese Spalte". Gemessen hat
 * die Rolle der Anwendung `rolbypassrls = true` — die Richtlinie läuft für sie
 * nie. Sie wäre richtig, sobald die Anwendung mit `rls_app` verbindet; das ist
 * eine offene Owner-Entscheidung. Deshalb steht sie hier **nicht** als Grund.
 *
 * Run: node --test --test-force-exit test/auegFristFindetIhreZeilen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel(path.join("sql", "migrations"));
const suite = ROOT ? describe : describe.skip;

const MIGRATIONEN = ROOT
  ? fs.readdirSync(path.join(ROOT, "sql", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(ROOT, "sql", "migrations", f), "utf8") }))
  : [];
const ALLE = MIGRATIONEN.map((m) => m.text).join("\n");

suite("M11.7 — der Index der AÜG-Frist steht und führt mit org_id", () => {

  it("die Migrationen werden wirklich gelesen", () => {
    assert.ok(MIGRATIONEN.length > 200,
      `nur ${MIGRATIONEN.length} Migrationen gefunden — die Suche greift nicht mehr`);
  });

  it("der Index ist angelegt — und führt mit org_id", () => {
    /* Die Reihenfolge der Spalten IST die Zusage. Ein Index
     * `(worker_user_id, org_id, start_date)` wäre für die AÜG-Abfrage brauchbar
     * und für jede reine org_id-Abfrage wertlos — also auch für die
     * RLS-Bedingung, falls sie eines Tages greift. */
    assert.match(ALLE, /CREATE INDEX IF NOT EXISTS wal_org_worker_start_idx/,
      "der Index wal_org_worker_start_idx wird in keiner Migration angelegt");
    assert.match(ALLE, /wal_org_worker_start_idx\s*\n?\s*ON worker_assignment_links \(org_id, worker_user_id, start_date\)/,
      "der Index führt nicht mit (org_id, worker_user_id, start_date) — die "
      + "Spaltenreihenfolge ist die Zusage, nicht die Existenz");
  });

  it("die Migration nennt ihren Rollback-Weg", () => {
    /* CLAUDE.md: „Keine Migrations ohne Rollback-Plan". Bei einem Index ist er
     * eine Zeile — und genau deshalb fehlt er so leicht. */
    const mig = MIGRATIONEN.find((m) => m.name.startsWith("228_"));
    assert.ok(mig, "Migration 228 gibt es nicht mehr");
    assert.match(mig.text, /DROP INDEX IF EXISTS wal_org_worker_start_idx/,
      "Migration 228 nennt keinen Rollback-Weg");
    assert.match(mig.text, /CONCURRENTLY/,
      "Migration 228 sagt nichts zum Betriebshinweis: CREATE INDEX ohne CONCURRENTLY "
      + "nimmt eine Schreibsperre, und auf einer grossen Tabelle gehoert das in ein "
      + "eigenes Skript ausserhalb jeder Transaktion");
  });

  it("die Abfrage, die den Index braucht, hat noch diese Form", () => {
    /* DIE BINDUNG AN DIE WIRKUNG. Ohne sie prüft alles darüber nur, dass eine
     * Migration eine Zeile enthält. Zieht die AÜG-Abfrage um oder ändert ihre
     * Spalten, wird das hier rot — und nicht erst, wenn jemand bei 300 Kunden
     * eine langsame Übersicht meldet. */
    const svc = fs.readFileSync(path.join(ROOT, "api", "services", "auegFristService.js"), "utf8");
    const stellen = [...svc.matchAll(/WHERE wal\.org_id = \$1\s*\n\s*AND wal\.worker_user_id/g)];
    assert.ok(stellen.length >= 2,
      `nur ${stellen.length} AÜG-Abfragen mit der Form (org_id, worker_user_id) gefunden, `
      + "erwartet mindestens 2 (ladeZeitraeume, ladeAuegKontenFuerOrg). Ist die Abfrage "
      + "umgezogen, stützt der Index niemanden mehr.");
    assert.match(svc, /ORDER BY wal\.start_date ASC/,
      "die AÜG-Abfrage sortiert nicht mehr nach start_date — dann ist die dritte "
      + "Spalte des Index ohne Zweck");
  });

  it("kein anderer Index auf der Tabelle führt schon mit org_id", () => {
    /* Gegen den stillen Doppel-Index: zwei Indizes mit derselben führenden
     * Spalte kosten Schreibarbeit und bringen nichts. Die Tabelle hat 46
     * Spalten und wird bei jeder Bestaetigung geschrieben. */
    const treffer = [...ALLE.matchAll(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)\s*\n?\s*ON worker_assignment_links\s*\(org_id/g)]
      .map((m) => m[1]);
    assert.deepEqual([...new Set(treffer)], ["wal_org_worker_start_idx"],
      `mehr als ein Index auf worker_assignment_links führt mit org_id: ${treffer.join(", ")}. `
      + "Zwei Indizes mit derselben führenden Spalte kosten Schreibarbeit und bringen nichts.");
  });
});

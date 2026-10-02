/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WIE VIELE KRÄFTE BRAUCHT EIN BEDARF? (Owner-Punkt 14)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER DEFEKT, gemessen am 2026-10-02: `demand_requests.required_total_count`
 * hatte `DEFAULT 1` und `NOT NULL`. Die Rückfallkette im Lesepfad lautet
 *
 *     GREATEST(COALESCE(dr.required_total_count, dr.headcount, 1), 1)
 *
 * und erreichte `headcount` damit **niemals**: der Wert ist 1, nicht NULL. Ein
 * Bedarf, den nicht der eigene Dienst angelegt hat — Rohinsert, Import, älterer
 * Pfad — sagte „ich brauche drei" und wurde kaufmännisch als „einer" gelesen.
 * Folge: eine Zeitarbeitsfirma bietet genau die drei verlangten Kräfte an und
 * bekommt `OVERFILL_NOT_ALLOWED: requested 3, remaining 1`.
 *
 * Die Kette war richtig gedacht. Kaputt war die **Vorgabe**.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WAS DIESE PROBE HÄLT — UND WARUM GERADE DAS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Eine Vorgabe kommt leise zurück: ein `ALTER COLUMN ... SET DEFAULT 1` in einer
 * künftigen Migration ist eine Zeile, niemand merkt es, und der Defekt ist
 * wieder da — mit **genau** demselben Erscheinungsbild. Deshalb wird hier nicht
 * das Symptom geprüft, sondern die drei Dinge, die es verhindern:
 *
 *   1. keine Migration setzt die Vorgabe zurück (und 229 entfernt sie wirklich)
 *   2. der Lesepfad fällt weiter auf `headcount` zurück — das ist die Kette,
 *      die die Vorgabe sabotiert hat; verschwindet sie, hilft die Nullbarkeit
 *      nichts mehr
 *   3. der eigene Schreibpfad setzt die Spalte weiter aus `headcount` — ohne das
 *      entstehen ab sofort Bedarfe mit NULL, und NULL ist nur so lange harmlos,
 *      wie die Kette unter (2) steht
 *
 * KEIN `GREATEST(required, headcount)` IM LESEPFAD, und das ist eine eigene
 * Zusicherung: es wäre die naheliegende „Härtung" und würde ein kleineres
 * `required` **dauerhaft verbieten**. Sobald „Teilfreigabe eines Bedarfs" ein
 * Produktmerkmal wird, müsste sie zurückgebaut werden. Die Spalte bleibt die
 * einzige Wahrheit der Füll-Logik; die kaufmännische Frage bleibt offen statt
 * verbaut.
 *
 * Run: node --test --test-force-exit test/bedarfMengeIstDieWahrheit.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hasDb, createPool } from "./integration/helpers.js";

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
const lies = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const MIGRATIONEN = ROOT
  ? fs.readdirSync(path.join(ROOT, "sql", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(ROOT, "sql", "migrations", f), "utf8") }))
  : [];

suite("Punkt 14 — die Menge eines Bedarfs lügt nicht mehr", () => {

  it("die Migrationen werden wirklich gelesen", () => {
    assert.ok(MIGRATIONEN.length > 200,
      `nur ${MIGRATIONEN.length} Migrationen gefunden — die Suche greift nicht mehr`);
    assert.ok(MIGRATIONEN.some((m) => m.name.startsWith("229_")),
      "Migration 229 gibt es nicht mehr — dann ist der Defekt zurück");
  });

  it("KEINE Migration setzt die Vorgabe auf required_total_count zurück", () => {
    /* Der eigentliche Wächter. Eine Vorgabe kommt in EINER Zeile zurück, und das
     * Erscheinungsbild des Defekts ist danach identisch. */
    /* NUR MIGRATIONEN NACH 229, und das ist keine Nachlässigkeit.
     *
     * Erster Entwurf prüfte alle — und klagte `070_emergency_partial_commitments`
     * an, die Migration, die die Spalte EINGEFÜHRT hat. Damals war die Vorgabe
     * legitim; dass sie falsch war, zeigte sich erst mit der Rückfallkette im
     * Lesepfad. Migrationen sind anhängend und nummeriert: was vor 229 steht, ist
     * Geschichte und von 229 aufgehoben. Gefährlich ist nur, was DANACH kommt.
     *
     * Eine Probe, die Geschichte anklagt, wird abgeschaltet — und mit ihr die
     * Zusicherung, die sie eigentlich tragen sollte. */
    const nummer = (name) => Number((name.match(/^(\d+)/) || [])[1] || 0);
    const zurueck = [];
    for (const m of MIGRATIONEN) {
      if (nummer(m.name) <= 229) continue;
      const ohneKommentar = m.text.replace(/--[^\n]*/g, " ");
      if (/required_total_count\s+SET\s+DEFAULT/i.test(ohneKommentar)
        || /ALTER COLUMN required_total_count[^;]*SET DEFAULT/i.test(ohneKommentar)) {
        zurueck.push(m.name);
      }
    }
    /* Und die Gegenprobe, damit die Nummern-Grenze nicht alles wegfiltert:
     * 070 MUSS die Vorgabe setzen (sie hat die Spalte angelegt), 229 MUSS sie
     * entfernen. Ohne diese beiden Belege wäre die Zusicherung oben leer grün —
     * genau der Fall, in dem eine „nicht"-Prüfung nichts prüft. */
    const einfuehrung = MIGRATIONEN.filter((m) => nummer(m.name) < 229)
      .filter((m) => /required_total_count[^;]*DEFAULT 1/i.test(m.text.replace(/--[^\n]*/g, " ")));
    assert.ok(einfuehrung.length >= 1,
      "keine Migration vor 229 setzt eine Vorgabe auf required_total_count — dann prueft "
      + "die Nummern-Grenze dieser Zusicherung nichts, und sie waere leer gruen");
    assert.deepEqual(zurueck, [],
      `Diese Migrationen setzen eine Vorgabe auf required_total_count: ${zurueck.join(", ")}. `
      + "Damit ist \"nicht angegeben\" wieder von \"eine Person verlangt\" nicht zu "
      + "unterscheiden, und die Rueckfallkette erreicht headcount nie — der Defekt aus "
      + "Punkt 14 ist zurueck, mit genau demselben Erscheinungsbild.");
  });

  it("Migration 229 entfernt Vorgabe UND NOT NULL — beides ist nötig", () => {
    const m = MIGRATIONEN.find((x) => x.name.startsWith("229_"));
    const ohneKommentar = m.text.replace(/--[^\n]*/g, " ");
    assert.match(ohneKommentar, /ALTER COLUMN required_total_count DROP DEFAULT/i,
      "229 entfernt die Vorgabe nicht");
    assert.match(ohneKommentar, /ALTER COLUMN required_total_count DROP NOT NULL/i,
      "229 macht die Spalte nicht nullbar — ohne das kann NULL nicht entstehen, und "
      + "die Rueckfallkette greift nie");
    /* Und der Rollback-Weg, CLAUDE.md-Pflicht. Hier ist er exakt moeglich, weil
     * alle fuenf betroffenen Zeilen vorher genau 1 trugen (gemessen) — das steht
     * im Kopf der Migration und ist der Grund, warum ein Rollback nicht raet. */
    assert.match(m.text, /SET required_total_count = 1/,
      "229 nennt keinen Rollback-Weg fuer die nachgezogenen Zeilen");
    assert.match(m.text, /SET NOT NULL/,
      "229 nennt im Rollback nicht, wie NOT NULL zurueckkommt");
  });

  it("der Lesepfad fällt weiter auf headcount zurück", () => {
    /* Die Kette, die die Vorgabe sabotiert hat. Verschwindet sie, ist die
     * Nullbarkeit aus 229 wertlos — dann liest der Dienst NULL als 1 oder bricht. */
    const mp = lies("api/services/marketplaceService.js");
    assert.match(mp, /COALESCE\(dr\.required_total_count, dr\.headcount, 1\)/,
      "die SQL-Rueckfallkette auf headcount ist weg");
    assert.match(mp, /demand\?\.required_total_count \?\? demand\?\.headcount/,
      "die JS-Rueckfallkette auf headcount ist weg");

    /* Und im Notdienst dieselbe Kette. Dort stand `required_total_count || 1`,
     * was aus NULL wieder eine 1 gemacht haette — derselbe Fehler, anderer Grund.
     * Zwei verschiedene Ketten fuer dieselbe Frage sind auf Dauer eine Kette, und
     * zwar die schwaechere von beiden. */
    const ec = lies("api/services/emergencyCommitmentService.js");
    assert.match(ec, /required_total_count \?\? demand\.headcount/,
      "der Notdienst faellt nicht auf headcount zurueck");

    /* OHNE KOMMENTARE, und das ist der fuenfte Fall dieser Falle in diesem
     * Projekt: die Zusicherung „kein `|| 1` mehr" war rot, weil die ERKLAERUNG
     * daneben genau diese Zeichenkette zitiert — die Probe las ihre eigene
     * Begruendung. Kommentare raus, dann prueft sie Code. */
    const ecCode = ec.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    assert.ok(!/required_total_count \|\| 1/.test(ecCode),
      "der Notdienst liest required_total_count weiter mit `|| 1` — das macht aus NULL "
      + "wieder eine 1 und stellt den Defekt an dieser Stelle wieder her");
    assert.match(ec, /SELECT id, urgency, status, headcount, required_total_count/,
      "die FOR-UPDATE-Auswahl des Notdienstes holt headcount nicht — dann kann die "
      + "Rueckfallkette dort gar nicht greifen, egal wie sie geschrieben ist");
  });

  it("KEIN GREATEST(required, headcount) im Lesepfad — die Frage bleibt offen", () => {
    /* Die naheliegende „Haertung", die man nicht bauen darf: sie verbietet ein
     * kleineres `required` dauerhaft und muesste zurueckgebaut werden, sobald
     * Teilfreigabe ein Produktmerkmal wird. */
    for (const rel of ["api/services/marketplaceService.js",
      "api/services/capacityExchangeService.js", "api/services/matchingEngine.js"]) {
      const t = lies(rel);
      assert.ok(!/GREATEST\(\s*(?:dr\.)?required_total_count\s*,\s*(?:dr\.)?headcount/i.test(t),
        `${rel} erzwingt required >= headcount per GREATEST. Das verbietet eine `
        + "Teilfreigabe dauerhaft — die Spalte soll die einzige Wahrheit der Fuell-Logik "
        + "bleiben, nicht eine Untergrenze aus dem Lesepfad.");
    }
  });

  it("der eigene Schreibpfad setzt die Spalte weiter aus headcount", () => {
    /* Ohne das entstehen ab sofort Bedarfe mit NULL — harmlos nur so lange, wie
     * die Rueckfallkette oben steht. Zwei Zusagen, die einander stuetzen: also
     * beide pruefen. */
    const mp = lies("api/services/marketplaceService.js");
    const i = mp.indexOf("INSERT INTO demand_requests");
    assert.ok(i > 0, "der Einfuege-Befehl fuer demand_requests ist weg");
    const block = mp.slice(i, i + 2600);
    assert.match(block, /required_total_count, remaining_open_count, currently_committed_count/,
      "der Einfuege-Befehl fuehrt required_total_count nicht mehr");
    const ausHeadcount = (block.match(/payload\.headcount \?\? 1/g) || []).length;
    assert.ok(ausHeadcount >= 3,
      `nur ${ausHeadcount} Parameter stammen aus payload.headcount, erwartet mindestens 3 `
      + "(headcount, required_total_count, remaining_open_count). Setzt der Dienst die "
      + "Spalte nicht mehr, entstehen Bedarfe mit NULL — und die sind nur so lange "
      + "harmlos, wie die Rueckfallkette steht.");
  });
});

/**
 * Die scharfe Hälfte: am BESTAND. Eine Textprobe sieht nicht, was in der Spalte
 * steht — und genau darin lag der Defekt.
 */
describe("Punkt 14 am Bestand — keine Zeile verlangt weniger, als sie braucht",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("die Vorgabe ist weg und die Spalte ist nullbar", async () => {
    const pool = createPool();
    try {
      const { rows } = await pool.query(
        `SELECT column_default, is_nullable FROM information_schema.columns
          WHERE table_name = 'demand_requests' AND column_name = 'required_total_count'`);
      assert.equal(rows.length, 1, "die Spalte required_total_count gibt es nicht mehr");
      assert.equal(rows[0].column_default, null,
        `required_total_count hat wieder eine Vorgabe (${rows[0].column_default}) — damit ist `
        + "\"nicht angegeben\" wieder ununterscheidbar von \"eine Person\"");
      assert.equal(rows[0].is_nullable, "YES",
        "required_total_count ist wieder NOT NULL — dann kann NULL nicht entstehen");
    } finally { await pool.end(); }
  });

  it("kein Bedarf sagt, er brauche weniger Kräfte als sein headcount", async () => {
    const pool = createPool();
    try {
      const { rows } = await pool.query(
        `SELECT id, headcount, required_total_count, status FROM demand_requests
          WHERE required_total_count IS NOT NULL AND headcount IS NOT NULL
            AND required_total_count < headcount
          ORDER BY status LIMIT 20`);
      assert.deepEqual(rows, [],
        `${rows.length} Bedarf(e) verlangen weniger, als sie brauchen:\n  `
        + rows.map((r) => `${r.id}  headcount=${r.headcount} required=${r.required_total_count} (${r.status})`).join("\n  ")
        + "\n\nSo ein Bedarf ist nicht erfuellbar: eine Zeitarbeitsfirma bietet genau die "
        + "verlangte Zahl an und bekommt OVERFILL_NOT_ALLOWED, ohne erkennbaren Grund.");
    } finally { await pool.end(); }
  });

  it("ein Rohinsert erbt keine 1 mehr — und der Lesepfad liefert headcount", async () => {
    /* DIE PROBE, DIE DEN DEFEKT WIRKLICH NACHSTELLT. Alles andere prueft Form;
     * das hier prueft das Verhalten, und zwar auf dem Weg, auf dem der Defekt
     * entstand: ein Einfuegen OHNE die Spalte. In einer Transaktion, die
     * zurueckgerollt wird. */
    const pool = createPool();
    try {
      await pool.query("BEGIN");
      const { rows: vorhanden } = await pool.query(
        "SELECT requester_company_id FROM demand_requests WHERE requester_company_id IS NOT NULL LIMIT 1");
      if (!vorhanden.length) { await pool.query("ROLLBACK"); return; }
      const { rows } = await pool.query(
        `INSERT INTO demand_requests (requester_company_id, title, role, status, headcount, start_date, location_city)
         VALUES ($1, 'Punkt-14-Probe', 'Lagerhelfer:in', 'open', 3, CURRENT_DATE, 'Koeln')
         RETURNING required_total_count,
                   GREATEST(COALESCE(required_total_count, headcount, 1), 1) AS gelesen`,
        [vorhanden[0].requester_company_id]);
      assert.equal(rows[0].required_total_count, null,
        "ein Einfuegen ohne die Spalte erzeugt wieder einen Wert — dann ist die Vorgabe "
        + "zurueck, und der Defekt mit ihr");
      assert.equal(rows[0].gelesen, 3,
        `die Rueckfallkette liefert ${rows[0].gelesen} statt 3 — sie erreicht headcount nicht`);
    } finally {
      await pool.query("ROLLBACK").catch(() => {});
      await pool.end();
    }
  });
});

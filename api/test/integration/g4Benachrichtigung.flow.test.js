/**
 * Gate G4 gegen das REALE Schema — die Meldung erreicht das Buero.
 *
 * WARUM ES DIESEN ZWEITEN TEST BRAUCHT
 * `test/g4BenachrichtigungBuero.test.js` sichert ueber einen Mock-Pool ab,
 * WELCHE Statements laufen, wer Empfaenger wird und was NICHT mitfaehrt. Was ein
 * Mock grundsaetzlich nicht kann: einen CHECK-Constraint erzwingen. Er nimmt
 * jeden Typ an, auch einen, den die Datenbank ablehnt.
 *
 * Genau daran ist diese Codebasis schon einmal gescheitert: vier Typen wurden
 * dispatched, standen aber nicht im CHECK von `notifications.type` — die INSERTs
 * scheiterten STILL, und es fiel erst auf, als jemand eine ausbleibende
 * Benachrichtigung suchte. Migration 139 musste die Drift schliessen, Migration
 * 171 hat die Methode korrigiert, 183 folgt ihr.
 *
 * Diese Datei belegt an der echten Datenbank:
 *   1. dass eine Benachrichtigung mit den neuen Typen wirklich DURCHGEHT,
 *   2. dass ein erfundener Typ weiterhin ABGEWIESEN wird (der Constraint lebt
 *      noch — eine erweiterte Liste, die alles erlaubt, waere schlimmer als
 *      eine zu enge),
 *   3. dass die additive Migration den Altbestand nicht verloren hat.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 * Run: docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/g4Benachrichtigung.flow.test.js"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";
import { getMatrix } from "../../services/notificationMatrix.js";

const NEUE_TYPEN = ["worker_absence_reported", "worker_delay_reported"];

describe("Welle G4 — die Meldungstypen am realen Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let org;
  let nutzer;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    org = await createSupplierOrg(pool, "G4 Testagentur");

    /* 'agency' und nicht 'user': users_role_check kennt genau drei Werte
     * (company | agency | worker). Der Empfaenger einer Abwesenheitsmeldung
     * sitzt in der Zeitarbeitsfirma — 'agency' ist hier also nicht nur erlaubt,
     * sondern auch fachlich der richtige Fall. */
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, 'x', 'agency') RETURNING id`,
      [`g4-dispo-${Date.now()}@test.local`]
    );
    nutzer = rows[0].id;
  });

  after(async () => {
    if (!hasDb || !pool) return;
    /* Aufraeumen in Abhaengigkeitsreihenfolge — die Benachrichtigungen zuerst,
     * sonst haelt der Fremdschluessel den Nutzer fest. */
    if (nutzer) {
      await pool.query("DELETE FROM notifications WHERE user_id = $1", [nutzer]);
      await pool.query("DELETE FROM users WHERE id = $1", [nutzer]);
    }
    await pool.end();
  });

  it("die neuen Typen sind im CHECK angekommen — beide", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'notifications'::regclass
          AND conname  = 'notifications_type_check'`
    );
    assert.ok(rows[0], "der CHECK auf notifications.type fehlt ganz");
    for (const typ of NEUE_TYPEN) {
      assert.ok(rows[0].def.includes(typ),
        `${typ} fehlt im CHECK — Migration 183 ist in dieser Datenbank nicht angewendet, ` +
        "und jeder INSERT dieses Typs scheitert STILL");
    }
  });

  it("die additive Migration hat den Altbestand nicht verloren", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'notifications'::regclass
          AND conname  = 'notifications_type_check'`
    );
    /* Stichproben aus verschiedenen Epochen der Typliste. Waere die Migration
     * eine abgeschriebene Liste gewesen, fehlte hier der juengste Wert. */
    for (const alt of ["requisition_approval", "timesheet_signed", "bounty_lost"]) {
      assert.ok(rows[0].def.includes(alt),
        `${alt} ist aus dem CHECK verschwunden — die Migration hat die Liste ` +
        "ueberschrieben statt sie zu erweitern");
    }
  });

  it("eine Benachrichtigung mit dem neuen Typ geht wirklich durch", async () => {
    const m = getMatrix();
    for (const ereignis of ["worker.absence_reported", "worker.delay_reported"]) {
      const cfg = m[ereignis];
      const { rows } = await pool.query(
        `INSERT INTO notifications (user_id, org_id, type, title, message, severity, link_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, type, severity, link_path`,
        [nutzer, org, cfg.type, cfg.title, "Testmeldung", cfg.severity, cfg.linkPath]
      );
      assert.equal(rows.length, 1, `${cfg.type} wurde von der Datenbank abgewiesen`);
      assert.equal(rows[0].type, cfg.type);
      /* Auch die SEVERITY hat einen eigenen CHECK. Ein Wert, den die Matrix
       * fuehrt, die Datenbank aber nicht kennt, waere dieselbe stille Falle
       * eine Spalte weiter rechts. */
      assert.equal(rows[0].severity, cfg.severity);
    }
  });

  it("ein erfundener Typ wird weiterhin abgewiesen — der Constraint lebt", async () => {
    await assert.rejects(
      () => pool.query(
        `INSERT INTO notifications (user_id, type, title) VALUES ($1, $2, $3)`,
        [nutzer, "worker_absence_reportet" /* Tippfehler */, "Test"]
      ),
      (err) => err.code === "23514",
      "ein unbekannter Typ ging durch — die Typliste erlaubt inzwischen alles, " +
      "und der CHECK schuetzt vor gar nichts mehr"
    );
  });

  it("der Deep-Link ueberlebt die Spalte unveraendert", async () => {
    /* link_path traegt Fragezeichen und Raute. Waere die Spalte zu kurz oder
     * wuerde irgendwo beschnitten, fuehrte der Verweis auf die ungefilterte
     * Uebersicht — das Gate waere formal erfuellt und praktisch verfehlt. */
    const link = "/public/mitarbeiter.html?person=" + "a".repeat(36) + "#live-abwesend";
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, link_path)
       VALUES ($1, 'worker_absence_reported', 'Test', $2)
       RETURNING link_path`,
      [nutzer, link]
    );
    assert.equal(rows[0].link_path, link, "der Verweis wurde von der Datenbank veraendert");
  });
});

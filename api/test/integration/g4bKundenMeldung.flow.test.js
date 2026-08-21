/**
 * Gate G4b gegen das REALE Schema — der Kunde erfaehrt, DASS, nie WARUM.
 *
 * WAS EIN MOCK HIER GRUNDSAETZLICH NICHT KANN:
 *  1. Einen CHECK erzwingen. Er nimmt jeden Typ und jede severity an — auch
 *     solche, die Postgres ablehnt. Genau daran ist diese Codebasis bei
 *     Migration 139 schon einmal gescheitert (INSERTs scheiterten STILL), und
 *     genau daran scheitern seit jeher vier Notdienst-Ereignisse mit
 *     severity 'urgent' — gefunden beim Bauen dieser Welle.
 *  2. Die JOIN-Kette belegen, die den Kunden vom Lieferanten trennt.
 *     `assignments.org_id` ist der Besteller, `supplier_org_id` der Lieferant;
 *     ein Mock beantwortet beide Spalten gleich, und die Verwechslung — die
 *     Ausfallmeldung geht an den Arbeitgeber statt an den Kunden — saehe in
 *     einem Ergebnis-Test identisch aus.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 * Run: docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/g4bKundenMeldung.flow.test.js"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";
import { getMatrix, ERLAUBTE_SEVERITY } from "../../services/notificationMatrix.js";
import { folgenVorschau, kundeIstEmpfangsberechtigt } from "../../services/workerAbsenceService.js";

const EVENTS = ["assignment.worker_unavailable", "assignment.worker_replaced"];

describe("Welle G4b — Kundenmeldung am realen Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool, lieferant, kundeOrg, nutzer;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    lieferant = await createSupplierOrg(pool, "G4b Zeitarbeit");
    kundeOrg = await createSupplierOrg(pool, "G4b Einsatzbetrieb");
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1,'x','company') RETURNING id`,
      [`g4b-kunde-${Date.now()}@test.local`]
    );
    nutzer = rows[0].id;
  });

  after(async () => {
    if (!hasDb || !pool) return;
    if (nutzer) {
      await pool.query("DELETE FROM notifications WHERE user_id = $1", [nutzer]);
      await pool.query("DELETE FROM users WHERE id = $1", [nutzer]);
    }
    await pool.end();
  });

  it("beide Kundentypen sind im CHECK angekommen", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='notifications'::regclass AND conname='notifications_type_check'`
    );
    const m = getMatrix();
    for (const e of EVENTS) {
      assert.ok(rows[0].def.includes(m[e].type),
        `${m[e].type} fehlt im CHECK — Migration 184 ist hier nicht angewendet, ` +
        "und jeder INSERT dieses Typs scheitert STILL");
    }
  });

  it("Migration 184 hat den Altbestand nicht verloren", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='notifications'::regclass AND conname='notifications_type_check'`
    );
    for (const alt of ["requisition_approval", "timesheet_signed", "worker_absence_reported"]) {
      assert.ok(rows[0].def.includes(alt),
        `${alt} ist verschwunden — die Migration hat die Liste ueberschrieben statt erweitert`);
    }
  });

  it("die erlaubten severity-Werte stimmen mit der Konstante ueberein", async () => {
    /* Die Konstante im Code ist eine BEHAUPTUNG ueber die Datenbank. Hier wird
     * sie geprueft — sonst driftet sie beim naechsten CHECK-Umbau lautlos.
     *
     * BEFUND M0-B9 (2026-08-21): dieser Test war wochenlang rot, und zwar aus
     * einem anderen Grund als dem, den er melden wollte. Er suchte die Werte
     * als `'info'` — mit Anfuehrungszeichen — im Text des Constraints. Postgres
     * gibt ihn aber je nach Schreibweise unterschiedlich aus:
     *     CHECK (severity IN ('a','b'))        -> ... = ANY (ARRAY['a'::text, ...])
     *     CHECK (severity = ANY ('{a,b}'))     -> ... = ANY ('{a,b}'::text[])
     * In der zweiten Form steht KEIN einziger Wert in Anfuehrungszeichen. Die
     * erste Zusicherung schlug also schon bei `info` fehl — und verdeckte damit
     * genau den Befund, den die zweite finden sollte: die laufende Datenbank
     * erlaubte ein fuenftes `urgent`, das keine Migration je gewaehrt hat.
     *
     * Jetzt werden die Werte AUSGELESEN statt gesucht, und beide Richtungen
     * geprueft. Das ist strenger als vorher: es faellt nicht nur auf, wenn ein
     * bekannter Wert fehlt, sondern auch, wenn ein unbekannter dazukommt —
     * gleich welcher. */
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='notifications'::regclass AND conname='notifications_severity_check'`
    );
    assert.ok(rows[0], "der severity-CHECK fehlt ganz");
    const def = rows[0].def;

    // Beide Schreibweisen: 'wert'::text und der blanke Inhalt von '{a,b}'.
    const erlaubt = new Set();
    for (const t of def.matchAll(/'([^']+)'(?:::text)?/g)) {
      const wert = t[1];
      if (wert.startsWith("{") && wert.endsWith("}")) {
        wert.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean)
          .forEach((x) => erlaubt.add(x));
      } else {
        erlaubt.add(wert);
      }
    }
    assert.ok(erlaubt.size > 0, `aus dem CHECK liess sich kein Wert lesen: ${def}`);

    const fehlend = ERLAUBTE_SEVERITY.filter((s) => !erlaubt.has(s));
    assert.deepEqual(fehlend, [],
      `steht in der Konstante, aber nicht im CHECK: ${fehlend.join(", ")} — CHECK ist ${def}`);

    const zuviel = [...erlaubt].filter((s) => !ERLAUBTE_SEVERITY.includes(s));
    assert.deepEqual(zuviel, [],
      `der CHECK erlaubt mehr als die Konstante kennt: ${zuviel.join(", ")}. Dann darf ` +
      "ERLAUBTE_SEVERITY das auch — und Toast-Varianten sowie Stufen-Abbildung im " +
      "Frontend brauchen den Wert. Siehe Migration 185 und Befund M0-B9.");
  });

  it("jede severity der Matrix geht wirklich durch", async () => {
    /* Der Beweis, dass der Bestandsfehler behoben ist: JEDES Ereignis der
     * Matrix wird einmal eingefuegt. Vorher scheiterten vier davon. */
    const m = getMatrix();
    const gescheitert = [];
    for (const [key, cfg] of Object.entries(m)) {
      try {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, severity) VALUES ($1,$2,$3,$4)`,
          [nutzer, cfg.type, cfg.title, cfg.severity]
        );
      } catch (e) {
        gescheitert.push(`${key} (type=${cfg.type}, severity=${cfg.severity}): ${e.code}`);
      }
    }
    assert.deepEqual(gescheitert, [],
      "diese Matrix-Ereignisse werden von der Datenbank abgewiesen — ihre " +
      "Benachrichtigungen entstehen NIE:\n  " + gescheitert.join("\n  "));
  });

  it("folgenVorschau liefert Kunde und Verknuepfung getrennt — gegen echtes SQL", async () => {
    /* Kein Treffer erwartet (erfundene Profil-ID). Der Wert liegt darin, dass
     * Postgres die VOLLE Abfrage parst und plant: Ein Tippfehler in a.org_id
     * oder wal.org_id, den der Mock durchlaesst, faellt hier auf. */
    const r = await folgenVorschau(pool, lieferant, {
      workerProfileId: "00000000-0000-0000-0000-000000000000",
      von: "2026-08-19",
    });
    assert.ok(Array.isArray(r.einsaetze), "die Abfrage hat nicht sauber ausgefuehrt");
    assert.equal(r.anzahl, 0);
  });

  it("die Trennung Kunde/Lieferant ist im Schema echt vorhanden", async () => {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name='assignments' AND column_name IN ('org_id','supplier_org_id')
        ORDER BY column_name`
    );
    assert.equal(rows.length, 2, "assignments trennt Besteller und Lieferant nicht mehr");
    /* Beide sind nullable — deshalb prueft kundeIstEmpfangsberechtigt() auf
     * KEIN_KUNDE, statt sich auf eine Constraint zu verlassen, die es nicht gibt. */
    assert.ok(rows.every((r) => r.is_nullable === "YES"),
      "eine der Spalten ist jetzt NOT NULL — dann darf die KEIN_KUNDE-Pruefung entfallen");
  });

  it("ein Selbstbezug wird abgewiesen — und den gibt es in echten Daten", async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM worker_assignment_links WHERE org_id = supplier_org_id`
    );
    /* Kein assert auf die Zahl: Sie darf 0 sein (frische Datenbank). Geprueft
     * wird, dass die Regel den Fall trifft, WENN er auftritt. */
    const r = kundeIstEmpfangsberechtigt({ kunde_org_id: lieferant }, lieferant);
    assert.equal(r.erlaubt, false);
    assert.equal(r.grund, "KUNDE_IST_LIEFERANT");
    assert.ok(rows[0].n >= 0);
  });

  it("eine Kundenmeldung traegt die Empfaenger-Org, nicht die des Absenders", async () => {
    const m = getMatrix();
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, org_id, type, title, message, entity_type, entity_id, severity, link_path)
       VALUES ($1,$2,$3,$4,$5,'assignment',$6,$7,$8)
       RETURNING org_id, entity_type, severity`,
      [
        nutzer, kundeOrg,
        m["assignment.worker_unavailable"].type,
        m["assignment.worker_unavailable"].title,
        "Max Mustermann (Müller GmbH) faellt aus · ab 2026-08-19 · voraussichtlich bis 2026-08-25.",
        "00000000-0000-0000-0000-000000000001",
        m["assignment.worker_unavailable"].severity,
        "/public/company-timesheets.html?einsatz=x#live",
      ]
    );
    assert.equal(rows[0].org_id, kundeOrg);
    assert.notEqual(rows[0].org_id, lieferant);
    assert.equal(rows[0].entity_type, "assignment");
  });
});

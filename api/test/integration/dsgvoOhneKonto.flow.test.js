/**
 * Gate D6 gegen das REALE Schema — Auskunft und Löschung ohne Konto.
 *
 * WARUM DB-GESTUETZT
 * Dieser Pfad liest neun Tabellen. Ein Mock-Pool antwortet auf jede gleich —
 * ein vertippter Spaltenname faellt dort nie auf. Genau so entstand P1-15
 * (zwei Spalten, die es nicht gab, mit gruenen Tests darueber). Beim Bauen
 * dieses Dienstes hat die Schema-Probe drei falsche Spaltennamen gefunden,
 * bevor sie Code wurden — `work_date`, `file_name`, `uploaded_at`.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, createPool, createSupplierOrg } from "./helpers.js";
import * as gov from "../../services/workerProfileGovernanceService.js";

describe("Welle D6 — DSGVO fuer Menschen ohne Konto", { skip: !hasDb && "No database configured" }, () => {
  let pool, org, fremdeOrg, ohneKonto, mitKonto, nutzer;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    org = await createSupplierOrg(pool, "D6 Testagentur");
    fremdeOrg = await createSupplierOrg(pool, "D6 Fremde Agentur");
    const stempel = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    const { rows: a } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number, phone, city, notes)
       VALUES (NULL, $1, 'Ohne', 'Konto', $2, '0170-1234', 'Kiel', 'interne Notiz') RETURNING id`,
      [org, `D6A-${stempel}`]
    );
    ohneKonto = a[0].id;

    const { rows: u } = await pool.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'worker') RETURNING id`,
      [`d6-${stempel}@test.tempconnect.invalid`]
    );
    nutzer = u[0].id;
    const { rows: b } = await pool.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name, personnel_number)
       VALUES ($1, $2, 'Mit', 'Konto', $3) RETURNING id`,
      [nutzer, org, `D6B-${stempel}`]
    );
    mitKonto = b[0].id;

    // Personenbezogenes am PROFIL — das ist alles, was ein Mensch ohne Konto haben kann.
    await pool.query(
      `INSERT INTO worker_absences (worker_profile_id, supplier_org_id, art, von, bis, notiz)
       VALUES ($1, $2, 'krank', CURRENT_DATE - 5, CURRENT_DATE - 3, 'Diagnose vom Arzt')`,
      [ohneKonto, org]
    );
  });

  after(async () => {
    if (!hasDb || !pool) return;
    const orgs = [org, fremdeOrg];
    for (const sql of [
      "DELETE FROM worker_status_events WHERE supplier_org_id = ANY($1::uuid[])",
      "DELETE FROM worker_absences WHERE supplier_org_id = ANY($1::uuid[])",
      "DELETE FROM worker_invites WHERE supplier_org_id = ANY($1::uuid[])",
      "DELETE FROM worker_profiles WHERE supplier_org_id = ANY($1::uuid[])"
    ]) await pool.query(sql, [orgs]).catch(() => {});
    await pool.query("DELETE FROM audit_log WHERE entity_type = 'worker_profile'").catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [nutzer]).catch(() => {});
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [orgs]).catch(() => {});
    await pool.end();
  });

  /* ── Auskunft ────────────────────────────────────────────────────────────── */

  it("die Auskunft laeuft fuer ein Profil OHNE Konto vollstaendig durch", async () => {
    const e = await gov.exportWorkerProfileData(pool, org, ohneKonto);
    assert.ok(!e.error, e.error || "");
    assert.strictEqual(e.hat_konto, false, "und sagt ausdruecklich, dass es kein Konto gibt");
    assert.strictEqual(e.stammdaten.vorname, "Ohne");
    assert.strictEqual(e.stammdaten.telefon, "0170-1234");
    assert.strictEqual(e.abwesenheiten.length, 1);
    assert.strictEqual(e.abwesenheiten[0].notiz, "Diagnose vom Arzt");
    // Der Zustandsverlauf entsteht durch die Trigger aus Welle E5.
    assert.ok(e.zustandsverlauf.length >= 1, "auch das Protokoll gehoert zur Auskunft");
  });

  it("dieselbe Funktion liefert fuer ein Profil MIT Konto die Konto-Abschnitte mit", async () => {
    // Gate D6: derselbe Umfang. Die konto-gebundenen Abfragen muessen also
    // wirklich laufen — ein Tippfehler dort faellt nur hier auf.
    const e = await gov.exportWorkerProfileData(pool, org, mitKonto);
    assert.strictEqual(e.hat_konto, true);
    for (const k of ["einsaetze", "stundenzettel", "dokumente", "beschwerden"]) {
      assert.ok(Array.isArray(e[k]), `${k} fehlt`);
    }
  });

  it("ein fremder Betrieb bekommt weder Auskunft noch Loeschung", async () => {
    const e = await gov.exportWorkerProfileData(pool, fremdeOrg, ohneKonto);
    assert.strictEqual(e.error, "ORG_BOUNDARY_VIOLATION");
    assert.strictEqual(e.status, 403);

    const a = await gov.anonymizeWorkerProfile(pool, fremdeOrg, ohneKonto,
      { actorId: null, reason: "Loeschverlangen der Person" });
    assert.strictEqual(a.error, "ORG_BOUNDARY_VIOLATION");
  });

  /* ── Loeschung ───────────────────────────────────────────────────────────── */

  it("ohne Begruendung passiert nichts — und zwar bevor irgendetwas geschrieben wird", async () => {
    const kurz = await gov.anonymizeWorkerProfile(pool, org, ohneKonto, { reason: "weg" });
    assert.strictEqual(kurz.error, "REASON_REQUIRED");
    const { rows } = await pool.query("SELECT first_name FROM worker_profiles WHERE id = $1", [ohneKonto]);
    assert.strictEqual(rows[0].first_name, "Ohne", "der Datensatz ist unangetastet");
  });

  it("die Anonymisierung entfernt die Identifizierenden Angaben und protokolliert sich", async () => {
    const r = await gov.anonymizeWorkerProfile(pool, org, ohneKonto, {
      actorId: null, reason: "Loeschverlangen der betroffenen Person vom 13.08."
    });
    assert.strictEqual(r.success, true);
    assert.ok(r.anonymisierte_tabellen.includes("worker_profiles"));

    const { rows } = await pool.query(
      `SELECT first_name, last_name, phone, city, notes, date_of_birth, is_active
         FROM worker_profiles WHERE id = $1`, [ohneKonto]);
    assert.strictEqual(rows[0].first_name, "[Gelöscht]");
    assert.strictEqual(rows[0].phone, null);
    assert.strictEqual(rows[0].city, null);
    assert.strictEqual(rows[0].notes, null);
    assert.strictEqual(rows[0].is_active, false);

    const { rows: audit } = await pool.query(
      `SELECT action, details FROM audit_log
        WHERE entity_type = 'worker_profile' AND entity_id = $1
        ORDER BY created_at DESC LIMIT 1`, [ohneKonto]);
    assert.strictEqual(audit[0].action, "dsgvo.anonymize_worker_profile");
    assert.ok(String(audit[0].details.reason || "").includes("Loeschverlangen"),
      "die Begruendung steht im Nachweis, nicht nur in der Anfrage");
  });

  it("der Vorgang bleibt, die Person verschwindet — Aufbewahrung vor Loeschung", async () => {
    // HGB §257: die Abwesenheit ist ein Nachweis gegenueber dem Kunden. Der
    // Zeitraum bleibt, die freie Notiz (dort steht Gesundheitliches) geht.
    const { rows } = await pool.query(
      `SELECT art, von, bis, notiz FROM worker_absences WHERE worker_profile_id = $1`, [ohneKonto]);
    assert.strictEqual(rows.length, 1, "die Zeile ist NICHT geloescht");
    assert.strictEqual(rows[0].notiz, null, "die Notiz ist weg");
    assert.strictEqual(rows[0].art, "krank");
  });

  it("zweimal anonymisieren ist kein stiller Erfolg", async () => {
    const r = await gov.anonymizeWorkerProfile(pool, org, ohneKonto,
      { reason: "noch einmal, versehentlich ausgeloest" });
    assert.strictEqual(r.error, "ALREADY_ANONYMIZED");
    assert.strictEqual(r.status, 409);
  });

  it("ein unbekanntes Profil ist 404 — und schreibt nichts", async () => {
    const r = await gov.anonymizeWorkerProfile(pool, org, "00000000-0000-0000-0000-000000000000",
      { reason: "Loeschverlangen einer unbekannten Person" });
    assert.strictEqual(r.error, "NOT_FOUND");
  });
});

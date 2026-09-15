/**
 * Welle N2.10 — die DSGVO-Auskunft liefert, und sie nennt die Einsatzplanung.
 *
 * BEFUND 2026-09-15: `exportUserDataFull` verlangte `users.plan` und
 * `users.is_active` — beide gibt es nicht. `safeQuery` schluckte den Fehler,
 * die Funktion lieferte `null`, und `GET /me/export` antwortete JEDEM Nutzer
 * mit 404. Sechs weitere Abfragen lieferten still leere Abschnitte.
 *
 * Diese Datei pinnt, was ein Muster-Pool pinnen KANN: welche Spalten gelesen
 * werden (und welche nie — Geheimnisse, der Kunde bei einer Vormerkung), woran
 * jede Abfrage gebunden ist, und dass Einladungen und Vormerkungen in der
 * Auskunft ankommen. Ob die Spalten EXISTIEREN, kann ein Muster-Pool nicht
 * wissen — genau daran ist die Auskunft gescheitert. Das pruefen zwei andere
 * Schichten: `sqlSchemaWaechter.test.js` (ohne Datenbank, gegen die
 * Momentaufnahme, fuer diese Datei jetzt OHNE Ausnahme) und
 * `integration/auskunft.flow.test.js` (gegen die echte Datenbank).
 *
 * Run: node --test --test-force-exit test/auskunftFunktioniert.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/dataGovernanceService.js";

const NUTZER = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";

function spurPool(antwort = () => null) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      return antwort(text, params) || { rows: [], rowCount: 0 };
    }
  };
}
const flach = (sql) => sql.replace(/\s+/g, " ");
const abfrage = (pool, muster) => pool.calls.find((c) => muster.test(c.sql));

const MIT_NUTZER = (sql) => (/FROM users WHERE id = \$1/.test(sql)
  ? { rows: [{ id: NUTZER, email: "kraft@example.com" }], rowCount: 1 }
  : null);

describe("N2.10 — die Auskunft liefert ueberhaupt", () => {
  it("die Nutzerabfrage liest nur Spalten, die es gibt — plan und is_active nicht", async () => {
    const pool = spurPool(MIT_NUTZER);
    const erg = await svc.exportUserDataFull(pool, NUTZER);
    assert.notEqual(erg, null, "die Auskunft liefert null");
    const q = abfrage(pool, /FROM users WHERE id = \$1/);
    assert.deepEqual(q.params, [NUTZER]);
    const spalten = flach(q.sql).match(/^SELECT (.+) FROM users/)[1].split(",").map((s) => s.trim());
    assert.equal(spalten.includes("plan"), false, "users.plan gibt es nicht — damit fiel die ganze Auskunft aus");
    assert.equal(spalten.includes("is_active"), false, "users.is_active gibt es nicht");
    for (const muss of ["id", "email", "street", "postal_code", "city", "latitude", "longitude"]) {
      assert.ok(spalten.includes(muss), `die Auskunft verschweigt users.${muss}`);
    }
  });

  it("Geheimnisse des Kontos stehen NIE in der herunterladbaren Datei", async () => {
    const pool = spurPool(MIT_NUTZER);
    await svc.exportUserDataFull(pool, NUTZER);
    const sql = flach(abfrage(pool, /FROM users WHERE id = \$1/).sql);
    assert.equal(/SELECT \*/.test(sql), false, "SELECT * auf users gaebe den Passwort-Hash heraus");
    for (const geheim of ["password_hash", "mfa_secret", "totp_secret", "mfa_backup_codes", "verification_token"]) {
      assert.equal(new RegExp(`\\b${geheim}\\b`).test(sql), false, `${geheim} in der Auskunft`);
    }
  });

  it("die sechs still leeren Abschnitte fragen jetzt die richtige Spalte", async () => {
    const pool = spurPool(MIT_NUTZER);
    await svc.exportUserDataFull(pool, NUTZER);
    const erwartet = [
      [/FROM company_contacts/, /FROM company_contacts WHERE user_id = \$1$/],
      [/FROM requests WHERE requester_id/, /WHERE requester_id = \$1$/],
      [/FROM ratings/, /WHERE rater_id = \$1 OR rated_id = \$1$/],
      [/FROM offers/, /WHERE supplier_company_id = \$1$/],
      [/FROM subscriptions/, /SELECT id, plan, status, .*current_period_end.* FROM subscriptions WHERE user_id = \$1$/],
      [/FROM invoices/, /FROM invoices WHERE user_id = \$1$/]
    ];
    for (const [finde, form] of erwartet) {
      const q = abfrage(pool, finde);
      assert.ok(q, `Abfrage ${finde} fehlt`);
      assert.match(flach(q.sql).trim(), form);
      assert.deepEqual(q.params, [NUTZER]);
    }
    // Je Tabelle die Spalte, die es dort NICHT gibt — nicht im ganzen Text: die
    // Einladungen haben `expires_at` zu Recht.
    for (const [tabelle, falsch] of [
      [/FROM company_contacts/, /company_profile_id/],
      [/FROM requests WHERE/, /\bsender_id\b/],
      [/FROM ratings/, /reviewer_id|reviewee_id/],
      [/FROM offers/, /\bcreated_by\b/],
      [/FROM subscriptions/, /plan_name|expires_at/],
      [/FROM invoices/, /\bcreated_by\b/]
    ]) {
      const treffer = pool.calls.filter((c) => tabelle.test(c.sql) && falsch.test(c.sql));
      assert.deepEqual(treffer.map((c) => flach(c.sql).slice(0, 70)), [], `nicht existierende Spalte ${falsch} wird wieder gefragt`);
    }
  });
});

describe("N2.10 — Einladungen und Vormerkungen stehen in der Auskunft", () => {
  const MARKE_EINLADUNG = { id: "inv-marke", status: "sent", score: 71.5, zeitarbeitsfirma: "ZAF Nord", taetigkeit: "Lager" };
  const MARKE_VORMERKUNG = { id: "wl-marke", status: "queued", queue_rank: 3, score: 64, zeitarbeitsfirma: "ZAF Nord", taetigkeit: "Lager" };
  const welt = (sql) => {
    if (/FROM users WHERE id = \$1/.test(sql)) return { rows: [{ id: NUTZER }], rowCount: 1 };
    if (/FROM assignment_staffing_invites i/.test(sql)) return { rows: [MARKE_EINLADUNG], rowCount: 1 };
    if (/FROM assignment_staffing_waitlist w/.test(sql)) return { rows: [MARKE_VORMERKUNG], rowCount: 1 };
    return null;
  };

  it("beide kommen im Abschnitt B an — mit dem neutralen Hinweis", async () => {
    const pool = spurPool(welt);
    const erg = await svc.exportUserDataFull(pool, NUTZER);
    assert.deepEqual(erg.category_B.staffing.invites, [MARKE_EINLADUNG]);
    assert.deepEqual(erg.category_B.staffing.waitlist, [MARKE_VORMERKUNG]);
    assert.equal(erg.category_B.staffing.notice, svc.EINSATZPLANUNG_HINWEIS);
    // Neutral, nicht alarmierend: sagt, was eine Vormerkung ist und was nicht.
    assert.match(svc.EINSATZPLANUNG_HINWEIS, /weder eine Anfrage noch eine Zusage/);
    assert.match(svc.EINSATZPLANUNG_HINWEIS, /erst, wenn Sie tatsaechlich eingeladen werden/);
  });

  for (const [name, muster, alias] of [
    ["Einladungen", /FROM assignment_staffing_invites i/, "i"],
    ["Vormerkungen", /FROM assignment_staffing_waitlist w/, "w"]
  ]) {
    it(`${name}: gebunden an DIESE Person, mit Firma und Taetigkeit, ohne Kundenunternehmen`, async () => {
      const pool = spurPool(welt);
      await svc.exportUserDataFull(pool, NUTZER);
      const q = abfrage(pool, muster);
      assert.ok(q, `${name}: keine Abfrage`);
      const sql = flach(q.sql);
      assert.deepEqual(q.params, [NUTZER]);
      assert.ok(sql.includes(`WHERE ${alias}.worker_user_id = $1`), `${name} nicht an die Person gebunden`);
      assert.ok(sql.includes(`LEFT JOIN organizations so ON so.id = ${alias}.supplier_org_id`), `${name}: Zeitarbeitsfirma nicht ueber ${alias}.supplier_org_id`);
      assert.ok(sql.includes("so.name AS zeitarbeitsfirma"));
      assert.ok(sql.includes("a.worker_description AS taetigkeit"));
      // Das Kundenunternehmen einer Vormerkung ist Geschaeftsinformation Dritter.
      assert.equal(/\ba\.org_id\b|\.org_id\s*=\s*a\.org_id|buyer|kunde/i.test(sql), false, `${name} nennt das Kundenunternehmen`);
      assert.equal(/\bSELECT \*|\b[iw]\.\*/.test(sql), false, `${name}: Sternchen zieht interne Spalten mit`);
    });
  }

  it("die Vormerkung traegt Rang, Punktzahl und Gruende — das ist der Auskunftsgegenstand", async () => {
    const pool = spurPool(welt);
    await svc.exportUserDataFull(pool, NUTZER);
    const sql = flach(abfrage(pool, /FROM assignment_staffing_waitlist w/).sql);
    for (const sp of ["w.status", "w.queue_rank", "w.score", "w.match_reasons", "w.factor_scores", "w.hard_failures", "w.missing_requirements", "w.removal_reason"]) {
      assert.ok(sql.includes(sp), `Vormerkung ohne ${sp}`);
    }
  });

  it("die Kategorien-Inventur nennt beide Tabellen", () => {
    assert.ok(svc.DATA_CATEGORIES.B.tables.includes("assignment_staffing_invites"));
    assert.ok(svc.DATA_CATEGORIES.B.tables.includes("assignment_staffing_waitlist"));
  });
});

describe("N2.10 — der Org-Export", () => {
  it("Mitglieder ueber role_key, Vertraege auf BEIDEN Seiten", async () => {
    const ORG = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
    const pool = spurPool((sql) => (/FROM organizations WHERE id = \$1/.test(sql) ? { rows: [{ id: ORG }], rowCount: 1 } : null));
    const erg = await svc.exportOrgDataFull(pool, ORG);
    assert.notEqual(erg, null);
    const mitglieder = flach(abfrage(pool, /FROM org_memberships om/).sql);
    assert.ok(mitglieder.includes("om.role_key"));
    assert.equal(/\bom\.role\b(?!_)/.test(mitglieder), false, "org_memberships.role gibt es nicht");
    const vertraege = abfrage(pool, /FROM contracts/);
    assert.match(flach(vertraege.sql), /WHERE buyer_org_id = \$1 OR supplier_org_id = \$1$/);
    assert.deepEqual(vertraege.params, [ORG]);
  });
});

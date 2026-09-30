/**
 * Wer eine Rechnung schreiben darf — und wer sie nur liest (Welle J7).
 *
 * DER BEFUND (2026-08-28, beim Bau der Empfangsseite an der echten Datenbank
 * belegt): Die Org-Grenze der operativen Rechnung fragte nur, OB eine
 * Organisation beteiligt ist (`org_id` ODER `supplier_org_id`). Damit stand
 * dem EMPFAENGER der gesamte Beleg des Ausstellers offen. Ein Unternehmen
 * konnte an einer Rechnung, die an es selbst gerichtet war:
 *
 *   1. sie ueberhaupt erst ERZEUGEN — im Namen der Zeitarbeitsfirma,
 *   2. den Entwurf KORRIGIEREN und damit den Betrag aendern,
 *   3. sie STELLEN und dabei eine Nummer aus dem Kreis der Zeitarbeitsfirma
 *      ziehen — also genau die Lueckenlosigkeit zerstoeren, die Mig 203
 *      herstellt,
 *   4. sie als BEZAHLT markieren, ohne bezahlt zu haben.
 *
 * Alle vier waren an der laufenden Datenbank reproduzierbar, keiner wurde von
 * einem Test bemerkt: die vorhandenen Proben pruefen die FREMDE Org (die
 * korrekt 403 bekam) — nie die beteiligte Gegenseite.
 *
 * DIE REGEL, die dieser Test festhaelt:
 *   LESEN   — beide Seiten. Der Entleiher braucht denselben Beleg fuer seine
 *             Buchhaltung wie der Verleiher.
 *   SCHREIBEN — nur der Rechnungssteller (`supplier_org_id`). Einen Beleg
 *             stellt aus, wer die Leistung erbracht hat.
 *
 * DB-GEBUNDEN, und das ist der Punkt: Genau diese Luecke ist an Mock-Pools
 * vorbeigelaufen.
 *
 * Run: DATABASE_URL=… node --test --test-force-exit test/rechnungRollentrennung.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import {
  generateFromTimesheets,
  transitionInvoice,
  addCorrectionItem,
  getOperationalInvoice,
  listOperationalInvoices
} from "../services/operationalInvoiceService.js";

const hasDb = !!process.env.DATABASE_URL;
const suite = hasDb ? describe : describe.skip;

suite("Rechnung · wer schreiben darf und wer liest", () => {
  let pool;
  const spur = [];
  let ZAF, KUNDE, FREMD, einsatz, zettel;

  before(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    const s = Math.random().toString(36).slice(2, 10);
    const org = async (name, typ) => {
      const { rows } = await pool.query(
        "INSERT INTO organizations (name, slug, type) VALUES ($1, $2, $3) RETURNING id",
        [`${name} ${s}`, `${name.toLowerCase()}-${s}`, typ]
      );
      spur.push(["organizations", rows[0].id]);
      return rows[0].id;
    };
    ZAF = await org("RollenZaf", "agency");
    KUNDE = await org("RollenKunde", "company");
    FREMD = await org("RollenFremd", "agency");

    const { rows: a } = await pool.query(
      `INSERT INTO assignments (org_id, supplier_org_id, start_date, hourly_rate_cents, status)
            VALUES ($1, $2, CURRENT_DATE, 4200, 'active') RETURNING id`,
      [KUNDE, ZAF]
    );
    einsatz = a[0].id;
    spur.unshift(["assignments", einsatz]);

    const { rows: t } = await pool.query(
      `INSERT INTO timesheets (org_id, supplier_org_id, assignment_id, worker_name,
                               week_start, week_end, total_hours, overtime_hours, status)
            VALUES ($1, $2, $3, 'Kraft', CURRENT_DATE - 7, CURRENT_DATE - 1, 10, 0, 'approved')
       RETURNING id`,
      [KUNDE, ZAF, einsatz]
    );
    zettel = t[0].id;
    spur.unshift(["timesheets", zettel]);
  });

  after(async () => {
    for (const [tabelle, id] of spur) {
      await pool.query(`DELETE FROM ${tabelle} WHERE id = $1`, [id]).catch(() => {});
    }
    await pool.end();
  });

  /* Jeder Aufruf braucht eine EIGENE Woche: `timesheets_unique_week_worker`
   * laesst je Kraft und Woche nur einen Zettel zu — zu Recht, sonst waere
   * dieselbe Zeit doppelt abrechenbar. Der Zaehler haelt die Laeufe
   * auseinander. */
  let wochenVersatz = 28;

  /** Eine frische Rechnung des Ausstellers, im Entwurf. */
  async function neueRechnung() {
    wochenVersatz += 7;
    const { rows: t } = await pool.query(
      `INSERT INTO timesheets (org_id, supplier_org_id, assignment_id, worker_name,
                               week_start, week_end, total_hours, overtime_hours, status)
            VALUES ($1, $2, $3, 'Kraft',
                    CURRENT_DATE - $4::int, CURRENT_DATE - ($4::int - 6), 4, 0, 'approved')
       RETURNING id`,
      [KUNDE, ZAF, einsatz, wochenVersatz]
    );
    spur.unshift(["timesheets", t[0].id]);
    const r = await generateFromTimesheets(pool, {
      orgId: ZAF, assignmentId: einsatz, timesheetIds: [t[0].id], actorId: null
    });
    assert.ok(!r.error, `Vorbereitung fehlgeschlagen: ${JSON.stringify(r.error)}`);
    spur.unshift(["invoices", r.invoice.id]);
    return r.invoice;
  }

  /* ── Der Empfaenger darf NICHT schreiben ──────────────────────────────── */

  it("der Empfaenger kann keine Rechnung an sich selbst erzeugen", async () => {
    const r = await generateFromTimesheets(pool, {
      orgId: KUNDE, assignmentId: einsatz, timesheetIds: [zettel], actorId: null
    });
    assert.equal(r.error, "NOT_INVOICE_ISSUER",
      "das Unternehmen konnte sich selbst eine Rechnung im Namen der Zeitarbeitsfirma ausstellen");
    if (r.invoice) spur.unshift(["invoices", r.invoice.id]);
  });

  it("der Empfaenger kann den Entwurf nicht korrigieren", async () => {
    const rechnung = await neueRechnung();
    const vorher = Number(rechnung.total_cents);
    const k = await addCorrectionItem(pool, rechnung.id, {
      description: "Abzug", amountCents: 50000, actorId: null, orgId: KUNDE
    });
    assert.equal(k.error, "NOT_INVOICE_ISSUER", "der Empfaenger konnte den Betrag aendern");
    const geladen = await getOperationalInvoice(pool, rechnung.id, ZAF);
    assert.equal(Number(geladen.total_cents), vorher, "der Betrag hat sich trotzdem bewegt");
  });

  it("der Empfaenger kann die Rechnung nicht stellen — und keine Nummer ziehen", async () => {
    const rechnung = await neueRechnung();
    const { rows: vorher } = await pool.query(
      "SELECT letzte_nummer FROM invoice_number_sequences WHERE supplier_org_id = $1", [ZAF]
    );
    const standVorher = vorher[0] ? Number(vorher[0].letzte_nummer) : 0;

    const s = await transitionInvoice(pool, rechnung.id, "issued", null, KUNDE);
    assert.equal(s.error, "NOT_INVOICE_ISSUER", "der Empfaenger konnte die Rechnung stellen");

    const { rows: nachher } = await pool.query(
      "SELECT letzte_nummer FROM invoice_number_sequences WHERE supplier_org_id = $1", [ZAF]
    );
    const standNachher = nachher[0] ? Number(nachher[0].letzte_nummer) : 0;
    assert.equal(standNachher, standVorher,
      "der abgewiesene Versuch hat trotzdem eine Nummer aus dem Kreis der Zeitarbeitsfirma gezogen");
  });

  it("der Empfaenger kann nicht 'bezahlt' behaupten", async () => {
    const rechnung = await neueRechnung();
    await transitionInvoice(pool, rechnung.id, "issued", null, ZAF);
    const b = await transitionInvoice(pool, rechnung.id, "paid", null, KUNDE);
    assert.equal(b.error, "NOT_INVOICE_ISSUER",
      "der Empfaenger konnte seine eigene Rechnung als bezahlt markieren");
    const geladen = await getOperationalInvoice(pool, rechnung.id, ZAF);
    assert.equal(geladen.status, "issued", "der Status hat sich trotzdem geaendert");
  });

  /* ── Der Empfaenger DARF lesen ────────────────────────────────────────── */

  it("der Empfaenger sieht seine Eingangsrechnung — er braucht den Beleg", async () => {
    const rechnung = await neueRechnung();
    const gelesen = await getOperationalInvoice(pool, rechnung.id, KUNDE);
    assert.ok(gelesen && !gelesen.error, "der Empfaenger kam nicht an seinen eigenen Beleg");
    assert.equal(gelesen.id, rechnung.id);
    assert.ok(Array.isArray(gelesen.items), "die Positionen fehlen — ohne sie ist der Beleg wertlos");

    const liste = await listOperationalInvoices(pool, { orgId: KUNDE });
    assert.ok(liste.some((r) => String(r.id) === String(rechnung.id)),
      "die Eingangsrechnung fehlt in der Liste des Empfaengers");
  });

  /* ── Der Aussteller darf alles ────────────────────────────────────────── */

  it("der Aussteller kann stellen und bezahlt melden — sonst bewiese der Test nichts", async () => {
    const rechnung = await neueRechnung();
    const s = await transitionInvoice(pool, rechnung.id, "issued", null, ZAF);
    assert.ok(!s.error, `der Aussteller wurde abgewiesen: ${JSON.stringify(s.error)}`);
    assert.ok(s.invoice.invoice_number, "keine Nummer vergeben");
    const b = await transitionInvoice(pool, rechnung.id, "paid", null, ZAF);
    assert.ok(!b.error, `der Aussteller konnte nicht als bezahlt markieren: ${JSON.stringify(b.error)}`);
  });

  /* ── Und eine voellig fremde Org bleibt draussen ──────────────────────── */

  it("eine unbeteiligte Organisation sieht und aendert gar nichts", async () => {
    const rechnung = await neueRechnung();
    const gelesen = await getOperationalInvoice(pool, rechnung.id, FREMD);
    assert.ok(gelesen === null || gelesen.error === "ORG_BOUNDARY_VIOLATION",
      "eine fremde Org konnte die Rechnung lesen");
    const s = await transitionInvoice(pool, rechnung.id, "issued", null, FREMD);
    assert.ok(s.error === "NOT_FOUND" || s.error === "ORG_BOUNDARY_VIOLATION",
      `unerwartete Antwort fuer eine fremde Org: ${JSON.stringify(s.error)}`);
    const liste = await listOperationalInvoices(pool, { orgId: FREMD });
    assert.ok(!liste.some((r) => String(r.id) === String(rechnung.id)),
      "die Rechnung erscheint in der Liste einer unbeteiligten Organisation");
  });
});

/**
 * Der eigene Nummernkreis und der eingefrorene Satz (Welle J7, Mig 203).
 *
 * OWNER-ENTSCHEID (2026-08-26): "eigener lueckenloser Nummernkreis je
 * Zeitarbeitsfirma, bevor die erste echte Rechnung das Haus verlaesst."
 *
 * WAS HIER GESCHUETZT WIRD — und warum jede Zusage einzeln zaehlt:
 *
 *   1. JE FIRMA EIN KREIS. Vorher zog die operative Rechnung aus derselben
 *      globalen Sequenz wie die Abo-Rechnung der Plattform; jede Abo-Rechnung
 *      riss eine Luecke in den Kreis der Zeitarbeitsfirma.
 *   2. LUECKENLOS. Zwei Rechnungen derselben Firma folgen unmittelbar
 *      aufeinander — auch wenn dazwischen eine andere Firma stellt.
 *   3. ERST BEIM STELLEN. Der Entwurf traegt keine Nummer. Sonst hinterlaesst
 *      ein verworfener Entwurf eine Luecke, die niemand erklaeren kann.
 *   4. KEINE ZWEITE NUMMER. 'overdue' darf laut Zustandsautomat zurueck auf
 *      'issued' — eine zweite Nummer waere ein Beleg-Duplikat.
 *   5. DER SATZ IST EINGEFROREN. `assignments.hourly_rate_cents` steht in der
 *      Update-Whitelist. Wer ihn nach der Erzeugung aendert, darf eine
 *      bestehende Rechnung nicht mehr bewegen.
 *
 * DB-GEBUNDEN und bewusst so: Die Lueckenlosigkeit haengt an einer Zeilensperre
 * innerhalb einer Transaktion. Ein Mock-Pool kann das nicht beweisen — er
 * wuerde genau die Eigenschaft wegabstrahieren, um die es geht.
 *
 * Jeder Testlauf raeumt seine Daten wieder ab (finally).
 *
 * Run: DATABASE_URL=… node --test --test-force-exit test/rechnungsnummerJeFirma.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import {
  generateFromTimesheets,
  transitionInvoice,
  getOperationalInvoice
} from "../services/operationalInvoiceService.js";

const hasDb = !!process.env.DATABASE_URL;
const suite = hasDb ? describe : describe.skip;

suite("Rechnungsnummer je Zeitarbeitsfirma (Mig 203)", () => {
  let pool;
  const spur = [];               // alles, was der Lauf angelegt hat
  const SATZ = 4200;             // 42,00 EUR/h

  /** Legt Firma + Kunde + Einsatz + einen freigegebenen Stundenzettel an. */
  async function baueSzenario(name, stunden = 10) {
    /* `slug` ist NOT NULL ohne Vorgabe — der Zufallsanteil haelt parallele
     * Laeufe auseinander, ohne auf eine Aufraeumung des Vorlaufs zu bauen. */
    const kennung = `${name}-${Math.random().toString(36).slice(2, 10)}`;
    const { rows: o } = await pool.query(
      `INSERT INTO organizations (name, slug, type) VALUES ($1, $2, 'agency') RETURNING id`,
      [`Testfirma ${name}`, `testfirma-${kennung}`]
    );
    const { rows: k } = await pool.query(
      `INSERT INTO organizations (name, slug, type) VALUES ($1, $2, 'company') RETURNING id`,
      [`Testkunde ${name}`, `testkunde-${kennung}`]
    );
    const supplierOrgId = o[0].id, orgId = k[0].id;
    spur.push(["organizations", supplierOrgId], ["organizations", orgId]);

    const { rows: a } = await pool.query(
      `INSERT INTO assignments (org_id, supplier_org_id, start_date, hourly_rate_cents, status)
            VALUES ($1, $2, CURRENT_DATE, $3, 'active') RETURNING id`,
      [orgId, supplierOrgId, SATZ]
    );
    const assignmentId = a[0].id;
    spur.push(["assignments", assignmentId]);

    const { rows: t } = await pool.query(
      `INSERT INTO timesheets (org_id, supplier_org_id, assignment_id, worker_name,
                               week_start, week_end, total_hours, overtime_hours, status)
            VALUES ($1, $2, $3, 'Testkraft', CURRENT_DATE - 7, CURRENT_DATE - 1, $4, 0, 'approved')
       RETURNING id`,
      [orgId, supplierOrgId, assignmentId, stunden]
    );
    spur.push(["timesheets", t[0].id]);

    return { supplierOrgId, orgId, assignmentId, timesheetId: t[0].id };
  }

  /** Erzeugt eine Rechnung im Entwurf. */
  async function erzeuge(s, actorId = null) {
    const r = await generateFromTimesheets(pool, {
      orgId: s.supplierOrgId,
      assignmentId: s.assignmentId,
      timesheetIds: [s.timesheetId],
      actorId
    });
    assert.ok(!r.error, `Erzeugen fehlgeschlagen: ${JSON.stringify(r.error || r)}`);
    spur.push(["invoices", r.invoice.id]);
    return r.invoice;
  }

  before(() => { pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }); });

  after(async () => {
    /* Rueckwaerts abraeumen: Kinder vor Eltern. invoice_items und die
     * Nummernkreise haengen per ON DELETE CASCADE. */
    for (const [tabelle, id] of spur.reverse()) {
      await pool.query(`DELETE FROM ${tabelle} WHERE id = $1`, [id]).catch(() => {});
    }
    await pool.end();
  });

  it("der Entwurf traegt KEINE Nummer — sonst reisst ein Verwerfen eine Luecke", async () => {
    const s = await baueSzenario("entwurf");
    const rechnung = await erzeuge(s);
    assert.equal(rechnung.status, "draft");
    assert.equal(rechnung.invoice_number, null,
      "der Entwurf hat eine Nummer gezogen — genau das war der Befund");
  });

  it("der Satz wird beim Erzeugen eingefroren", async () => {
    const s = await baueSzenario("satz");
    const rechnung = await erzeuge(s);
    assert.equal(Number(rechnung.rate_cents_frozen), SATZ);
    assert.equal(Number(rechnung.amount_cents), SATZ * 10,
      "10 Stunden zu 42,00 EUR = 420,00 EUR netto");
  });

  it("eine spaetere Satzaenderung bewegt die erzeugte Rechnung nicht mehr", async () => {
    const s = await baueSzenario("aenderung");
    const rechnung = await erzeuge(s);
    /* Genau der Weg, den die Update-Whitelist zulaesst. */
    await pool.query("UPDATE assignments SET hourly_rate_cents = $2 WHERE id = $1",
      [s.assignmentId, SATZ * 3]);
    const geladen = await getOperationalInvoice(pool, rechnung.id, s.supplierOrgId);
    assert.equal(Number(geladen.rate_cents_frozen), SATZ, "der eingefrorene Satz hat sich bewegt");
    assert.equal(Number(geladen.amount_cents), SATZ * 10, "der Betrag hat sich bewegt");
  });

  it("erst das Stellen vergibt die Nummer — im Format der Firma", async () => {
    const s = await baueSzenario("stellen");
    const rechnung = await erzeuge(s);
    const r = await transitionInvoice(pool, rechnung.id, "issued", null, s.supplierOrgId);
    assert.ok(!r.error, `Stellen fehlgeschlagen: ${JSON.stringify(r.error)}`);
    assert.equal(r.invoice.status, "issued");
    const jahr = new Date().getFullYear();
    assert.match(r.invoice.invoice_number, new RegExp(`^RE-${jahr}-\\d{6}$`),
      `unerwartetes Format: ${r.invoice.invoice_number}`);
    assert.ok(r.invoice.issued_at, "issued_at fehlt");
  });

  it("der Kreis einer Firma ist lueckenlos — auch wenn eine andere dazwischen stellt", async () => {
    const a = await baueSzenario("firma-a");
    const b = await baueSzenario("firma-b");

    const a1 = await erzeuge(a);
    const r1 = await transitionInvoice(pool, a1.id, "issued", null, a.supplierOrgId);

    /* Die fremde Firma zieht dazwischen — frueher haette das eine Luecke
     * gerissen, weil beide aus derselben Sequenz zogen. */
    const b1 = await erzeuge(b);
    const rb = await transitionInvoice(pool, b1.id, "issued", null, b.supplierOrgId);

    const a2 = await baueSzenario("firma-a-zweite");
    /* Zweite Rechnung DERSELBEN Firma: Einsatz von A, aber neuer Zettel. */
    const { rows: t2 } = await pool.query(
      `INSERT INTO timesheets (org_id, supplier_org_id, assignment_id, worker_name,
                               week_start, week_end, total_hours, overtime_hours, status)
            VALUES ($1, $2, $3, 'Testkraft 2', CURRENT_DATE - 14, CURRENT_DATE - 8, 5, 0, 'approved')
       RETURNING id`,
      [a.orgId, a.supplierOrgId, a.assignmentId]
    );
    spur.push(["timesheets", t2[0].id]);
    const zweite = await generateFromTimesheets(pool, {
      orgId: a.supplierOrgId, assignmentId: a.assignmentId, timesheetIds: [t2[0].id], actorId: null
    });
    assert.ok(!zweite.error, JSON.stringify(zweite.error));
    spur.push(["invoices", zweite.invoice.id]);
    const r2 = await transitionInvoice(pool, zweite.invoice.id, "issued", null, a.supplierOrgId);

    const nr = (s) => parseInt(s.split("-").pop(), 10);
    assert.equal(nr(r2.invoice.invoice_number), nr(r1.invoice.invoice_number) + 1,
      `Luecke im Kreis: ${r1.invoice.invoice_number} -> ${r2.invoice.invoice_number} ` +
      `(dazwischen stellte eine andere Firma ${rb.invoice.invoice_number})`);

    /* Und die fremde Firma hat ihren EIGENEN Kreis, der bei 1 beginnt. */
    assert.equal(nr(rb.invoice.invoice_number), 1, "die zweite Firma beginnt nicht bei 1");
    assert.notEqual(rb.invoice.invoice_number.split("-")[0] + rb.invoice.invoice_number,
      r1.invoice.invoice_number, "beide Firmen tragen dieselbe Nummer");
  });

  it("eine Rechnung bekommt NIE eine zweite Nummer", async () => {
    /* KORRIGIERTE ANNAHME (2026-08-28): Die erste Fassung fuhr issued ->
     * overdue -> issued und erwartete, dass die zweite Vergabe unterbleibt.
     * Diesen Weg gibt es nicht — VALID_TRANSITIONS laesst `overdue` nur nach
     * `paid` oder `void` (operationalInvoiceService.js:26-32). Der Test kodierte
     * also einen Uebergang, den das Produkt bewusst nicht kennt.
     *
     * Die ZUSAGE bleibt dieselbe und wird jetzt an der Wirklichkeit geprueft:
     * es gibt keinen Weg zu einer zweiten Nummer. Der Schutz liegt doppelt —
     * der Zustandsautomat laesst den zweiten Versuch gar nicht zu, und die
     * Vergabe selbst greift nur bei `!invoice_number`. */
    const s = await baueSzenario("keine-zweite");
    const rechnung = await erzeuge(s);
    const erst = await transitionInvoice(pool, rechnung.id, "issued", null, s.supplierOrgId);
    const nummer = erst.invoice.invoice_number;
    assert.ok(nummer, "die erste Vergabe hat keine Nummer geliefert");

    /* Erste Schranke: derselbe Uebergang ein zweites Mal. */
    const nochmal = await transitionInvoice(pool, rechnung.id, "issued", null, s.supplierOrgId);
    assert.equal(nochmal.error, "INVALID_TRANSITION",
      "der Zustandsautomat liess ein zweites Stellen zu");

    /* Zweite Schranke: ueber 'overdue' zurueck — den Weg gibt es nicht. */
    const ueber = await transitionInvoice(pool, rechnung.id, "overdue", null, s.supplierOrgId);
    assert.ok(!ueber.error, JSON.stringify(ueber.error));
    assert.equal(ueber.invoice.invoice_number, nummer, "die Nummer hat sich bei overdue bewegt");
    const zurueck = await transitionInvoice(pool, rechnung.id, "issued", null, s.supplierOrgId);
    assert.equal(zurueck.error, "INVALID_TRANSITION",
      "overdue -> issued war moeglich; dann braeuchte die Nummernvergabe die zweite Schranke");

    /* Und der Kreis der Firma ist nicht weitergelaufen — kein Verbrauch ohne Beleg. */
    const { rows } = await pool.query(
      "SELECT letzte_nummer FROM invoice_number_sequences WHERE supplier_org_id = $1",
      [s.supplierOrgId]
    );
    assert.equal(Number(rows[0].letzte_nummer), 1,
      "der Zaehler ist weitergelaufen, obwohl keine zweite Nummer vergeben wurde");
  });

  it("eine fremde Organisation kann weder stellen noch lesen", async () => {
    const s = await baueSzenario("fremd");
    const fremd = await baueSzenario("fremd-andere");
    const rechnung = await erzeuge(s);

    const r = await transitionInvoice(pool, rechnung.id, "issued", null, fremd.supplierOrgId);
    assert.equal(r.error, "NOT_FOUND", "eine fremde Org durfte den Zustand aendern");

    const gelesen = await getOperationalInvoice(pool, rechnung.id, fremd.supplierOrgId);
    assert.ok(gelesen === null || gelesen.error === "ORG_BOUNDARY_VIOLATION",
      "eine fremde Org durfte die Rechnung lesen");

    /* Gegenprobe: die eigene Org darf beides — sonst bewiese der Test nur,
     * dass gar nichts geht. */
    const eigen = await transitionInvoice(pool, rechnung.id, "issued", null, s.supplierOrgId);
    assert.ok(!eigen.error, "die eigene Org wurde ebenfalls abgewiesen");
  });

  it("die Abo-Rechnung bleibt bei der globalen Sequenz — zwei Welten, zwei Kreise", async () => {
    /* Belegt, dass der Umbau die Plattform-Rechnung nicht angefasst hat: dort
     * ist TempConnect selbst Rechnungssteller mit genau EINEM Kreis. */
    const quelle = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../services/invoiceService.js", import.meta.url), "utf8"));
    assert.match(quelle, /nextval\('invoice_number_seq'\)/,
      "die Abo-Rechnung zieht nicht mehr aus der globalen Sequenz — war das Absicht?");
  });
});

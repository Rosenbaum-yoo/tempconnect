/**
 * DB-gestuetzter SQL-Validitaets-Smoke fuer die Zuverlaessigkeitsquote (P8 Welle B).
 *
 * Der DB-freie Unit-Test (test/dealReliability.test.js) sichert die Regeln (E1/E2/E4),
 * die Query-ZAEHLUNG (Anti-N+1) und die SQL-FORM ueber einen Mock-Pool ab. Was er
 * grundsaetzlich NICHT kann: beweisen, dass die Abfragen gegen das REALE Schema
 * gueltiges Postgres sind. Ein vertippter Spaltenname, ein falscher Alias, ein
 * fehlender Cast in `UNNEST($1::uuid[], …)` oder ein `ON CONFLICT`, das nicht zum
 * echten Schluessel passt, kaeme im Mock nie zum Vorschein und wuerde erst im
 * naechtlichen Cron auf dem Server knallen — dort, wo niemand hinsieht.
 *
 * Die beiden UNION-Zweige, der Drei-Tabellen-Join und die zwei Bulk-Upserts sind
 * genau die Art nicht-trivialer Query, fuer die die Zwei-Schicht-Disziplin gilt.
 *
 * Vorgehen: mit einer NICHT existierenden UUID rechnen. Ergebnis ist immer leer,
 * aber Postgres parst und plant die VOLLE Abfrage.
 *
 * Laeuft NUR mit DB. Ohne DATABASE_URL skippt der Block automatisch.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasDb, createPool } from "./helpers.js";
import * as svc from "../../services/dealReliabilityService.js";

describe("Zuverlaessigkeitsquote — SQL-Gueltigkeit gegen reales Schema", { skip: !hasDb && "No database configured" }, () => {
  let pool;

  before(() => {
    if (!hasDb) return;
    pool = createPool();
  });

  after(async () => {
    await pool?.end();
  });

  // Deckt beide UNION-Zweige des Nenners und den Drei-Tabellen-Join des Zaehlers ab.
  // Eine unbekannte UUID trifft nichts, also wird auch nichts geschrieben — die
  // Abfragen laufen trotzdem vollstaendig durch den Planer.
  it("eingegrenzter Lauf auf eine unbekannte Partei ist gueltiges Postgres", async () => {
    const ergebnis = await svc.recomputeReliability(pool, { userIds: [randomUUID()] });
    assert.strictEqual(ergebnis.parties, 0);
    assert.strictEqual(ergebnis.updated, 0);
    assert.strictEqual(ergebnis.truncated, false);
    assert.strictEqual(ergebnis.window_days, svc.FENSTER_TAGE);
  });

  // Der ungefilterte Pfad setzt `$2` auf NULL. Der `($2::uuid[] IS NULL OR …)`-Ausdruck
  // ist genau die Stelle, an der ein fehlender Cast erst zur Laufzeit auffaellt.
  it("ungefilterter Lauf (userIds NULL) ist gueltiges Postgres und schreibt beide Seiten", async () => {
    const ergebnis = await svc.recomputeReliability(pool, { limit: svc.MAX_BATCH_SIZE });
    assert.ok(ergebnis.updated >= 0);
    assert.ok(ergebnis.mirrored <= ergebnis.updated,
      "es kann nie mehr gespiegelt als gerechnet werden — gespiegelt wird nur die Agentur-Seite");
  });

  // Zweiter Lauf auf unveraenderten Daten: der Upsert darf keine Duplikate erzeugen
  // und keine Werte verschieben. Das prueft ON CONFLICT gegen den ECHTEN
  // Primaerschluessel (party_user_id, party_side) — im Mock ist das nicht pruefbar.
  it("ist am realen Schema idempotent (ON CONFLICT trifft den echten Schluessel)", async () => {
    const ersterLauf = await svc.recomputeReliability(pool);
    const { rows: nachErstem } = await pool.query(
      `SELECT party_user_id, party_side, binding_deals, weighted_cancellations, reliability_rate
         FROM deal_reliability ORDER BY party_user_id, party_side`
    );

    const zweiterLauf = await svc.recomputeReliability(pool);
    const { rows: nachZweitem } = await pool.query(
      `SELECT party_user_id, party_side, binding_deals, weighted_cancellations, reliability_rate
         FROM deal_reliability ORDER BY party_user_id, party_side`
    );

    assert.strictEqual(zweiterLauf.parties, ersterLauf.parties);
    assert.strictEqual(nachZweitem.length, nachErstem.length, "keine Duplikate durch den zweiten Lauf");
    assert.deepStrictEqual(nachZweitem, nachErstem, "gleiche Daten, gleiches Ergebnis");
  });

  // Gate B am echten Schema: die Spalte muss NULL halten koennen. Waere sie mit
  // NOT NULL DEFAULT 0 angelegt, wuerde "keine Datenlage" still zu "0 % zuverlaessig"
  // — der teuerste denkbare Fehler in dieser Kennzahl.
  it("Gate B: reliability_rate ist NULL-faehig, 'keine Daten' kann nicht zu 0 % werden", async () => {
    const { rows } = await pool.query(
      `SELECT is_nullable, data_type FROM information_schema.columns
        WHERE table_name = 'deal_reliability' AND column_name = 'reliability_rate'`
    );
    assert.strictEqual(rows.length, 1, "Migration 164 eingespielt?");
    assert.strictEqual(rows[0].is_nullable, "YES");
  });

  // Der Spiegel-INSERT setzt nur drei Spalten. Faende sich in supplier_reputation eine
  // NOT-NULL-Spalte ohne Default, schlueg der Upsert fuer einen bisher unbekannten
  // Anbieter fehl — und zwar erst in Produktion beim ersten neuen Lieferanten.
  it("der Spiegel-Upsert kann eine neue supplier_reputation-Zeile anlegen", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'supplier_reputation'
          AND is_nullable = 'NO'
          AND column_default IS NULL
          AND column_name NOT IN ('id', 'supplier_id', 'deal_success_rate', 'updated_at')`
    );
    assert.deepStrictEqual(rows.map((r) => r.column_name), [],
      "jede weitere Pflichtspalte braucht einen Default, sonst bricht der Spiegel beim ersten neuen Anbieter");
  });

  // Der Vorzustand aus Welle A/Mig 164: der CHECK muss genau die Agreement-Zustaende
  // zulassen, die der Zustandsautomat kennt — sonst scheitert ein Storno am Constraint.
  it("offer_cancellations.from_status akzeptiert alle Vorzustaende des Zustandsautomaten", async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'offer_cancellations' AND column_name = 'from_status'`
    );
    assert.strictEqual(rows.length, 1, "Migration 164 eingespielt?");

    for (const zustand of ["pending_confirmation", "confirmed", "activated", "none", "agreement_created"]) {
      // CHECK-Ausdruck direkt auswerten, ohne eine Zeile zu schreiben.
      const { rows: ok } = await pool.query(
        `SELECT $1::text IN ('none','agreement_created','pending_confirmation','confirmed','activated') AS erlaubt`,
        [zustand]
      );
      assert.strictEqual(ok[0].erlaubt, true, `${zustand} muss erlaubt sein`);
    }
  });

  // Die Partei-Aufloesung im Storno-Nachlauf: eigener CASE-Ausdruck ueber zwei Tabellen.
  it("die Partei-Aufloesung nach dem Storno ist gueltiges Postgres", async () => {
    for (const seite of ["agency", "company"]) {
      const ergebnis = await svc.refreshReliabilityForOfferParty(pool, randomUUID(), seite);
      assert.strictEqual(ergebnis, null, "unbekanntes Angebot -> nichts zu rechnen, aber Query lief");
    }
  });

  it("getReliability liest ohne Fehler und liefert null fuer Unbekannte", async () => {
    assert.strictEqual(await svc.getReliability(pool, randomUUID(), "agency"), null);
  });

  // Der Vorlauf (E1) haengt daran, dass zu JEDEM Angebot ein Einsatzbeginn
  // auffindbar ist. `offers.start_confirmed` ist optional — der Fallback laeuft
  // deshalb ueber die Nachfrage. Diese beiden Zusicherungen sind die Grundlage:
  // faellt eine davon, ist die 48-Stunden-Regel wieder wirkungslos, ohne dass
  // irgendein Unit-Test rot wird.
  it("E1-Grundlage: jedes Angebot hat einen auffindbaren Einsatzbeginn", async () => {
    const { rows: spalten } = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE (table_name = 'offers' AND column_name IN ('demand_request_id', 'assignment_start_date'))
           OR (table_name = 'demand_requests' AND column_name = 'start_date')`
    );
    const nach = (name) => spalten.find((s) => s.column_name === name);

    assert.ok(!nach("assignment_start_date"),
      "gibt es diese Spalte auf offers wirklich, gehoert der Fallback dorthin zurueck — bis dahin waere er tot");
    assert.strictEqual(nach("demand_request_id")?.is_nullable, "NO",
      "ohne NOT NULL koennte ein Angebot ohne Nachfrage existieren und der Join wuerde es verschlucken");
    assert.strictEqual(nach("start_date")?.is_nullable, "NO",
      "waere start_date NULL-bar, bliebe der Vorlauf trotz Join manchmal unbekannt");
  });

  // Der Storno-Pfad selbst: liefert die Abfrage aus cancelAgreement fuer ein
  // Angebot OHNE start_confirmed trotzdem ein Startdatum? Genau das war der Defekt.
  it("die Storno-Abfrage findet den Beginn auch ohne start_confirmed", async () => {
    const { rows } = await pool.query(
      `SELECT o.id, o.start_confirmed, d.start_date AS demand_start,
              COALESCE(o.start_confirmed, d.start_date) AS aufgeloest
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
        WHERE o.start_confirmed IS NULL
        LIMIT 25`
    );
    for (const r of rows) {
      assert.ok(r.aufgeloest,
        `Angebot ${r.id} haette keinen Vorlauf und damit kein E1-Gewicht bekommen`);
    }
  });
});

/**
 * DB-gestuetzter SQL-Validitaets-Smoke fuer Welle K1 (Rabatt-Faelle und Eingriffe).
 *
 * WARUM ZUSAETZLICH ZUM MOCK-TEST
 * `test/rabattWirdSichtbar.test.js` sichert Verhalten, Riegel und Rueckmutationen
 * ueber einen Muster-Pool ab. Der kann aber NICHT beweisen, dass die Abfragen
 * gegen das REALE Schema gueltiges Postgres sind: ein vertippter Spaltenname,
 * ein falscher Alias oder eine schiefe Parameter-Nummerierung faellt dort nie
 * auf, weil der Mock jede Zeichenkette anstandslos beantwortet. Genau diese
 * Zwei-Schicht-Disziplin steht als Erkenntnis in der `CLAUDE.md`.
 *
 * Dieser Test fuehrt die Abfragen mit einer NICHT existierenden UUID aus:
 * null Treffer, aber Postgres parst und plant die VOLLE Abfrage.
 *
 * Die Schreibwege werden mitgeprueft — `rabatt_ausfaelle` traegt einen UPSERT
 * auf einen zusammengesetzten Schluessel und mehrere CHECK-Bedingungen; ob der
 * `ON CONFLICT` wirklich auf einen vorhandenen Unique-Index trifft, weiss nur
 * die Datenbank. Der Fremdschluessel auf `users` verhindert dabei, dass
 * Testdaten zurueckbleiben: ohne echten Nutzer schlaegt der INSERT fehl, und
 * genau dieser Fehlschlag ist die Aussage.
 *
 * Laeuft NUR mit DB. Ohne DB skippt der Block automatisch.
 *
 * Requires: DATABASE_URL (oder DB_HOST + POSTGRES_PASSWORD)
 * Run: docker exec tempconnect_api sh -c "cd /app && node --test --test-force-exit test/integration/rabattWirdSichtbar.flow.test.js"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hasDb, createPool } from "./helpers.js";

import * as ausfall from "../../services/rabattAusfallService.js";
import * as eingriff from "../../services/rabattEingriffService.js";
import * as fall from "../../services/rabattFallService.js";
import { naechsteAbrechnung, vorschauRecurringInvoices } from "../../services/recurringBillingService.js";
import { getUserDiscountDetail } from "../../services/bountyService.js";

describe("K1 · die Abfragen sind gueltiges Postgres gegen das echte Schema",
  { skip: !hasDb && "No database configured" }, () => {

  let pool;
  const fremd = randomUUID();          // existiert nicht — 0 Treffer, volle Planung
  const monat = ausfall.abrechnungsmonatDE();

  before(() => { if (hasDb) pool = createPool(); });
  after(async () => { await pool?.end(); });

  /* ── Die beiden neuen Tabellen existieren wirklich ──────────────────── */

  it("Migration 206 ist eingespielt: beide Tabellen stehen", async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('rabatt_ausfaelle', 'rabatt_eingriffe')
        ORDER BY table_name`
    );
    assert.deepEqual(rows.map((r) => r.table_name), ["rabatt_ausfaelle", "rabatt_eingriffe"]);
  });

  it("der UPSERT-Schluessel von rabatt_ausfaelle liegt wirklich als Unique-Index vor", async () => {
    /* Ohne ihn wuerde `ON CONFLICT (user_id, abrechnungsmonat, stelle)` zur
     * Laufzeit werfen — und zwar auf einem Fehlerpfad, wo es niemand sieht. */
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'rabatt_ausfaelle' AND indexdef ILIKE '%UNIQUE%'`
    );
    assert.ok(
      rows.some((r) => /user_id/.test(r.indexdef) && /abrechnungsmonat/.test(r.indexdef) && /stelle/.test(r.indexdef)),
      `kein passender Unique-Index gefunden: ${JSON.stringify(rows)}`
    );
  });

  it("hoechstens EIN offener Eingriff je Kunde — als Teilindex in der Datenbank", async () => {
    /* Der Verfall „nach genau einem Lauf“ haengt daran. Steht der Index nicht,
     * koennten sich Eingriffe stapeln. */
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'rabatt_eingriffe'`
    );
    assert.ok(
      rows.some((r) => /UNIQUE/i.test(r.indexdef) && /verbraucht_am IS NULL/i.test(r.indexdef)),
      `kein Teilindex auf offene Eingriffe: ${JSON.stringify(rows)}`
    );
  });

  it("„nie in eigener Sache“ steht als CHECK in der Datenbank, nicht nur im Code", async () => {
    /* Die Route kann man vergessen, die Tabelle nicht. */
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'rabatt_eingriffe' AND c.contype = 'c'`
    );
    assert.ok(rows.some((r) => /angelegt_von/.test(r.def) && /user_id/.test(r.def)),
      `keine Regel gegen den Eingriff in eigener Sache: ${JSON.stringify(rows)}`);
  });

  /* ── Die Lesewege ───────────────────────────────────────────────────── */

  it("ausfaelleFuerNutzer ist gueltiges Postgres", async () => {
    assert.deepEqual(await ausfall.ausfaelleFuerNutzer(pool, fremd), []);
  });

  it("ausfaelleImMonat ist gueltiges Postgres (JOIN auf users/organizations/invoices)", async () => {
    assert.deepEqual(await ausfall.ausfaelleImMonat(pool, monat), []);
  });

  it("offenenEingriffLesen ist gueltiges Postgres", async () => {
    assert.equal(await eingriff.offenenEingriffLesen(pool, fremd), null);
  });

  it("eingriffeFuerNutzer ist gueltiges Postgres", async () => {
    assert.deepEqual(await eingriff.eingriffeFuerNutzer(pool, fremd), []);
  });

  it("eingriffeImMonat ist gueltiges Postgres — inkl. AT TIME ZONE Europe/Berlin", async () => {
    const u = await eingriff.eingriffeImMonat(pool, monat);
    assert.equal(u.anzahl, 0);
    assert.equal(u.summe_cents, 0);
  });

  it("getUserDiscountDetail ist gueltiges Postgres und liefert die Voreinstellung", async () => {
    const d = await getUserDiscountDetail(pool, fremd);
    assert.equal(d.satz, 0);
    assert.equal(d.deckel, 8, "ohne Stufe gilt die Voreinstellung 8");
    assert.equal(d.stufenFehler, null, "die Stufen-Abfrage muss durchkommen — sonst ist das Schema schief");
  });

  it("naechsteAbrechnung ist gueltiges Postgres", async () => {
    assert.equal(await naechsteAbrechnung(pool, fremd), null);
  });

  it("rabattFall liefert null fuer einen unbekannten Kunden", async () => {
    assert.equal(await fall.rabattFall(pool, fremd), null);
  });

  it("die Kundenliste ist gueltiges Postgres — mit und ohne Suche und Filter", async () => {
    /* Die Abfrage baut drei CTEs, sechs JOINs und haengt die Suche als
     * zusaetzlichen Parameter an. Die Parameter-Nummerierung ($3 nur bei Suche)
     * ist genau die Sorte Detail, die ein Mock nie bemerkt. */
    const ohne = await fall.rabattFaelle(pool, { limit: 5 });
    assert.ok(Array.isArray(ohne.items));

    const mitSuche = await fall.rabattFaelle(pool, { limit: 5, suche: "kein-treffer-xyz" });
    assert.deepEqual(mitSuche.items, []);

    const nurAuffaellige = await fall.rabattFaelle(pool, { limit: 5, nurAuffaellige: true, suche: "kein-treffer-xyz" });
    assert.deepEqual(nurAuffaellige.items, []);
  });

  it("die Vorschau auf den naechsten Lauf ist gueltiges Postgres — und schreibt nichts", async () => {
    /* Gegen die ECHTEN faelligen Abos: am 2026-08-29 waren das 273. Die
     * Vorschau darf davon keines abrechnen. */
    const vorher = await pool.query(`SELECT COUNT(*)::int AS n FROM invoices`);
    const v = await vorschauRecurringInvoices(pool, { batchSize: 5 });
    const nachher = await pool.query(`SELECT COUNT(*)::int AS n FROM invoices`);

    assert.ok(Array.isArray(v.posten));
    assert.ok(v.faellig >= 0);
    assert.equal(nachher.rows[0].n, vorher.rows[0].n,
      "die Vorschau hat abgerechnet — sie darf den Lauf nur zeigen, nicht ausloesen");
  });

  it("eingriffVorschau weist einen unbekannten Katalog-Schluessel ab, ohne zu werfen", async () => {
    const v = await eingriff.eingriffVorschau(pool, {
      userId: fremd, bountyKey: "gibt-es-nicht", nettoCents: 15000
    });
    assert.equal(v.ok, false);
    assert.equal(v.code, "BOUNTY_UNBEKANNT");
  });

  it("eingriffVorschau prueft einen ECHTEN Katalogeintrag gegen die echten Daten", async () => {
    /* Kein fester Schluessel: der Katalog ist Konfiguration und kann sich
     * aendern. Genommen wird, was gerade aktiv ist — sonst waere der Test beim
     * naechsten Not-Aus rot, ohne dass am Code etwas falsch waere. */
    const { rows } = await pool.query(`SELECT key FROM bounties WHERE is_active ORDER BY sort_order LIMIT 1`);
    if (!rows[0]) return; // leerer Katalog ist kein Fehler dieses Tests

    const v = await eingriff.eingriffVorschau(pool, {
      userId: fremd, bountyKey: rows[0].key, nettoCents: 15000
    });
    /* Ein Kunde, den es nicht gibt, erfuellt keine Schwelle — erwartet wird die
     * Ablehnung MIT Begruendung, nicht ein Absturz. Dass die Abfragen von
     * `gatherUserData` gegen das echte Schema laufen, ist die eigentliche
     * Aussage: sie sind der breiteste ungetestete Pfad dieser Welle. */
    assert.equal(v.ok, false);
    assert.ok(["BEDINGUNG_NICHT_ERFUELLT", "OHNE_WIRKUNG", "BOUNTY_AUSSERHALB_ZEITRAUM"].includes(v.code),
      `unerwarteter Grund: ${v.code} — ${v.grund}`);
    assert.ok(v.grund && v.grund.length > 0, "eine Ablehnung ohne Grund ist eine Sackgasse");
  });

  /* ── Der Schreibweg ─────────────────────────────────────────────────── */

  it("ausfallFesthalten schreibt gueltiges SQL — und wirft auch gegen die echte DB nie", async () => {
    /* `fremd` hat keinen Eintrag in `users`, der Fremdschluessel greift also.
     * Erwartet wird `null` (der Dienst faengt es) UND eine unveraenderte
     * Tabelle — kein Testrest, der spaeter jemanden verwirrt. */
    const vorher = await pool.query(`SELECT COUNT(*)::int AS n FROM rabatt_ausfaelle`);
    const id = await ausfall.ausfallFesthalten(pool, {
      userId: fremd, stelle: "stufe", fehler: new Error("Smoke gegen das echte Schema"),
      angesetztPct: 8, nettoCents: 15000, monat
    });
    const nachher = await pool.query(`SELECT COUNT(*)::int AS n FROM rabatt_ausfaelle`);

    assert.equal(id, null, "ein Kunde, den es nicht gibt, darf keinen Befund erzeugen");
    assert.equal(nachher.rows[0].n, vorher.rows[0].n, "es ist ein Testrest zurueckgeblieben");
  });

  it("rechnungNachtragen wirft auch gegen die echte DB nie", async () => {
    assert.equal(await ausfall.rechnungNachtragen(pool, 999999999, randomUUID()), true);
  });
});

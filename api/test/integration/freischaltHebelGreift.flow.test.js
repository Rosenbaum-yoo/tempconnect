/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z4 — DER FREISCHALT-HEBEL JE KUNDE GREIFT, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `feature_overrides` existierte nicht (gemessen 2026-09-27). Der Hebel war
 * vollstaendig gebaut — Dienst, drei Routen mit Audit, fertige Admin-Flaeche mit
 * Grund, Verfall und Loeschknopf — und jeder Aufruf endete in einer 500.
 *
 * Schlimmer noch: der einzige Verbraucher fing den Wurf weg und gab danach
 * `true` zurueck. Ein Owner, der eine Funktion fuer EINEN Kunden abschaltete,
 * hat nichts abgeschaltet, und nichts hat ihm widersprochen.
 *
 * Migration 223 legt die Tabelle an. Diese Datei prueft, was ein Muster-Pool
 * NICHT pruefen kann:
 *
 *   - die vier Wege laufen ueberhaupt (vorher: Wurf)
 *   - der Eintrag der ORG schlaegt den GLOBALEN (die Reihenfolge ist der Inhalt)
 *   - ein ABGELAUFENER Eintrag gilt nicht mehr
 *   - DIE NULL-FALLE: zweimal denselben GLOBALEN Hebel speichern ergibt EINE
 *     Zeile, nicht zwei. In einem gewoehnlichen UNIQUE-Index gelten zwei NULL
 *     als verschieden — ON CONFLICT (org_id, feature_key) haette den globalen
 *     Hebel nie erkannt, die Zeilen haetten sich stumm vermehrt, und
 *     `checkOverride` nimmt mit LIMIT 1 eine davon. Ein Hebel, der nach dem
 *     dritten Umstellen zufaellig antwortet. Deshalb NULLS NOT DISTINCT.
 *   - die Zaehlung mit Org-Filter laeuft (sie nannte $3 und hatte einen Parameter)
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15).
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/freischaltHebelGreift.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as featureOverrideService from "../../services/featureOverrideService.js";

const hasDb = !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));
const createPool = () => new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB || process.env.DB_NAME
      }
);

const SCHLUESSEL = "z4_probe_hebel";

describe("Z4 — der Freischalt-Hebel je Kunde, am realen Schema", () => {
  let pool;
  let client;
  let org = null;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id FROM organizations LIMIT 1");
    org = rows[0] || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && org) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && org) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  const setze = (opts) => featureOverrideService.upsertOverride(client, {
    featureKey: SCHLUESSEL, createdBy: null, reason: "Z4 Probe", ...opts
  });

  it("es gibt eine Organisation, an der sich das zeigen laesst", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("keine Organisation im Bestand");
    assert.ok(org.id);
  });

  it("die Tabelle existiert — vorher warf hier jeder Weg", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'feature_overrides' ORDER BY column_name`);
    const spalten = rows.map((r) => r.column_name);
    for (const s of ["id", "feature_key", "org_id", "enabled", "reason", "created_by", "expires_at", "created_at"]) {
      assert.ok(spalten.includes(s), "Spalte fehlt: " + s);
    }
  });

  it("ein GLOBALER Hebel wirkt, wenn es keine Zeile fuer die Org gibt", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    await setze({ orgId: null, enabled: false });
    const ergebnis = await featureOverrideService.checkOverride(client, SCHLUESSEL, org.id);
    assert.equal(ergebnis.overridden, true, "der globale Hebel wird nicht gefunden");
    assert.equal(ergebnis.enabled, false, "der globale Hebel wirkt nicht");
  });

  it("der Hebel DER ORG schlaegt den globalen", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    /* Die Reihenfolge ist der Inhalt: eine Ausnahme fuer EINEN Kunden muss die
       allgemeine Regel ueberstimmen, sonst ist sie keine. */
    await setze({ orgId: null, enabled: false });
    await setze({ orgId: org.id, enabled: true });
    const ergebnis = await featureOverrideService.checkOverride(client, SCHLUESSEL, org.id);
    assert.equal(ergebnis.enabled, true,
      "der globale Hebel ueberstimmt den des Kunden — dann ist die Ausnahme wirkungslos");
  });

  it("ein ABGELAUFENER Hebel gilt nicht mehr", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    /* Verfall statt Dauerzustand. Ohne diese Zusicherung waere eine einmal
       gesetzte Ausnahme fuer immer gesetzt — und niemand wuesste, warum ein
       Kunde etwas kann, das sein Plan nicht enthaelt. */
    await setze({ orgId: org.id, enabled: true, expiresAt: new Date(Date.now() - 1000) });
    const ergebnis = await featureOverrideService.checkOverride(client, SCHLUESSEL, org.id);
    assert.equal(ergebnis.overridden, false, "ein abgelaufener Hebel wirkt weiter");
  });

  it("DIE NULL-FALLE: zweimal global speichern ergibt EINE Zeile", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    await setze({ orgId: null, enabled: true });
    await setze({ orgId: null, enabled: false });
    const { rows } = await client.query(
      "SELECT enabled FROM feature_overrides WHERE feature_key = $1 AND org_id IS NULL", [SCHLUESSEL]);
    assert.equal(rows.length, 1,
      "der globale Hebel steht " + rows.length + "x. In einem gewoehnlichen UNIQUE-Index gelten "
      + "zwei NULL als verschieden — ON CONFLICT greift dann nicht, die Zeilen vermehren sich "
      + "stumm, und checkOverride nimmt mit LIMIT 1 eine davon. Der Index braucht NULLS NOT DISTINCT.");
    assert.equal(rows[0].enabled, false, "das zweite Speichern hat den Hebel nicht ueberschrieben");
  });

  it("zweimal fuer DIESELBE Org speichern ergibt ebenfalls EINE Zeile", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    await setze({ orgId: org.id, enabled: true });
    await setze({ orgId: org.id, enabled: false });
    const { rows } = await client.query(
      "SELECT enabled FROM feature_overrides WHERE feature_key = $1 AND org_id = $2", [SCHLUESSEL, org.id]);
    assert.equal(rows.length, 1, "der Hebel der Org steht " + rows.length + "x");
    assert.equal(rows[0].enabled, false);
  });

  it("die Liste MIT Org-Filter laeuft — sie nannte $3 und hatte einen Parameter", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    await setze({ orgId: org.id, enabled: true });
    const liste = await featureOverrideService.listOverrides(client, { orgId: org.id });
    assert.ok(liste.items.length >= 1, "der eben gesetzte Hebel steht nicht in der Liste");
    assert.ok(liste.total >= 1, "die Zaehlung liefert 0, obwohl es Eintraege gibt");
    assert.ok(liste.items.every((i) => i.org_id === org.id),
      "die Liste zeigt fremde Eintraege, obwohl nach einer Org gefiltert wurde");
  });

  it("loeschen wirkt, und der Hebel ist danach fort", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    const eintrag = await setze({ orgId: org.id, enabled: false });
    assert.ok(eintrag?.id, "das Anlegen liefert keinen Eintrag");
    assert.equal(await featureOverrideService.deleteOverride(client, eintrag.id), true,
      "das Loeschen meldet keinen Treffer — die Kennung ist eine UUID, keine Zahl");
    const ergebnis = await featureOverrideService.checkOverride(client, SCHLUESSEL, org.id);
    assert.equal(ergebnis.overridden, false, "der geloeschte Hebel wirkt weiter");
  });

  it("ein leerer Funktionsschluessel wird abgewiesen", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!org) return t.skip("kein Gegenstand");
    /* Ohne die Regel liesse sich ein Hebel auf "  " anlegen: er stuende in der
       Liste, sperrte den echten Schluessel nicht und waere nicht zu finden. */
    await assert.rejects(
      () => featureOverrideService.upsertOverride(client, {
        featureKey: "   ", orgId: org.id, enabled: true, createdBy: null, reason: null, expiresAt: null
      }),
      /feature_overrides_key_nicht_leer|violates check constraint/,
      "ein leerer Funktionsschluessel wird angenommen");
  });
});

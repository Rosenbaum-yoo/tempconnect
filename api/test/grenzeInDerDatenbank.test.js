/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE STANDORTGRENZE STEHT IN DER DATENBANK (U6.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migration 226 stellt dreizehn Fremdschluessel von `(id)` auf `(id, org_id)` um.
 * Damit weist die DATENBANK einen org-fremden Standort ab, unabhaengig davon,
 * welcher Weg ihn schickt — die zweite Verteidigungslinie hinter den Pruefungen
 * im Dienst.
 *
 * WARUM DIESE DATEI DATENBANKFREI IST, und warum das nicht genuegt:
 *
 * Der eigentliche Nachweis gehoert an die Datenbank: ein Einfuegeversuch mit
 * org-fremder Kennung muss von PostgreSQL abgewiesen werden. Eine Probe gegen
 * den Dienst beweist die zweite Linie gar nicht. Genau das ist am 2026-10-01
 * gegen die laufende Datenbank gemessen worden, mit Gegenprobe:
 *
 *   UPDATE requisitions SET location_id = <Standort einer fremden Org>
 *     -> ERROR: violates foreign key constraint requisitions_location_org_fkey
 *   UPDATE requisitions SET location_id = <eigener Standort>
 *     -> angenommen
 *
 * NUR: eine Probe, die ohne Datenbank nicht laeuft, ist im taeglichen Tor keine.
 * Sie erscheint dort weder als Luecke noch als Zahl — eine Datei, die `tests 0`
 * liefert, sieht aus wie Erfolg. Deshalb prueft DIESE Datei den Migrationstext
 * selbst: sie kann auf jedem Rechner rot werden, und sie faellt auf, wenn jemand
 * die Migration aendert, ohne die Zusage zu kennen.
 *
 * Die datenbankgebundene Gegenstueck-Probe steht in
 * `test/integration/standortGrenzeDatenbank.flow.test.js` und uebersprint
 * ohne Datenbank — sichtbar, mit Grund.
 *
 * Run: node --test --test-force-exit test/grenzeInDerDatenbank.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(HIER, "..", "..", "sql", "migrations",
  "226_die_grenze_steht_in_der_datenbank.sql");

/* Die sieben Tabellen und ihre Org-Spalte. `vendor_pool` weicht ab: dort heisst
   sie `client_org_id`, weil die Lieferantenbeziehung dem KUNDEN gehoert. */
const BEZIEHUNGEN = [
  ["assignments", "location_id", "org_locations", "org_id"],
  ["assignments", "department_id", "org_departments", "org_id"],
  ["capacity_posts", "location_id", "org_locations", "org_id"],
  ["capacity_posts", "department_id", "org_departments", "org_id"],
  ["org_departments", "location_id", "org_locations", "org_id"],
  ["org_memberships", "location_id", "org_locations", "org_id"],
  ["org_memberships", "department_id", "org_departments", "org_id"],
  ["rate_cards", "location_id", "org_locations", "org_id"],
  ["rate_cards", "department_id", "org_departments", "org_id"],
  ["requisitions", "location_id", "org_locations", "org_id"],
  ["requisitions", "department_id", "org_departments", "org_id"],
  ["vendor_pool", "location_id", "org_locations", "client_org_id"],
  ["vendor_pool", "department_id", "org_departments", "client_org_id"]
];

const vorhanden = fs.existsSync(MIGRATION);
const text = vorhanden ? fs.readFileSync(MIGRATION, "utf8") : "";

/*
 * NUR DIE ANWEISUNGEN, nicht den Kopfkommentar.
 *
 * Der Kopf nennt die Ruecknahme mit Beispiel-SQL - DROP CONSTRAINT, ALTER TABLE,
 * die Namen der UNIQUE-Schluessel. Zwei Zusicherungen dieser Datei waren in
 * ihrer ersten Fassung rot, weil sie genau das als Anweisung gelesen haben: die
 * Reihenfolge im Beispiel ist umgekehrt, und ein ALTER TABLE steht dort vor
 * BEGIN. Die Probe hat also die Dokumentation angeklagt.
 *
 * Dieselbe Falle ist in dieser Woche viermal zugeschnappt (migrationenGegenBestand,
 * sqlSchemaWaechter, reputationSql, hier). Wer ausfuehrlich begruendet, muss beim
 * Pruefen zwischen Begruendung und Anweisung trennen - sonst wird Gruendlichkeit
 * zur Last.
 */
const ANWEISUNGEN = vorhanden ? text.slice(text.indexOf("BEGIN;")) : "";

describe("U6.1 · die Standortgrenze steht in der Datenbank", () => {
  it("die Migration ist da und wird gelesen", () => {
    /* Notbremse: ohne sie waeren alle Zusicherungen unten leer gruen. */
    assert.ok(vorhanden, `Migration fehlt: ${MIGRATION}`);
    assert.ok(text.length > 2000, "die Migration ist unerwartet kurz — stimmt der Pfad?");
  });

  it("die zwei Voraussetzungen stehen VOR den Fremdschluesseln", () => {
    /*
     * Ohne UNIQUE (id, org_id) kann kein zusammengesetzter Schluessel darauf
     * zeigen — PostgreSQL lehnt ihn ab. Die Reihenfolge ist deshalb keine
     * Ordnungsfrage, sondern eine Bedingung.
     */
    const uniqueOrte = ANWEISUNGEN.indexOf("org_locations_id_org_key");
    const uniqueAbt = ANWEISUNGEN.indexOf("org_departments_id_org_key");
    assert.ok(uniqueOrte > 0, "UNIQUE (id, org_id) auf org_locations fehlt");
    assert.ok(uniqueAbt > 0, "UNIQUE (id, org_id) auf org_departments fehlt");

    const ersterSchluessel = ANWEISUNGEN.indexOf("_location_org_fkey");
    assert.ok(ersterSchluessel > 0, "kein zusammengesetzter Schluessel gefunden");
    assert.ok(uniqueOrte < ersterSchluessel && uniqueAbt < ersterSchluessel,
      "ein UNIQUE steht NACH dem ersten Fremdschluessel — die Migration kann so nicht laufen");
  });

  it("alle dreizehn Beziehungen sind umgestellt — und keine fehlt", () => {
    const fehlend = [];
    for (const [tab, spalte, ziel, orgSpalte] of BEZIEHUNGEN) {
      const neu = `FOREIGN KEY (${spalte}, ${orgSpalte}) REFERENCES ${ziel}(id, org_id)`;
      if (!ANWEISUNGEN.includes(neu)) fehlend.push(`${tab}.${spalte} -> ${ziel}`);
    }
    assert.deepEqual(fehlend, [],
      `diese Beziehungen sind nicht zusammengesetzt:\n  ${fehlend.join("\n  ")}`);
    assert.equal(BEZIEHUNGEN.length, 13, "die Liste selbst ist nicht mehr vollstaendig");
  });

  it("jeder alte einspaltige Schluessel wird gefaellt", () => {
    /* Ein ADD ohne DROP legt einen ZWEITEN Schluessel daneben — die alte,
       loechrige Grenze bliebe wirksam und niemand saehe es. */
    const fehlend = [];
    for (const [tab, spalte] of BEZIEHUNGEN) {
      const drop = `DROP CONSTRAINT ${tab}_${spalte}_fkey`;
      if (!ANWEISUNGEN.includes(drop)) fehlend.push(`${tab}_${spalte}_fkey`);
    }
    assert.deepEqual(fehlend, [],
      `diese alten Schluessel werden nicht gefaellt:\n  ${fehlend.join("\n  ")}`);
  });

  it("JEDES ON DELETE SET NULL nennt seine Spalte — sonst ist es Datenverlust", () => {
    /*
     * DER WICHTIGSTE PUNKT DIESER MIGRATION.
     *
     * Ein zusammengesetzter Fremdschluessel mit ON DELETE SET NULL nullt in
     * PostgreSQL ALLE referenzierenden Spalten — also auch die Org-Spalte. Das
     * ist hier keine Unschoenheit:
     *
     *   In VIER der sieben Tabellen ist die Org-Spalte NOT NULL (gemessen:
     *   org_departments, org_memberships, rate_cards, vendor_pool.client_org_id).
     *   Dort bricht das Loeschen eines Standorts mit einem Fehler ab.
     *
     *   In den DREI anderen ist sie nullbar (assignments, capacity_posts,
     *   requisitions). Dort geht es STILL durch, und die Zeile verliert ihre
     *   Organisation. Das ist der schlimmere Fall, weil ihn niemand merkt.
     *
     * Die Spaltenauswahl gibt es seit PostgreSQL 15; hier laeuft 16.12.
     */
    const ohneAuswahl = [];
    const re = /ON DELETE SET NULL(\s*\()?/g;
    let m;
    while ((m = re.exec(ANWEISUNGEN))) {
      /* Nur die ANWEISUNGEN, nicht die Rueckname-Beispiele im Kopfkommentar:
         dort steht der einspaltige Schluessel, und bei dem ist SET NULL ohne
         Auswahl richtig. Die Anweisungen stehen nach BEGIN. */
      if (!m[1]) ohneAuswahl.push(ANWEISUNGEN.slice(Math.max(0, m.index - 120), m.index + 40).trim());
    }
    assert.deepEqual(ohneAuswahl, [],
      `\n${ohneAuswahl.length} mal ON DELETE SET NULL OHNE Spaltenauswahl:\n\n${ohneAuswahl.join("\n\n")}\n\n` +
      `Das nullt auch die Org-Spalte. In vier Tabellen ist sie NOT NULL (Abbruch),\n` +
      `in drei nullbar (stiller Verlust der Organisation).\n`);

    /* Und die Gegenprobe: es gibt UEBERHAUPT Spaltenauswahlen, sonst waere die
       Zusicherung oben leer gruen. */
    const mitAuswahl = (ANWEISUNGEN.match(/ON DELETE SET NULL \(/g) || []).length;
    assert.equal(mitAuswahl, 13,
      `${mitAuswahl} Spaltenauswahlen gefunden, erwartet 13 — eine je Beziehung`);
  });

  it("vendor_pool benutzt client_org_id, nicht org_id", () => {
    /*
     * Die eine Tabelle, die abweicht: `vendor_pool` hat kein `org_id`, sondern
     * `client_org_id` (und daneben `supplier_org_id` fuer die andere Seite). Wer
     * hier org_id einsetzt, bekommt einen Fehler — wer supplier_org_id einsetzt,
     * bekommt eine Grenze, die das FALSCHE bewacht: der Standort des Lieferanten
     * hat mit dieser Zeile nichts zu tun.
     */
    assert.match(ANWEISUNGEN, /FOREIGN KEY \(location_id, client_org_id\)/,
      "vendor_pool.location_id ist nicht an client_org_id gebunden");
    assert.match(ANWEISUNGEN, /FOREIGN KEY \(department_id, client_org_id\)/,
      "vendor_pool.department_id ist nicht an client_org_id gebunden");
    assert.equal(/vendor_pool[\s\S]{0,400}?FOREIGN KEY \(location_id, supplier_org_id\)/.test(ANWEISUNGEN), false,
      "vendor_pool ist an supplier_org_id gebunden — das bewacht die falsche Seite");
  });

  it("die Ruecknahme steht im Kopf", () => {
    /* Eine Migration ohne benannte Ruecknahme ist nach den Projektregeln nicht
       fertig. Sie verbietet nur, also ist sie vollstaendig rueckholbar — aber das
       muss dort stehen, wo jemand es im Ernstfall liest. */
    const kopf = text.slice(0, text.indexOf("BEGIN;"));
    assert.match(kopf, /RUECKNAHME/i, "die Ruecknahme ist im Kopf nicht benannt");
    assert.match(kopf, /DROP CONSTRAINT/,
      "die Ruecknahme nennt kein DROP CONSTRAINT — ein Hinweis ohne Anweisung hilft nicht");
    assert.match(kopf, /org_locations_id_org_key/,
      "die Ruecknahme vergisst die beiden UNIQUE-Voraussetzungen");
  });

  it("die Migration laeuft in EINER Transaktion", () => {
    /* Dreizehn Umstellungen halb angewandt waeren der schlechteste Zustand:
       einige Beziehungen bewacht, andere nicht, und kein Hinweis darauf. */
    assert.match(ANWEISUNGEN, /^BEGIN;$/m);
    assert.match(ANWEISUNGEN, /^COMMIT;$/m);
    /* Innerhalb der ANWEISUNGEN steht BEGIN; an Position 0, jedes ALTER danach -
       der Kopfkommentar mit seinem Ruecknahme-Beispiel bleibt aussen vor. */
    assert.equal(ANWEISUNGEN.indexOf("BEGIN;"), 0);
    assert.ok(ANWEISUNGEN.indexOf("ALTER TABLE") > 0, "keine Anweisung gefunden");
    assert.ok(ANWEISUNGEN.lastIndexOf("ALTER TABLE") < ANWEISUNGEN.indexOf("COMMIT;"),
      "es wird nach COMMIT geaendert");
  });
});

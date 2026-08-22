#!/usr/bin/env node
/**
 * schema-snapshot.js — erzeugt api/test/fixtures/schema.json aus der LAUFENDEN Datenbank.
 *
 * WARUM AUS DER LAUFENDEN DATENBANK UND NICHT AUS sql/migrations/
 * Die Migrationen sind ein Programm, keine Beschreibung. Drei gemessene Gruende,
 * warum ihre Ableitung das falsche Schema ergibt:
 *   1. Das Ledger _migrations enthaelt 197 Eintraege, das Verzeichnis 184 Dateien —
 *      dreizehn angewandte Migrationen haben keine Datei mehr (u. a. reviews,
 *      usage_counters, agency_api_keys, email_verification_tokens stammen daher).
 *   2. Sechs Live-Tabellen entstehen ueberhaupt nicht per Migration: session und
 *      staff_session legt connect-pg-simple zur Laufzeit an (api/app.js).
 *      Produktionscode fragt session an fuenf Stellen ab — eine Ableitung aus den
 *      Migrationen wuerde diese korrekten Abfragen als Fehler melden.
 *   3. Umgekehrt existiert 059_feature_overrides.sql, ist im Ledger als angewandt
 *      verbucht — und die Tabelle fehlt trotzdem. Ein migrationsbasierter Waechter
 *      meldete gruen, waehrend die Produktion 500 wirft.
 *
 * WARUM DOCKER STATT pg
 * Auf dem Host ist weder DATABASE_URL noch DB_HOST gesetzt (api/.env existiert nicht,
 * die Repo-.env zeigt auf den Container-Netznamen "db"). Ein pg-Client des Hosts
 * verbindet also nicht. `docker exec` umgeht das, ohne Zugangsdaten zu brauchen.
 *
 * AUFRUF
 *   node scripts/schema-snapshot.js          (aus api/)
 *   npm run schema:snapshot
 *
 * Das Ergebnis wird eingecheckt. Der Waechter (test/sqlSchemaWaechter.test.js)
 * liest ausschliesslich diese Datei und laeuft damit auf dem Host bei JEDEM
 * Testlauf — nicht nur im Container.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_DIR, "..");
const ZIEL = path.join(API_DIR, "test", "fixtures", "schema.json");

const CONTAINER = process.env.TC_DB_CONTAINER || "tempconnect_db";
const DB_USER = process.env.TC_DB_USER || "tempconnect";
const DB_NAME = process.env.TC_DB_NAME || "tempconnect";

/**
 * Eine Abfrage, ein JSON-Dokument. `-tAc` liefert den Wert roh ohne Rahmen;
 * psql schreibt die Collation-Warnung nach stderr, die wir bewusst ignorieren.
 */
const ABFRAGE = `
SELECT json_build_object(
  'tabellen', COALESCE((
    SELECT json_object_agg(t.tab, t.spalten)
    FROM (
      SELECT c.table_name AS tab,
             json_agg(json_build_object('name', c.column_name, 'nullable', c.is_nullable = 'YES')
                      ORDER BY c.ordinal_position) AS spalten
      FROM information_schema.columns c
      JOIN information_schema.tables it
        ON it.table_schema = c.table_schema AND it.table_name = c.table_name
      WHERE c.table_schema = 'public'
      GROUP BY c.table_name
    ) t
  ), '{}'::json),
  /*
   * ERLAUBTE WERTE aus den CHECK-Constraints.
   *
   * WARUM DAS DAZUKAM: Der Abzug wusste bisher, WELCHE Spalten es gibt — aber
   * nicht, welche WERTE sie annehmen duerfen. Genau in dieser Luecke lebte ein
   * Fehler, der am 2026-08-22 gefunden wurde: getPendingAbuseReports las
   * WHERE status = 'pending' auf einer Tabelle, deren CHECK nur
   * open | under_review | resolved_dismissed | resolved_action_taken erlaubt.
   * Der Posteingang war dauerhaft leer, und reportProfileAbuse schrieb drei
   * Gruende, die der CHECK ablehnte. Beides lautlos, ueber Monate.
   *
   * Eine Spaltenliste haette das nie bemerkt: die Spalten waren ja da. Ab jetzt
   * traegt der Abzug auch die erlaubte Wertemenge, sodass eine Probe einen
   * geschriebenen Literal gegen die Wirklichkeit halten kann.
   *
   * Erfasst wird nur die einfache, mit Abstand haeufigste Form
   * spalte = ANY (ARRAY['a','b',...]) (227 davon im Bestand). Zusammengesetzte
   * Bedingungen bleiben aussen vor — lieber eine Teilmenge, die STIMMT, als
   * eine vollstaendige, die raet.
   */
  'pruefwerte', COALESCE((
    SELECT json_object_agg(p.tab, p.spalten)
    FROM (
      SELECT tab, json_object_agg(spalte, werte) AS spalten
      FROM (
        SELECT t.relname AS tab,
               (regexp_match(pg_get_constraintdef(c.oid), '\\(?([a-z_]+)\\)?(::text)? = ANY'))[1] AS spalte,
               (SELECT json_agg(w ORDER BY w)
                  FROM regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::', 'g') AS m(w2),
                       LATERAL (SELECT m.w2[1]) AS x(w)) AS werte
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'c'
          AND n.nspname = 'public'
          AND pg_get_constraintdef(c.oid) LIKE '% = ANY %ARRAY[%'
      ) roh
      WHERE spalte IS NOT NULL
      GROUP BY tab
    ) p
  ), '{}'::json),
  'sichten', COALESCE((
    SELECT json_agg(table_name ORDER BY table_name)
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type <> 'BASE TABLE'
  ), '[]'::json),
  'funktionen', COALESCE((
    SELECT json_agg(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ), '[]'::json),
  'enums', COALESCE((
    SELECT json_agg(DISTINCT t.typname)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  ), '[]'::json)
)::text
`.replace(/\s+/g, " ").trim();

function psql(sql) {
  const r = spawnSync("docker", ["exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-tAc", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (r.error) throw new Error(`docker exec fehlgeschlagen: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`psql exit ${r.status}: ${(r.stderr || "").trim()}`);
  return (r.stdout || "").trim();
}

/**
 * Frische-Signal fuer Schicht 1: sortierte Liste dateiname+sha256 ueber
 * sql/init.sql + sql/migrations/*.sql. Wer eine Migration hinzufuegt oder aendert,
 * bekommt rot auf dem eigenen Rechner — ohne Datenbank, bei jedem Testlauf.
 */
/*
 * init.sql und die Migrationen werden GETRENNT verhasht — nicht aus Ordnungsliebe,
 * sondern weil der API-Container nur sql/migrations einbindet, sql/init.sql aber
 * nicht. Ein gemeinsamer Hash waere auf dem Host und im Container zwangslaeufig
 * verschieden, und der Waechter meldete im Container ewig "Momentaufnahme
 * veraltet" — also genau die Sorte Dauer-Rot, nach der ein Test abgeschaltet wird.
 * Getrennt vergleicht jede Seite das, was sie sehen kann.
 */
/*
 * ZEILENENDEN WERDEN VEREINHEITLICHT, bevor gehasht wird.
 *
 * Ohne diesen Schritt haengt der Fingerabdruck an CRLF gegen LF: git checkt auf
 * Windows mit CRLF aus, der Linux-Container sieht LF — dieselbe Datei, andere
 * Bytes, anderer Hash. Der Waechter konnte damit nur in EINER der beiden Welten
 * gruen sein; am 2026-08-15 stand er auf dem Host rot, weil die Momentaufnahme
 * im Container erzeugt worden war (und umgekehrt genauso).
 *
 * Das ist dieselbe Falle, die der Kommentar darueber fuer init.sql schon
 * beschreibt — nur eine Ebene tiefer: nicht WELCHE Dateien beide Seiten sehen,
 * sondern WIE sie sie lesen.
 */
function inhaltNormalisiert(pfad) {
  return Buffer.from(fs.readFileSync(pfad, "utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function migrationsFingerabdruck(repoRoot) {
  const initPfad = path.join(repoRoot, "sql", "init.sql");
  const init = fs.existsSync(initPfad)
    ? crypto.createHash("sha256").update(inhaltNormalisiert(initPfad)).digest("hex")
    : null;

  const teile = [];
  const migDir = path.join(repoRoot, "sql", "migrations");
  if (fs.existsSync(migDir)) {
    for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
      teile.push(`${f}:${crypto.createHash("sha256").update(inhaltNormalisiert(path.join(migDir, f))).digest("hex")}`);
    }
  }
  return {
    init,
    dateien: teile.length,
    hash: crypto.createHash("sha256").update(teile.join("\n")).digest("hex")
  };
}

/*
 * Ab hier laeuft das Skript. Bewusst hinter einem Einstiegspunkt-Check:
 * `migrationsFingerabdruck` soll von Tests IMPORTIERBAR sein, ohne dass dabei
 * psql anlaeuft und eine Datenbank verlangt. Genau daran ist es vorher
 * gescheitert — der Waechter-Test hat die Berechnung deshalb ABGESCHRIEBEN
 * statt sie zu benutzen, und zwei Kopien derselben Formel driften.
 */
function main() {
const roh = psql(ABFRAGE);
if (!roh || roh === "null") throw new Error("psql lieferte kein JSON — laeuft der Container?");
const daten = JSON.parse(roh);

const tabellen = {};
for (const [name, spalten] of Object.entries(daten.tabellen || {})) {
  tabellen[name] = {
    spalten: spalten.map((s) => s.name).sort(),
    // NOT-NULL-Spalten ohne Default: nur diese darf niemand auf NULL setzen.
    nicht_null: spalten.filter((s) => !s.nullable).map((s) => s.name).sort()
  };
}

const ausgabe = {
  _hinweis:
    "GENERIERT — nicht von Hand bearbeiten. Neu erzeugen mit: npm run schema:snapshot " +
    "(liest die laufende Datenbank im Container tempconnect_db).",
  erzeugt_am: new Date().toISOString(),
  quelle: `docker exec ${CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}`,
  migrations_fingerabdruck: migrationsFingerabdruck(REPO_ROOT),
  pruefwerte: Object.fromEntries(
    Object.entries(daten.pruefwerte || {}).sort(([a], [b]) => a.localeCompare(b))
  ),
  sichten: (daten.sichten || []).sort(),
  funktionen: (daten.funktionen || []).sort(),
  enums: (daten.enums || []).sort(),
  tabellen: Object.fromEntries(Object.entries(tabellen).sort(([a], [b]) => a.localeCompare(b)))
};

fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
fs.writeFileSync(ZIEL, `${JSON.stringify(ausgabe, null, 2)}\n`, "utf8");

const anzSpalten = Object.values(tabellen).reduce((n, t) => n + t.spalten.length, 0);
console.log(
  `[schema-snapshot] ${Object.keys(tabellen).length} Relationen, ${anzSpalten} Spalten, ` +
  `${ausgabe.funktionen.length} Funktionen -> ${path.relative(REPO_ROOT, ZIEL)}`
);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

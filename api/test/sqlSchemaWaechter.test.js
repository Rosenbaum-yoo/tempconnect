/**
 * Der SQL-Schema-Waechter.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESEN TEST GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Produktionscode schreibt SQL gegen Spalten und Tabellen, die es nicht gibt.
 * Die Tests darueber sind gruen, weil ihre Mock-Pools JEDE Abfrage annehmen und
 * eine erfundene Antwort liefern. Der Fehler faellt erst dem Kunden auf.
 *
 * Zwei Funde vom 2026-08-13, beide derselben Klasse:
 *
 *   1. demand_requests.supplier_response_count und .first_supplier_response_at
 *      existierten nicht. Zwei Endpunkte lieferten 500 (Befund P1-15).
 *
 *   2. dataGovernanceService.anonymizeUser hatte SECHS solcher Fehler in einem
 *      einzigen Ablauf: users.is_active (Spalte fehlt), audit_log.user_id statt
 *      actor_id, company_contacts.company_profile_id, offers.created_by,
 *      requests.sender_id sowie password_hash = NULL gegen eine NOT-NULL-Spalte.
 *      Weil alles in withTransaction laeuft, rollte JEDE DSGVO-Kontoloeschung
 *      still zurueck: Art. 17 DSGVO war eine Absichtserklaerung, kein Code.
 *
 * Beide Male war die Suite gruen. Das ist der eigentliche Defekt — nicht der
 * Tippfehler, sondern dass nichts ihn sehen konnte. Dieser Test schliesst die
 * Luecke: er liest das SQL aus dem Quelltext und vergleicht es mit dem echten
 * Schema. Er wird rot, BEVOR die Abfrage jemals eine Datenbank sieht.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WIE ER ARBEITET
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Schicht 1 (laeuft auf dem HOST, ohne Datenbank, bei jedem `npm test`):
 *
 *   a) FRISCHE   — api/test/fixtures/schema.json traegt einen Fingerabdruck
 *                  ueber sql/init.sql + sql/migrations/*.sql. Wer eine Migration
 *                  hinzufuegt oder aendert, bekommt rot auf dem eigenen Rechner
 *                  mit dem Befehl in der Meldung. Niemand muss daran denken.
 *
 *   b) TABELLEN  — jede Relation hinter FROM / JOIN / INSERT INTO / UPDATE /
 *                  USING muss im Schema existieren.
 *
 *   c) SPALTEN   — drei Konstrukte, in denen die Zuordnung Spalte→Tabelle
 *                  syntaktisch eindeutig ist (Details unten).
 *
 *   d) NOT NULL  — `SET spalte = NULL` gegen eine NOT-NULL-Spalte. Das ist kein
 *                  Namensfehler, sondern ein Constraint-Bruch; ein reiner
 *                  Namensabgleich findet ihn nie. Fund 2 starb unter anderem hier.
 *
 * Schicht 2 (nur mit Datenbank, also im Container / in CI):
 *
 *   e) DRIFT     — die eingecheckte Momentaufnahme gegen information_schema der
 *                  laufenden Datenbank. Faengt, was Schicht 1 prinzipiell nicht
 *                  sehen kann: von Hand ausgefuehrtes DDL, eine still
 *                  fehlgeschlagene Migration, ein wiederhergestelltes Backup.
 *
 * Dazu eine SELBSTPROBE (f): der Pruefer laeuft ueber einen kleinen Quelltext,
 * der genau die beiden Funde von heute nachbildet, und MUSS sie finden. Ohne
 * diese Probe waere ein kaputter Pruefer von einem sauberen Bestand nicht zu
 * unterscheiden — gruen hiesse dann nichts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DAS SCHEMA AUS DER LAUFENDEN DATENBANK KOMMT UND NICHT AUS DEN MIGRATIONEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migrationen sind ein Programm, keine Beschreibung. Drei gemessene Gruende:
 *   - Das Ledger _migrations hat 197 Eintraege, das Verzeichnis 184 Dateien.
 *     Dreizehn angewandte Migrationen haben keine Datei mehr im Repo; daher
 *     stammen u. a. reviews, usage_counters, agency_api_keys.
 *   - session und staff_session entstehen zur LAUFZEIT (connect-pg-simple,
 *     api/app.js). Produktionscode fragt `session` an fuenf Stellen ab — eine
 *     Ableitung aus den Migrationen meldete diese korrekten Abfragen als Fehler.
 *   - Umgekehrt existiert 059_feature_overrides.sql, ist als angewandt verbucht,
 *     und die Tabelle fehlt trotzdem. Ein migrationsbasierter Waechter meldete
 *     gruen, waehrend die Produktion 500 wirft.
 * Erzeugt wird die Momentaufnahme mit `npm run schema:snapshot`
 * (api/scripts/schema-snapshot.js, liest den Container tempconnect_db).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ER BEWUSST NICHT KANN — und warum
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Regel lautet: lieber weniger Konstrukte pruefen und die sicher. Ein
 * Waechter, der bei jedem Lauf Fehlalarme wirft, wird abgeschaltet und ist dann
 * schlimmer als keiner. Deshalb bleibt Folgendes ausdruecklich ungeprueft:
 *
 *  1. SPALTEN IN MEHR-RELATIONEN-ABFRAGEN (JOIN, CTE, LATERAL, abgeleitete
 *     Tabellen). Dort muesste ein Alias-Aufloeser pro Query-Ebene arbeiten:
 *     `o` und `so` sind beide organizations; `s` ist in derselben Datei einmal
 *     ein LATERAL-Alias und einmal die Tabelle subscriptions. Aggregat-Aliasse
 *     (`AS period`, `AS rn`) und LATERAL-Ausgabespalten
 *     (submission_stats.customer_confirmed_submission_count) existieren in
 *     keinem Katalog. Das ist Phase 2 und braucht einen echten Postgres-Parser.
 *
 *  2. SQL MIT INTERPOLATION `${...}` fuer die Spaltenpruefung. 568 Interpolationen
 *     setzen WHERE-Fragmente, Builder-Konstanten und Platzhalter-Nummern ein; der
 *     String im Quelltext ist dann kein gueltiges SQL mehr. Fuer die TABELLEN-
 *     pruefung kostet die Maskierung nichts: gemessen wird NIE ein Tabellenname
 *     interpoliert (0 von 568) — Relationen stehen statisch im Text.
 *
 *  3. DYNAMISCH GEBAUTE SPALTENLISTEN (`${fields.join(', ')}`,
 *     `${sets.join(", ")}`, `SELECT ${selectColumns}`). Ihr Inhalt entsteht erst
 *     zur Laufzeit aus Nutzereingaben oder Konfiguration. Statisch nicht
 *     entscheidbar — sie werden uebersprungen, nicht geraten.
 *
 *  4. `SELECT *` UND `RETURNING *`. Es gibt keinen Spaltennamen im SQL, waehrend
 *     der JS-Code danach `rows[0].feld` liest. Ein Tippfehler dort ist fuer jede
 *     Textanalyse unsichtbar und taucht erst als `undefined` auf.
 *
 *  5. SPALTEN AUS `information_schema` / `pg_catalog`. Der Code, der selbst
 *     Schema-Existenz prueft (routes/occ/_helpers.js), gehoert nicht bewacht.
 *
 *  6. TABELLENFUNKTIONEN IN FROM (`unnest(...) AS t(a,b)`,
 *     `make_interval(hours => $1)`). Ihre Ausgabespalten definiert die
 *     Alias-Liste, nicht der Katalog — Statements damit werden fuer die
 *     Spaltenpruefung uebersprungen.
 *
 *  7. TYPEN, NICHT NAMEN. Dass `total_cents` existiert, heisst nicht, dass ein
 *     Text hineinpasst. Typfehler sind Sache der Datenbank, nicht dieses Tests.
 *
 * Alles Uebersprungene wird GEZAEHLT und am Ende ausgegeben (Topf 2). Ein
 * Waechter, der Unpruefbares verschweigt, behauptet Abdeckung, die er nicht hat.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BESTANDSAUFNAHME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der heutige Bestand ist NICHT sauber. Der Waechter hat beim ersten Lauf
 * gefunden (alle live gegen tempconnect_db bestaetigt):
 *
 *   5 fehlende Tabellen  + 43 Spalten-Befunde  = 48 Eintraege in BESTAND,
 *   verteilt auf 18 Dateien und 99 Fundstellen im Code.
 *
 * BESTAND zaehlt je Datei und Spalte (ohne Zeilennummer), die 99 Fundstellen
 * zaehlen jedes Vorkommen — dieselbe Spalte in drei Abfragen einer Datei ist
 * ein Eintrag und drei Fundstellen.
 *
 * Sie stehen unten einzeln und mit Begruendung. Diese Liste kann nur SCHRUMPFEN:
 *   - ein NEUER Befund macht rot (das ist der Zweck),
 *   - ein Eintrag, der nicht mehr auftritt, macht ebenfalls rot ("behoben,
 *     bitte streichen") — sonst verrottet die Liste zur Ausrede.
 *
 * Lauf: node --test --test-force-exit test/sqlSchemaWaechter.test.js
 * Alle Befunde inkl. Bestand sehen: TC_WAECHTER_DUMP=1 node --test ...
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrationsFingerabdruck } from "../scripts/schema-snapshot.js";

/*
 * hasDb steht hier woertlich statt als Import aus test/integration/helpers.js —
 * gemessen, nicht vermutet: dieser Import kostet 8,9 Sekunden, weil helpers.js
 * ueber createApp die komplette Express-Anwendung samt supertest laedt. Der
 * Waechter braucht davon auf dem Host NICHTS: Schicht 1 arbeitet ohne Datenbank,
 * und `node --test` startet je Testdatei einen eigenen Prozess. Neun Sekunden
 * Aufschlag auf JEDEN `npm test`-Lauf fuer eine Abfrage, die dort ohnehin
 * uebersprungen wird, waere schlechter Handel.
 *
 * createPool wird deshalb erst im Datenbank-Zweig dynamisch nachgeladen — dort
 * gilt wieder das Hausmuster. Damit die Kopie unten nicht auseinanderlaeuft,
 * vergleicht der Datenbank-Test beide Werte gegeneinander.
 * Quelle der Wahrheit: api/test/integration/helpers.js
 */
const hasDb = !!(
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════════════════════════════════════════════════════════
 * 0. PFADE — ueber import.meta.url, mit INHALTSPRUEFUNG
 *
 * Nicht auf blosse Existenz pruefen: Docker legt das Ziel eines Bind-Mounts auf
 * dem Host als LEERES Verzeichnis an. Wer nur `existsSync` fragt, findet dieses
 * leere Verzeichnis, scannt null Dateien und ist lautlos gruen. Es zaehlt nur
 * ein Verzeichnis, in dem wirklich JavaScript mit SQL liegt.
 * ═══════════════════════════════════════════════════════════════════════════ */

const KORPUS = ["services", "routes", "routes/occ", "middleware", "jobs", "db", "config", "utils"];

function hatQuellen(apiDir) {
  try {
    return fs.readdirSync(path.join(apiDir, "services")).filter((f) => f.endsWith(".js")).length >= 20;
  } catch { return false; }
}

const API_KANDIDATEN = [path.resolve(__dirname, ".."), process.cwd()];
const API_DIR = API_KANDIDATEN.find(hatQuellen) || API_KANDIDATEN[0];
const SCHEMA_DATEI = path.join(API_DIR, "test", "fixtures", "schema.json");

/*
 * sql/ liegt NICHT immer eine Ebene ueber api/. Lokal ist es die Repo-Wurzel,
 * im API-Container liegt der Mount unter /app/sql — dort waere `api/..` schlicht
 * `/`. Deshalb wird auch dieser Pfad ueber INHALT gesucht, nicht ueber Struktur
 * geraten: es zaehlt nur ein Verzeichnis, in dem wirklich Migrationen liegen.
 * (Genau daran ist der erste Containerlauf gescheitert — richtigerweise: der
 * Test wurde rot statt lautlos gruen.)
 */
function hatMigrationen(wurzel) {
  try {
    return fs.readdirSync(path.join(wurzel, "sql", "migrations")).filter((f) => f.endsWith(".sql")).length >= 100;
  } catch { return false; }
}
const WURZEL_KANDIDATEN = [path.resolve(API_DIR, ".."), API_DIR, process.cwd()];
const REPO_ROOT = WURZEL_KANDIDATEN.find(hatMigrationen) || WURZEL_KANDIDATEN[0];

/* Untergrenzen aus der Messung vom 2026-08-13 (Ist: 312 Dateien, 1876 SQL-
 * Literale, 2714 Tabellen-Referenzen, 11190 gepruefte Spaltenbezuege). Sie sind
 * bewusst grosszuegig unter dem Ist — sie sollen keinen Zuwachs bestrafen,
 * sondern den Unterschied zwischen "nichts gefunden" und "nichts gesehen"
 * hoerbar machen. */
const MIN_DATEIEN = 150;
const MIN_SQL_LITERALE = 1200;
const MIN_TABELLEN_REFS = 1500;
const MIN_SPALTEN_PRUEFUNGEN = 5000;
const MIN_SCHEMA_TABELLEN = 150;
const MIN_SCHEMA_SPALTEN = 2000;

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. SCHEMA LADEN
 * ═══════════════════════════════════════════════════════════════════════════ */

const schemaVorhanden = fs.existsSync(SCHEMA_DATEI);
const schema = schemaVorhanden ? JSON.parse(fs.readFileSync(SCHEMA_DATEI, "utf8")) : null;
const TABELLEN = schema?.tabellen || {};
const TAB_NAMEN = new Set(Object.keys(TABELLEN));
const SICHTEN = new Set(schema?.sichten || []);
const DB_FUNKTIONEN = new Set((schema?.funktionen || []).map((f) => f.toLowerCase()));
/* Sichten liefern Zeilen wie Tabellen — als Relation gueltig, aber ohne
 * Spaltenliste in der Momentaufnahme, daher nur fuer die Tabellenpruefung. */
const RELATIONEN = new Set([...TAB_NAMEN, ...SICHTEN]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. ZEICHEN-SCANNER — grenzt JS-Literale ab
 *
 * Warum kein Regex: /`[^`]*`/g liefert in 288 von 290 Dateien dasselbe, in zwei
 * aber nicht (recurringBillingService.js, workerSubmissionService.js). Ursache
 * sind verschachtelte Templates innerhalb ${…}; die Regex schneidet das Literal
 * an der falschen Stelle. Ergebnis waere ein Waechter, der ein Statement halb
 * liest und stumm gruen bleibt — genau die Pathologie, gegen die er gebaut ist.
 *
 * Der Scanner muss dreierlei koennen: JS-Kommentare ueberspringen (sonst wird
 * auskommentiertes und absichtlich falsches Beispiel-SQL geprueft — das Repo
 * dokumentiert seine SQL-Entscheidungen ausfuehrlich, inkl. Gegenbeispielen),
 * '/"-Strings als eigene Klasse fuehren (18,3 % der SQL-Literale stehen in
 * doppelten Anfuehrungszeichen — darunter die KOMPLETTE DSGVO-Schicht, also
 * genau Fund 2), und Regex-Literale erkennen, damit ein /['"]/ den Scanner
 * nicht aus dem Tritt bringt.
 * ═══════════════════════════════════════════════════════════════════════════ */

const M_I = "\u0001";   // maskierte Interpolation ${...}
const M_S = "\u0002";   // maskiertes SQL-String-Literal

function entschaerfe(s) {
  return s.replace(/\\n/g, "\n").replace(/\\t/g, " ").replace(/\\r/g, " ").replace(/\\(.)/g, "$1");
}

export function jsLiterale(src) {
  const out = [];
  let i = 0, zeile = 1, vorher = "start";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { zeile++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") zeile++; i++; }
      i += 2; continue;
    }
    if (c === "/" && (vorher === "op" || vorher === "start")) {
      const start = i; i++;
      let inClass = false, ok = false;
      while (i < n) {
        const d = src[i];
        if (d === "\\") { i += 2; continue; }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { ok = true; i++; break; }
        i++;
      }
      if (!ok) i = start + 1;
      vorher = "wert"; continue;
    }
    if (c === "'" || c === '"') {
      const q = c, startZ = zeile; let buf = ""; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { buf += src[i] + (src[i + 1] || ""); i += 2; continue; }
        if (src[i] === "\n") zeile++;
        buf += src[i]; i++;
      }
      i++;
      out.push({ text: entschaerfe(buf), zeile: startZ });
      vorher = "wert"; continue;
    }
    if (c === "`") {
      const startZ = zeile; let buf = ""; i++;
      while (i < n) {
        const d = src[i];
        if (d === "\\") { buf += d + (src[i + 1] || ""); i += 2; continue; }
        if (d === "`") { i++; break; }
        if (d === "$" && src[i + 1] === "{") {
          // ${...} mit eigener Klammer-, String- und Template-Tiefe ueberspringen
          let tiefe = 1; i += 2;
          while (i < n && tiefe > 0) {
            const e = src[i];
            if (e === "\n") zeile++;
            if (e === "{") tiefe++;
            else if (e === "}") tiefe--;
            else if (e === "`" || e === "'" || e === '"') {
              const q2 = e; i++;
              while (i < n && src[i] !== q2) {
                if (src[i] === "\\") { i += 2; continue; }
                if (src[i] === "\n") zeile++;
                i++;
              }
            }
            i++;
          }
          buf += M_I; continue;
        }
        if (d === "\n") zeile++;
        buf += d; i++;
      }
      out.push({ text: entschaerfe(buf), zeile: startZ });
      vorher = "wert"; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const w = src.slice(i, j);
      vorher = /^(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(w) ? "op" : "wert";
      i = j; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < n && /[0-9.eExXa-fA-F_]/.test(src[j])) j++; i = j; vorher = "wert"; continue; }
    vorher = (c === ")" || c === "]" || c === "}") ? "wert" : "op";
    i++;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. SQL NORMALISIEREN
 *
 * Reihenfolge in EINEM Durchlauf: SQL-Kommentare weg, String-Literale maskiert,
 * Dollar-Quoting maskiert. Zwei getrennte Durchlaeufe waeren falsch — '--' kann
 * in einem String stehen und "'" in einem Kommentar.
 *
 * Warum Strings maskiert werden muessen: das Audit-Namensschema ist
 * `bereich.aktion` ('capacity.match_found', 'timesheet.submitted') und damit
 * formal ununterscheidbar von `tabelle.spalte`. Ohne Maskierung meldete der
 * Pruefer 234 nicht existierende Tabellen.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function normalisiere(sql) {
  let out = "", i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") { while (i < n && sql[i] !== "\n") i++; out += " "; continue; }
    if (c === "/" && sql[i + 1] === "*") {
      i += 2; while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++; i += 2; out += " "; continue;
    }
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      out += `'${M_S}'`; continue;
    }
    if (c === "$" && sql[i + 1] === "$") {
      i += 2; while (i < n && !(sql[i] === "$" && sql[i + 1] === "$")) i++; i += 2; out += `'${M_S}'`; continue;
    }
    if (c === '"') { i++; let b = ""; while (i < n && sql[i] !== '"') { b += sql[i]; i++; } i++; out += b; continue; }
    if (c === "\n" || c === "\t" || c === "\r") { out += " "; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* EXTRACT(EPOCH FROM x) und SUBSTRING(x FROM y FOR z) benutzen FROM als
 * FUNKTIONS-Syntax, nicht als Klausel. Ohne diese Maskierung erfindet die
 * Tabellenpruefung dort Geistertabellen (28 gemessene Stellen). */
function maskiereSyntaxFunktionen(sql) {
  const re = /\b(EXTRACT|SUBSTRING|TRIM|POSITION|OVERLAY)\s*\(/gi;
  let out = sql, schutz = 0;
  while (schutz++ < 60) {
    re.lastIndex = 0;
    const m = re.exec(out);
    if (!m) break;
    let i = m.index + m[0].length, tiefe = 1;
    while (i < out.length && tiefe > 0) { if (out[i] === "(") tiefe++; else if (out[i] === ")") tiefe--; i++; }
    out = `${out.slice(0, m.index)} ${M_I} ${out.slice(i)}`;
  }
  return out;
}

const SQL_VERB = /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/i;
const SQL_STRUKTUR = /\b(FROM|INTO|SET|JOIN|VALUES|WHERE)\b/i;

/* Die drei Lookbehinds sind keine Kosmetik, sie entfernen 76 gemessene
 * Falschtreffer:
 *   DO UPDATE SET            -> 66 Upserts liefern sonst die "Tabelle" set
 *   FOR UPDATE OF x          -> liefert sonst die "Tabelle" of
 *   IS NOT DISTINCT FROM v.x -> liefert sonst die "Tabelle" v          */
const TABELLE_RE = /(?<!\bDO\s)(?<!\bFOR\s)(?<!\bDISTINCT\s)\b(FROM|JOIN|INSERT\s+INTO|UPDATE|USING)\s+(?!LATERAL\b|ONLY\b|\()(?:(public|information_schema|pg_catalog)\.)?([a-z_][a-z0-9_]*)/gi;

/* Schluesselwoerter, Typnamen und Syntaxwoerter, die wie Bezeichner aussehen.
 * EXTRACT-Feldnamen (epoch, dow, isoyear …) muessen mit hinein: sie stehen als
 * blanke Woerter im SQL und sind keine Spalten. */
const SQL_WORTE = new Set(`
select insert into update delete from set where values returning
join left right inner outer full cross lateral natural using on only
group by having order asc desc nulls first last limit offset fetch next rows row
distinct all any some exists in between like ilike similar to escape
and or not is null true false unknown
case when then else end filter over partition range preceding following unbounded current
with recursive materialized union intersect except
as cast collate default array interval at time zone local
conflict do nothing excluded constraint
for share of skip locked nowait ordinality
epoch year month day hour minute second dow doy quarter week century decade
milliseconds microseconds isodow isoyear timezone timezone_hour timezone_minute
integer int int2 int4 int8 bigint smallint numeric decimal real double precision
text varchar char character bool boolean date timestamp timestamptz timetz time
uuid json jsonb bytea serial bigserial money inet cidr macaddr xml
without window groups grouping sets cube rollup
current_date current_time current_timestamp localtime localtimestamp current_user session_user user
`.trim().split(/\s+/));

function tokenisiere(sql) {
  const out = [];
  const re = /([a-z_][a-z0-9_]*)|(::)|(\.)|(\()|(\))|(,)|('[^']*')|(\S)/gi;
  let m;
  while ((m = re.exec(sql))) {
    if (m[1]) out.push({ t: "id", v: m[1].toLowerCase(), i: m.index, len: m[1].length });
    else if (m[2]) out.push({ t: "::", i: m.index });
    else if (m[3]) out.push({ t: ".", i: m.index });
    else if (m[4]) out.push({ t: "(", i: m.index });
    else if (m[5]) out.push({ t: ")", i: m.index });
    else if (m[6]) out.push({ t: ",", i: m.index });
    else if (m[7]) out.push({ t: "str", i: m.index });
    else out.push({ t: "op", v: m[8], i: m.index });
  }
  return out;
}

/* "meintest du" — billige Levenshtein-Naeherung fuer die Fehlermeldung.
 * audit_log.user_id -> actor_id waere so sofort sichtbar gewesen. */
function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
/*
 * Reine Zeichenabstaende reichen hier nicht. `user_id` -> `actor_id` ist ein
 * SEMANTISCHER Sprung (Abstand 4, genau wie zu `org_id`), und `workers` ->
 * `worker_profiles` liegt 8 Zeichen auseinander. Beides sind aber exakt die
 * Hinweise, die der Leser braucht. Deshalb zaehlt zuerst, was die Namen TEILEN
 * — gemeinsame Wortbestandteile und ein gemeinsamer Anfang —, und der
 * Zeichenabstand entscheidet nur noch die Reihenfolge. Ausgegeben werden bis zu
 * vier Kandidaten statt einer Wahrheit, die der Pruefer nicht haben kann.
 */
function naechsterTreffer(wort, kandidaten) {
  const eigen = new Set(wort.split("_").filter((t) => t.length > 1));
  const grenze = Math.max(2, Math.floor(wort.length / 3));
  const bewertet = [];
  for (const k of kandidaten) {
    const gemeinsameWorte = k.split("_").filter((t) => t.length > 1 && eigen.has(t)).length;
    let i = 0;
    while (i < wort.length && i < k.length && wort[i] === k[i]) i++;
    const praefixBonus = i >= 5 ? 1 : 0;
    const abstand = levenshtein(wort, k);
    if (!gemeinsameWorte && !praefixBonus && abstand > grenze) continue;
    bewertet.push({ k, punkte: abstand - gemeinsameWorte * 5 - praefixBonus * 3 });
  }
  bewertet.sort((a, b) => a.punkte - b.punkte || a.k.localeCompare(b.k));
  return bewertet.length ? bewertet.slice(0, 4).map((x) => x.k) : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. DER PRUEFER
 *
 * Arbeitet auf einem Quelltext-STRING, nicht auf einer Datei — damit die
 * Selbstprobe (f) exakt denselben Code durchlaeuft wie der Bestand.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function pruefeQuelle(rel, src, zaehler) {
  const befunde = [];
  const z = zaehler || {};
  for (const lit of jsLiterale(src)) {
    let sql = normalisiere(lit.text);
    if (!SQL_VERB.test(sql) || !SQL_STRUKTUR.test(sql)) continue;
    z.sqlLiterale = (z.sqlLiterale || 0) + 1;
    sql = maskiereSyntaxFunktionen(sql);

    const melde = (art, tab, name, hinweisAus, zusatz = "") => {
      befunde.push({
        rel, zeile: lit.zeile, art, tab, name,
        schluessel: `${rel}::${tab ? `${tab}.` : ""}${name}`,
        nah: naechsterTreffer(name, hinweisAus),
        zusatz,
        sql: sql.replace(/\s+/g, " ").trim().slice(0, 170)
      });
    };

    /* ── (b) TABELLEN ──────────────────────────────────────────────────── */
    const ctes = new Set();
    {
      const re = /(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([a-z_][a-z0-9_]*)\s+AS\s*(?:(?:NOT\s+)?MATERIALIZED\s*)?\(/gi;
      let m; while ((m = re.exec(sql))) ctes.add(m[1].toLowerCase());
    }
    const abgeleitet = new Set();
    {
      // ") alias" bzw. ") AS alias" — Subquery-, LATERAL- und Funktionsaliasse
      const re = /\)\s*(?:AS\s+)?([a-z_][a-z0-9_]*)/gi;
      let m; while ((m = re.exec(sql))) abgeleitet.add(m[1].toLowerCase());
    }

    TABELLE_RE.lastIndex = 0;
    const relationen = [];
    let tabellenFunktion = false, m2;
    while ((m2 = TABELLE_RE.exec(sql))) {
      const klausel = m2[1].toUpperCase().replace(/\s+/g, " ");
      const fremdSchema = (m2[2] || "").toLowerCase();
      const name = m2[3].toLowerCase();
      const rest = sql.slice(m2.index + m2[0].length);
      /* Der Funktionsaufruf-Ausschluss gilt NUR fuer FROM/JOIN/USING. Bei
       * "INSERT INTO tab (spalten)" ist die Klammer die Spaltenliste — wer hier
       * pauschal ausschliesst, prueft die SCHREIBPFADE gar nicht. Genau dort
       * lag Fund 2 (INSERT INTO audit_log (user_id, …)). */
      if (klausel !== "INSERT INTO" && klausel !== "UPDATE" && /^\s*\(/.test(rest)) { tabellenFunktion = true; continue; }
      if (fremdSchema === "information_schema" || fremdSchema === "pg_catalog") continue;
      if (name.includes(M_I)) continue;
      relationen.push({ name, ende: m2.index + m2[0].length, fremdSchema });
      if (ctes.has(name) || abgeleitet.has(name)) continue;
      if (DB_FUNKTIONEN.has(name)) continue;
      z.tabellenRefs = (z.tabellenRefs || 0) + 1;
      if (!RELATIONEN.has(name)) melde("TABELLE FEHLT", null, name, RELATIONEN);
    }

    /* ── (c1) INSERT-Spaltenliste ──────────────────────────────────────────
     * `INSERT INTO tab (a, b, c)` — die Zuordnung ist grammatikalisch
     * eindeutig, kein Alias moeglich, keine Aufloesung noetig. Genau die
     * Position, an der anonymizeUser mit audit_log.user_id scheiterte, und
     * genau die, die ein Pruefer uebersieht, der nur SELECT/WHERE ansieht. */
    const mi = /\bINSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/i.exec(sql);
    if (mi && TAB_NAMEN.has(mi[1].toLowerCase())) {
      const tab = mi[1].toLowerCase();
      let i = mi.index + mi[0].length, tiefe = 1, buf = "";
      while (i < sql.length && tiefe > 0) {
        const c = sql[i];
        if (c === "(") tiefe++;
        else if (c === ")") { tiefe--; if (!tiefe) break; }
        buf += c; i++;
      }
      // Nur reine Namenslisten. Alles mit Klammern oder ${…} ist dynamisch
      // gebaut und wird bewusst nicht geraten (siehe "was er nicht kann", 3.).
      if (!buf.includes(M_I) && !buf.includes("(") && /^[a-z0-9_,\s]*$/i.test(buf)) {
        for (const sp of buf.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
          z.spaltenPruefungen = (z.spaltenPruefungen || 0) + 1;
          if (!TABELLEN[tab].spalten.includes(sp)) melde("INSERT-Spalte", tab, sp, TABELLEN[tab].spalten);
        }
      } else {
        z.uebersprungen = (z.uebersprungen || 0) + 1;
      }
    }

    /* ── (c2) UPDATE-SET-Ziele + (d) NOT NULL ──────────────────────────────
     * Links vom `=` in einem SET steht immer eine Spalte der Zieltabelle —
     * PostgreSQL VERBIETET dort sogar die Qualifizierung. Damit ist auch das
     * eindeutig. `UPDATE users SET is_active = …` (Fund 2) faellt hier. */
    const mu = /^\s*UPDATE\s+(?:public\.)?([a-z_][a-z0-9_]*)(?:\s+AS)?(?:\s+([a-z_][a-z0-9_]*))?\s+SET\b/i.exec(sql);
    if (mu && TAB_NAMEN.has(mu[1].toLowerCase()) && (!mu[2] || !SQL_WORTE.has(mu[2].toLowerCase()))) {
      const tab = mu[1].toLowerCase();
      const rest = sql.slice(mu.index + mu[0].length);
      const stop = /\b(WHERE|RETURNING|FROM)\b/i.exec(rest);
      const setTeil = stop ? rest.slice(0, stop.index) : rest;
      // `SET (a, b) = (…)` (Mehrspalten-Zuweisung) wird ausgelassen.
      if (!setTeil.includes(M_I) && !/^\s*\(/.test(setTeil)) {
        let tiefe = 0, akt = "";
        const teile = [];
        for (const c of setTeil) {
          if (c === "(") tiefe++;
          else if (c === ")") tiefe--;
          if (c === "," && tiefe === 0) { teile.push(akt); akt = ""; continue; }
          akt += c;
        }
        teile.push(akt);
        for (const t of teile) {
          const mz = /^\s*([a-z_][a-z0-9_]*)\s*=(?!=)/i.exec(t);
          if (!mz) continue;
          const sp = mz[1].toLowerCase();
          z.spaltenPruefungen = (z.spaltenPruefungen || 0) + 1;
          if (!TABELLEN[tab].spalten.includes(sp)) { melde("UPDATE-SET-Ziel", tab, sp, TABELLEN[tab].spalten); continue; }
          if (/=\s*NULL\s*$/i.test(t.trim()) && TABELLEN[tab].nicht_null.includes(sp)) {
            melde("NOT-NULL-Bruch", tab, sp, [], " — die Spalte ist NOT NULL, `= NULL` wirft und rollt die ganze Transaktion zurueck");
          }
        }
      } else {
        z.uebersprungen = (z.uebersprungen || 0) + 1;
      }
    }

    /* ── (c3) EIN-RELATIONS-STATEMENT ──────────────────────────────────────
     * Hat ein Statement GENAU EINE Relation und keine der Konstruktionen, die
     * neue Namen einfuehren koennen, dann muss jeder blanke Bezeichner eine
     * Spalte dieser einen Tabelle sein. Das ist der Bereich, in dem eine
     * Textanalyse noch ehrlich ist — und er deckt die haeufigste Form im Repo
     * ab: `SELECT … FROM tab WHERE …`, `UPDATE tab … WHERE …`,
     * `DELETE FROM tab WHERE …`. Vier der sechs anonymizeUser-Fehler standen
     * genau dort (WHERE created_by / company_profile_id / sender_id …).
     *
     * Ausgeschlossen wird, was Namen erzeugen kann, die in keinem Katalog
     * stehen — jede dieser Zeilen entspricht einer gemessenen Falschmeldungs-
     * klasse: */
    if (sql.includes(M_I)) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }        // Interpolation
    if (/\bWITH\b/i.test(sql)) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }     // CTE-Namen beschatten Tabellen
    if (/\b(UNION|INTERSECT|EXCEPT)\b/i.test(sql)) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }
    if (/\b(FROM|JOIN)\s*\(/i.test(sql)) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }  // abgeleitete Tabelle
    if (/\bUSING\b/i.test(sql)) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }    // DELETE … USING = zweite Relation
    if (tabellenFunktion) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }          // unnest(…) AS t(a,b)
    if (relationen.length !== 1) { z.uebersprungen = (z.uebersprungen || 0) + 1; continue; }
    const r = relationen[0];
    if (r.fremdSchema && r.fremdSchema !== "public") continue;
    if (!TAB_NAMEN.has(r.name)) continue;   // fehlende Tabelle ist oben schon gemeldet

    const tab = r.name;
    const spalten = new Set(TABELLEN[tab].spalten);
    const ma = /^\s*(?:AS\s+)?([a-z_][a-z0-9_]*)/i.exec(sql.slice(r.ende));
    const alias = ma && !SQL_WORTE.has(ma[1].toLowerCase()) ? ma[1].toLowerCase() : null;
    // EXCLUDED ist eine Pseudo-Relation, die Postgres nur im DO-UPDATE-Zweig
    // bereitstellt; ihre Spalten sind die der Zieltabelle.
    const praefixe = new Set([tab, "excluded", ...(alias ? [alias] : [])]);
    // Ausgabe-Aliasse duerfen in ORDER BY / GROUP BY wieder auftauchen.
    const ausgabeAliasse = new Set();
    { const re = /\bAS\s+([a-z_][a-z0-9_]*)/gi; let mm; while ((mm = re.exec(sql))) ausgabeAliasse.add(mm[1].toLowerCase()); }

    const tk = tokenisiere(sql);
    for (let k = 0; k < tk.length; k++) {
      const t = tk[k];
      if (t.t !== "id") continue;
      const vor = tk[k - 1], nach = tk[k + 1];
      if (vor && (vor.t === "." || vor.t === "::")) continue;          // rechte Seite / Typname
      if (nach && nach.t === "(") continue;                            // Funktionsaufruf
      if (/^\s*=>/.test(sql.slice(t.i + t.len))) continue;             // benannter Parameter: make_interval(hours => $1)
      if (nach && nach.t === ".") {
        const sp = tk[k + 2];
        if (!sp || sp.t !== "id" || !praefixe.has(t.v)) continue;
        z.spaltenPruefungen = (z.spaltenPruefungen || 0) + 1;
        if (!spalten.has(sp.v)) melde("qualifizierte Spalte", tab, sp.v, TABELLEN[tab].spalten);
        continue;
      }
      if (SQL_WORTE.has(t.v) || ausgabeAliasse.has(t.v)) continue;
      if (vor && vor.t === "id" && vor.v === "as") continue;
      if (t.v === tab || t.v === alias) continue;
      z.spaltenPruefungen = (z.spaltenPruefungen || 0) + 1;
      if (!spalten.has(t.v)) melde("unqualifizierte Spalte", tab, t.v, TABELLEN[tab].spalten);
    }
  }
  return befunde;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. BESTANDSAUFNAHME (2026-08-13)
 *
 * Alle Eintraege live gegen tempconnect_db bestaetigt. Schluessel ist
 * `datei::tabelle.spalte` bzw. `datei::tabelle` — bewusst OHNE Zeilennummer,
 * damit eine Aenderung weiter oben in der Datei die Liste nicht zerlegt.
 *
 * Diese Liste ist eine SCHULD, kein Freibrief. Sie darf nur schrumpfen.
 * ═══════════════════════════════════════════════════════════════════════════ */

const BESTAND = new Set([
  /* ── Fehlende Tabellen ──────────────────────────────────────────────────
   * feature_overrides: Migration 059 existiert UND ist im Ledger _migrations
   * als angewandt verbucht — die Tabelle fehlt trotzdem (sql/migrate.sh
   * dokumentiert die Ursache: vor ON_ERROR_STOP=1 wurden fehlgeschlagene
   * Migrationen faelschlich als applied eingetragen). Aufrufer:
   * routes/admin.js (Liste/Anlegen/Loeschen), dealStaffingFastTrackService. */
  "services/featureOverrideService.js::feature_overrides",
  /* vendor_pool_history / vendor_pool_notes: nie angelegt. Verlauf und Notizen
   * eines Lieferantenpools werfen beim Schreiben UND beim Lesen. */
  "services/vendorPoolService.js::vendor_pool_history",
  "services/vendorPoolService.js::vendor_pool_notes",
  /* workers: Altbestand. Die Arbeiterdaten liegen in worker_profiles. */
  "services/matchingEngine.js::workers",
  /* state_transitions: fehlt; der Aufruf steht in try/catch und liefert damit
   * stumm eine LEERE Zeitleiste statt eines Fehlers — die gefaehrlichste
   * Variante, weil die Oberflaeche plausibel aussieht. */
  "services/dealProgressHelper.js::state_transitions",

  /* ── DSGVO-Export: dieselbe Klasse wie anonymizeUser, nur eine Funktion
   * weiter. exportUserDataFull kapselt jede Abfrage in safeQuery(), das den
   * Fehler schluckt — der Export liefert dem Betroffenen also stillschweigend
   * LEERE Abschnitte statt seiner Daten (Art. 15 DSGVO). ──────────────────── */
  "services/dataGovernanceService.js::users.is_active",        // gibt es nicht
  "services/dataGovernanceService.js::users.plan",             // Plan haengt an organizations/subscriptions
  "services/dataGovernanceService.js::requests.sender_id",     // richtig: requester_id
  "services/dataGovernanceService.js::ratings.reviewer_id",    // ratings hat weder reviewer_id …
  "services/dataGovernanceService.js::ratings.reviewee_id",    // … noch reviewee_id
  "services/dataGovernanceService.js::offers.created_by",      // richtig: supplier_company_id
  "services/dataGovernanceService.js::invoices.created_by",    // richtig: user_id
  "services/dataGovernanceService.js::subscriptions.plan_name",  // richtig: plan
  "services/dataGovernanceService.js::subscriptions.expires_at", // gibt es nicht
  "services/dataGovernanceService.js::contracts.org_id",       // contracts hat buyer_org_id/supplier_org_id

  /* ── Passwort-Zuruecksetzen: users hat weder reset_token noch
   * reset_token_expires. Der komplette Ablauf wirft. ───────────────────────── */
  "services/authService.js::users.reset_token",
  "services/authService.js::users.reset_token_expires",

  /* ── supplier_reputation: DREI Services schreiben/lesen gegen drei
   * verschiedene, jeweils nicht existierende Formen dieser Tabelle. Real sind
   * supplier_id, reputation_score, completed_deals, total_deals. ──────────── */
  "services/assignmentService.js::supplier_reputation.supplier_org_id",
  "services/assignmentService.js::supplier_reputation.score",
  "services/assignmentService.js::supplier_reputation.completed_assignments",
  "services/assignmentService.js::supplier_reputation.cancelled_assignments",
  "services/assignmentService.js::supplier_reputation.total_assignments",
  "services/assignmentService.js::supplier_reputation.avg_duration_days",
  "services/capacityExchangeService.js::supplier_reputation.supplier_org_id",
  "services/capacityExchangeService.js::supplier_reputation.score",
  "services/instantMatchService.js::supplier_reputation.org_id",
  "services/instantMatchService.js::supplier_reputation.overall_score",
  "services/matchingEngine.js::supplier_reputation.org_id",
  "services/matchingEngine.js::supplier_reputation.overall_score",

  /* ── Stundenzettel-Vorlagen: is_default gibt es nicht (weder Lesen noch
   * Schreiben), timesheet_template_fields heisst field_label statt label und
   * kennt weder is_visible noch created_at. ───────────────────────────────── */
  "services/timesheetTemplateService.js::timesheet_templates.is_default",
  "services/timesheetTemplateService.js::timesheet_template_fields.label",
  "services/timesheetTemplateService.js::timesheet_template_fields.is_visible",
  "services/timesheetTemplateService.js::timesheet_template_fields.created_at",

  /* ── Einzelbefunde ──────────────────────────────────────────────────────── */
  "services/staffControlService.js::audit_log.user_id",        // richtig: actor_id — identisch zu Fund 2
  "services/timesheetService.js::timesheets.worker_signed_at", // Arbeiter-Unterschrift wird nirgends gespeichert
  "services/timesheetService.js::timesheets.worker_signed_ip",
  "services/emergencyStaffingService.js::demand_requests.response_window_minutes",
  "services/instantMatchService.js::compliance_documents.supplier_org_id", // richtig: org_id
  "services/instantMatchService.js::organizations.is_verified",
  "services/platformMetricsService.js::ratings.overall_score",
  "services/onboardingService.js::capacity_posts.user_id",     // richtig: created_by / supplier_company_id
  "routes/matching.js::capacity_posts.supplier_id",            // richtig: supplier_company_id
  /* searchService: Altbestand aus der Zeit vor der Org-Umstellung — users hat
   * weder type noch legal_name noch plan_id, capacity_posts weder description
   * noch hourly_rate. */
  "services/searchService.js::users.type",
  "services/searchService.js::users.legal_name",
  "services/searchService.js::users.plan_id",
  "services/searchService.js::capacity_posts.description",
  "services/searchService.js::capacity_posts.hourly_rate"
]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. LAUFZEIT-ADAPTIVE SPALTEN — kein Befund, sondern der geplante Zweig
 *
 * Diese Stellen fragen VOR der Abfrage, ob es die Spalte gibt
 * (ensureUserLastLoginColumn / columnExists) und waehlen dann den einen oder
 * anderen Zweig. Die fehlende Spalte ist dort kein Bug, sondern eine
 * beruecksichtigte Moeglichkeit. Der Waechter kann das nicht sehen — deshalb
 * steht es hier, mit Namen, statt in einer pauschalen Abschwaechung.
 * ═══════════════════════════════════════════════════════════════════════════ */
const LAUFZEIT_ADAPTIV = new Set([
  "routes/occ/bootstrap.js::users.last_login_at",
  "routes/occ/executive.js::users.last_login_at",
  "routes/occ/platform.js::users.last_login_at"
]);

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. LAUF ÜBER DEN BESTAND
 * ═══════════════════════════════════════════════════════════════════════════ */

function quellDateien() {
  const out = [];
  for (const d of KORPUS) {
    const p = path.join(API_DIR, d);
    let eintraege;
    try { eintraege = fs.readdirSync(p); } catch { continue; }
    for (const f of eintraege) if (f.endsWith(".js")) out.push(path.join(p, f));
  }
  return out;
}

const zaehler = { dateien: 0, sqlLiterale: 0, tabellenRefs: 0, spaltenPruefungen: 0, uebersprungen: 0 };
const alleBefunde = [];
if (schemaVorhanden) {
  for (const datei of quellDateien()) {
    zaehler.dateien++;
    const rel = path.relative(API_DIR, datei).replace(/\\/g, "/");
    alleBefunde.push(...pruefeQuelle(rel, fs.readFileSync(datei, "utf8"), zaehler));
  }
}

const relevant = alleBefunde.filter((b) => !LAUFZEIT_ADAPTIV.has(b.schluessel));
const neu = relevant.filter((b) => !BESTAND.has(b.schluessel));
const gesehen = new Set(relevant.map((b) => b.schluessel));

function zeige(b) {
  const wo = `${b.rel}:${b.zeile}`;
  const was = b.tab ? `${b.tab}.${b.name}` : `Tabelle ${b.name}`;
  const hinweis = b.nah ? `  — existiert stattdessen: ${b.nah.join(", ")}` : "";
  return `  [${b.art}] ${wo}\n      ${was}${hinweis}${b.zusatz}\n      SQL: ${b.sql}`;
}

if (process.env.TC_WAECHTER_DUMP === "1") {
  console.log(`\n[waechter] ${zaehler.dateien} Dateien, ${zaehler.sqlLiterale} SQL-Literale, ` +
    `${zaehler.tabellenRefs} Tabellen-Referenzen, ${zaehler.spaltenPruefungen} Spaltenpruefungen, ` +
    `${zaehler.uebersprungen} Statements uebersprungen`);
  console.log(`[waechter] ${relevant.length} Befunde gesamt, davon ${neu.length} NEU\n`);
  for (const b of relevant) console.log(zeige(b));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. DIE TESTS
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("SQL-Schema-Waechter", () => {

  /* ── Voraussetzung: sieht der Waechter ueberhaupt etwas? ─────────────────
   * Ohne diese Pruefungen waere ein Waechter, der nichts findet, nicht von
   * einem zu unterscheiden, der nichts sieht — das leere Docker-Mount-Ziel
   * macht genau diesen Unterschied unsichtbar. */
  it("liest ein echtes Schema und einen echten Korpus", () => {
    assert.ok(schemaVorhanden,
      `Momentaufnahme fehlt: ${SCHEMA_DATEI}\n` +
      "Erzeugen mit:  npm run schema:snapshot   (liest den Container tempconnect_db)");

    const spaltenGesamt = Object.values(TABELLEN).reduce((n, t) => n + t.spalten.length, 0);
    assert.ok(Object.keys(TABELLEN).length >= MIN_SCHEMA_TABELLEN,
      `nur ${Object.keys(TABELLEN).length} Relationen in der Momentaufnahme (erwartet >= ${MIN_SCHEMA_TABELLEN}) — die Datei ist unvollstaendig`);
    assert.ok(spaltenGesamt >= MIN_SCHEMA_SPALTEN,
      `nur ${spaltenGesamt} Spalten in der Momentaufnahme (erwartet >= ${MIN_SCHEMA_SPALTEN})`);

    assert.ok(zaehler.dateien >= MIN_DATEIEN,
      `nur ${zaehler.dateien} Quelldateien gescannt (erwartet >= ${MIN_DATEIEN}).\n` +
      `Gesuchter Ort: ${API_DIR}\n` +
      "Sehr wahrscheinlich zeigt der Pfad auf ein LEERES Docker-Mount-Ziel.");
    assert.ok(zaehler.sqlLiterale >= MIN_SQL_LITERALE,
      `nur ${zaehler.sqlLiterale} SQL-Literale erkannt (erwartet >= ${MIN_SQL_LITERALE}) — der Scanner greift nicht`);
    assert.ok(zaehler.tabellenRefs >= MIN_TABELLEN_REFS,
      `nur ${zaehler.tabellenRefs} Tabellen-Referenzen geprueft (erwartet >= ${MIN_TABELLEN_REFS})`);
    assert.ok(zaehler.spaltenPruefungen >= MIN_SPALTEN_PRUEFUNGEN,
      `nur ${zaehler.spaltenPruefungen} Spaltenbezuege geprueft (erwartet >= ${MIN_SPALTEN_PRUEFUNGEN})`);
  });

  /* ── (f) SELBSTPROBE ────────────────────────────────────────────────────
   * Der Pruefer laeuft ueber einen Quelltext, der die beiden Funde von heute
   * nachbildet. Findet er sie nicht, ist jedes Gruen wertlos. */
  it("findet die beiden Funde vom 2026-08-13 in einer Nachbildung wieder", () => {
    const probe = `
      export async function anonymizeUser(client, userId) {
        await client.query("UPDATE users SET is_active = FALSE WHERE id = $1", [userId]);
        await client.query(\`UPDATE users SET password_hash = NULL WHERE id = $1\`, [userId]);
        await client.query("UPDATE offers SET contact_name = $2 WHERE created_by = $1", [userId]);
        await client.query(\`INSERT INTO audit_log (user_id, action) VALUES ($1, 'x')\`, [userId]);
        await client.query("SELECT supplier_response_count_TIPPFEHLER FROM demand_requests WHERE id = $1", [userId]);
        await client.query("SELECT * FROM voellig_erfundene_tabelle WHERE id = $1", [userId]);
        // Diese Zeile ist ein Kommentar und darf NICHT geprueft werden:
        // UPDATE users SET gibt_es_nicht = 1 WHERE id = $1
      }`;
    const gefunden = pruefeQuelle("probe.js", probe, {});
    const schluessel = gefunden.map((b) => `${b.art}|${b.tab ? `${b.tab}.` : ""}${b.name}`);

    for (const erwartet of [
      "UPDATE-SET-Ziel|users.is_active",                             // Fund 2, Fehler 1
      "NOT-NULL-Bruch|users.password_hash",                           // Fund 2, Fehler 6
      "unqualifizierte Spalte|offers.created_by",                     // Fund 2, Fehler 4
      "INSERT-Spalte|audit_log.user_id",                              // Fund 2, Fehler 2
      "unqualifizierte Spalte|demand_requests.supplier_response_count_tippfehler", // Fund 1
      "TABELLE FEHLT|voellig_erfundene_tabelle"
    ]) {
      assert.ok(schluessel.includes(erwartet),
        `Der Waechter findet '${erwartet}' NICHT mehr. Er ist damit blind fuer genau den ` +
        `Fehler, fuer den er gebaut wurde.\nGefunden wurde: ${schluessel.join(", ") || "(nichts)"}`);
    }

    // Und er darf den auskommentierten Fehler NICHT melden.
    assert.ok(!schluessel.some((s) => s.includes("gibt_es_nicht")),
      "Der Waechter prueft auskommentierten Code — das meldet abgeloeste und absichtlich falsche Beispiele als Bug");

    // Der Hinweis auf den naechstliegenden Treffer muss tragen.
    const auditBefund = gefunden.find((b) => b.tab === "audit_log" && b.name === "user_id");
    assert.ok(auditBefund.nah?.includes("actor_id"),
      "Die Meldung muss sagen, was stattdessen existiert — sonst sucht der Leser selbst.\n" +
      `Vorgeschlagen wurde: ${auditBefund.nah?.join(", ") || "(nichts)"}`);
  });

  /* ── (b/c/d) DER EIGENTLICHE WAECHTER ───────────────────────────────────── */
  it("kein Produktionscode schreibt SQL gegen eine unbekannte Tabelle oder Spalte", () => {
    assert.equal(neu.length, 0,
      `${neu.length} NEUE Referenz(en) auf Tabellen/Spalten, die es im Schema nicht gibt.\n` +
      "Die Tests darueber sind gruen, weil ihre Mock-Pools jede Abfrage annehmen — in der\n" +
      "Produktion wirft die Abfrage (und rollt in einer Transaktion alles davor zurueck).\n\n" +
      `${neu.map(zeige).join("\n\n")}\n\n` +
      "Wenn das Schema stimmt und die Momentaufnahme veraltet ist:  npm run schema:snapshot");
  });

  /* ── Die Bestandsliste darf nur schrumpfen ──────────────────────────────── */
  it("die Bestandsliste enthaelt nichts Behobenes mehr", () => {
    const erledigt = [...BESTAND].filter((k) => !gesehen.has(k));
    assert.deepEqual(erledigt, [],
      "Diese Eintraege aus BESTAND treten nicht mehr auf — sie sind behoben oder der Code\n" +
      "ist weg. Bitte aus der Liste STREICHEN, sonst verrottet sie zur Ausrede und deckt\n" +
      "irgendwann einen neuen Fehler:\n" + erledigt.map((k) => `  - ${k}`).join("\n"));
  });

  /* ── Die Ausnahmeliste darf nicht verrotten ─────────────────────────────── */
  it("jede laufzeit-adaptive Ausnahme ist noch begruendet", () => {
    const alleSchluessel = new Set(alleBefunde.map((b) => b.schluessel));
    const tot = [...LAUFZEIT_ADAPTIV].filter((k) => !alleSchluessel.has(k));
    assert.deepEqual(tot, [],
      "Diese Ausnahmen greifen nicht mehr — bitte streichen, sonst decken sie stillschweigend\n" +
      "einen kuenftigen echten Fehler an derselben Stelle:\n" + tot.map((k) => `  - ${k}`).join("\n"));
  });

  /* ── (a) FRISCHE ────────────────────────────────────────────────────────
   * Ohne diese Pruefung veraltet die Momentaufnahme lautlos, und der Waechter
   * bewacht ein Schema von gestern. Sie laeuft OHNE Datenbank, also auf jedem
   * Entwicklerrechner bei jedem Lauf. */
  it("die Momentaufnahme passt zum heutigen Stand der Migrationen", () => {
    const migDir = path.join(REPO_ROOT, "sql", "migrations");
    let dateien = [];
    try { dateien = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort(); } catch { /* s. u. */ }

    // Inhaltspruefung: ein leeres Mount-Ziel darf diesen Test nicht gruen machen.
    assert.ok(dateien.length >= 100,
      `nur ${dateien.length} Migrationsdateien unter ${migDir} gefunden — der Pfad zeigt ins Leere`);

    // Die Berechnung kommt aus dem Erzeuger, sie wird NICHT abgeschrieben:
    // zwei Kopien derselben Formel driften. Genau das ist am 2026-08-15
    // passiert — der Fingerabdruck haengt an den Zeilenenden (CRLF auf dem
    // Windows-Host, LF im Container), und die Kopie hier kannte die
    // Vereinheitlichung nicht, die der Erzeuger inzwischen macht.
    const { hash } = migrationsFingerabdruck(REPO_ROOT);
    const teile = dateien;

    assert.equal(hash, schema.migrations_fingerabdruck?.hash,
      `Die Migrationen haben sich geaendert (${teile.length} Dateien jetzt, ` +
      `${schema.migrations_fingerabdruck?.dateien} zum Zeitpunkt der Momentaufnahme), ` +
      "die Momentaufnahme nicht.\nDer Waechter bewacht sonst ein Schema von gestern.\n\n" +
      "Beheben:  npm run schema:snapshot   (danach api/test/fixtures/schema.json mit committen)");

    /*
     * sql/init.sql wird nur geprueft, wenn es erreichbar ist: der API-Container
     * bindet sql/migrations ein, init.sql aber nicht. Ein gemeinsamer Hash ueber
     * beide waere dort dauerhaft rot — und ein dauerhaft roter Test wird
     * abgeschaltet. Auf dem Host, wo die Datei liegt, wird sie voll geprueft.
     */
    const initPfad = path.join(REPO_ROOT, "sql", "init.sql");
    if (fs.existsSync(initPfad)) {
      // Auch hier aus dem Erzeuger, nicht abgeschrieben — sonst faellt die
      // Zeilenenden-Vereinheitlichung an dieser Stelle wieder auseinander.
      const { init: initHash } = migrationsFingerabdruck(REPO_ROOT);
      assert.equal(initHash, schema.migrations_fingerabdruck?.init,
        "sql/init.sql hat sich geaendert, die Momentaufnahme nicht.\n" +
        "Beheben:  npm run schema:snapshot");
    }
  });

  /* ── (e) SCHICHT 2: DRIFT GEGEN DIE LAUFENDE DATENBANK ──────────────────
   * Faengt, was Schicht 1 prinzipiell nicht sehen kann: Abweichungen OHNE
   * Migrationsaenderung. Der Beweis, dass es diese Schicht braucht, ist
   * feature_overrides — Migration vorhanden, im Ledger als angewandt verbucht,
   * Tabelle fehlt. Ein rein migrationsbasierter Waechter meldete gruen. */
  describe("gegen die laufende Datenbank", { skip: !hasDb && "keine Datenbank (DATABASE_URL / DB_HOST fehlt) — laeuft im Container und in CI" }, () => {
    it("die Momentaufnahme weicht nicht von information_schema ab", async () => {
      // Erst hier laden — siehe Begruendung oben bei hasDb.
      const helpers = await import("./integration/helpers.js");
      assert.equal(helpers.hasDb, hasDb,
        "Die hiesige hasDb-Kopie weicht von test/integration/helpers.js ab — bitte angleichen");

      const pool = helpers.createPool();
      try {
        const { rows } = await pool.query(
          `SELECT c.table_name AS tab, c.column_name AS spalte
             FROM information_schema.columns c
            WHERE c.table_schema = 'public'`
        );
        assert.ok(rows.length >= MIN_SCHEMA_SPALTEN, `information_schema lieferte nur ${rows.length} Spalten — ist es die richtige Datenbank?`);

        const live = new Map();
        for (const r of rows) {
          if (!live.has(r.tab)) live.set(r.tab, new Set());
          live.get(r.tab).add(r.spalte);
        }

        const abweichungen = [];
        for (const [tab, def] of Object.entries(TABELLEN)) {
          if (!live.has(tab)) { abweichungen.push(`Tabelle ${tab}: in der Momentaufnahme, nicht in der Datenbank`); continue; }
          for (const sp of def.spalten) if (!live.get(tab).has(sp)) abweichungen.push(`${tab}.${sp}: in der Momentaufnahme, nicht in der Datenbank`);
        }
        for (const [tab, spalten] of live) {
          if (!TABELLEN[tab]) { abweichungen.push(`Tabelle ${tab}: in der Datenbank, nicht in der Momentaufnahme`); continue; }
          const bekannt = new Set(TABELLEN[tab].spalten);
          for (const sp of spalten) if (!bekannt.has(sp)) abweichungen.push(`${tab}.${sp}: in der Datenbank, nicht in der Momentaufnahme`);
        }

        assert.deepEqual(abweichungen.slice(0, 40), [],
          `Die eingecheckte Momentaufnahme und die laufende Datenbank stimmen nicht ueberein ` +
          `(${abweichungen.length} Abweichungen).\nEntweder wurde DDL von Hand ausgefuehrt, eine Migration ist ` +
          "still fehlgeschlagen, oder die Momentaufnahme ist alt.\nNach Klaerung:  npm run schema:snapshot");
      } finally {
        await pool.end();
      }
    });
  });
});

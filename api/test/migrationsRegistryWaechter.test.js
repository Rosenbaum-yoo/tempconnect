/**
 * Die Migrations-Registry muss die Wahrheit sagen (Nachtrag zu 8.1.1).
 *
 * DER BEFUND, gemessen am 2026-08-24 gegen die laufende Datenbank:
 *   Das Ledger `_migrations` endete bei `180_notdienst_antwortpfad.sql`
 *   (verbucht am 2026-08-13). Fuer die Migrationen 181-196 fehlte jeder
 *   Eintrag — waehrend ihre Strukturen physisch in der Datenbank lagen:
 *   `worker_absences.quelle` (181), `worker_delays` (182), `frist_bis` (193),
 *   `verfallen_am` (195), die `al_same_org`-Policy ohne NULL-Zweig (187),
 *   `'nutzer'` im `par_ziel_art_check` (194), >=18 Tabellen mit aktivem RLS (196).
 *   Sechzehn Migrationen also: angewandt, aber nicht verbucht.
 *
 * WARUM DAS NICHT KOSMETIK IST. `sql/migrate.sh` entscheidet allein am Ledger,
 * ob eine Datei laufen muss. Was dort fehlt, wird erneut angewandt — und zwei
 * der sechzehn ueberleben das nicht. Einzeln nachgewiesen (BEGIN ... ROLLBACK
 * gegen die echte Datenbank):
 *
 *   189_meldungen_die_ankommen.sql
 *     ERROR: check constraint "profile_abuse_reports_reason_check" is violated
 *   190_melden_nur_was_man_sieht.sql
 *     ERROR: check constraint "par_ziel_art_check" is violated
 *
 * Der Grund ist eine Zeitfalle, keine Schlamperei: Migration 194 hat beide
 * CHECKs geweitet ('nutzer' als vierte Zielart, 'fraud'/'harassment' als
 * Gruende), und es liegen inzwischen Zeilen in `profile_abuse_reports`, die NUR
 * die geweitete Fassung erlaubt. 189 und 190 setzen die engere wieder — und
 * scheitern an genau diesen Zeilen. Auf einer frischen Datenbank laeuft das
 * anstandslos durch (189 kommt vor 194, die Daten gibt es dort noch nicht).
 * Kaputt ist es ausschliesslich dort, wo bereits gearbeitet wurde.
 *
 * Die Folge trifft nicht nur die sechzehn: `migrate.sh` bricht bei 189 mit
 * `ON_ERROR_STOP=1` und `exit 1` ab. 190-196 werden nie erreicht — und jede
 * kuenftige Migration 197+ genauso wenig, bei JEDEM Lauf aufs Neue. Eine
 * unvollstaendige Registry legt die Migrationskette dauerhaft still.
 *
 * Datenverlust drohte dabei nie: 189 besteht aus vier eigenstaendigen
 * DO-Bloecken ohne umschliessende Transaktion, der erste scheitert atomar, die
 * uebrigen laufen gar nicht erst an. Der Schaden ist Stillstand, nicht Korruption.
 *
 * BEHOBEN am 2026-08-24 durch Nachtrag der 16 Eintraege (INSERT ... ON CONFLICT
 * DO NOTHING). Nachgetragen wurde, was ohnehin wahr war — die Migrationen
 * SELBST umzuschreiben waere der falsche Eingriff gewesen: sie sind fuer eine
 * frische Datenbank korrekt.
 *
 * DIESER WAECHTER haelt beide Richtungen offen, weil das Repo beide schon
 * gesehen hat. Der Schema-Waechter (`sqlSchemaWaechter.test.js`) dokumentiert
 * die umgekehrte Drift: 059_feature_overrides.sql ist als angewandt verbucht,
 * die Tabelle fehlt trotzdem. Hier steht die Richtung, die bis heute ungedeckt
 * war — angewandt, aber stumm.
 *
 * ZWEI SCHICHTEN, wie in diesem Repo ueblich:
 *   1. OHNE Datenbank (laeuft immer): `migrate.sh` darf seine Schutzmechanik
 *      nicht verlieren. Verbucht wird nur, was auch durchgelaufen ist.
 *   2. MIT Datenbank (laeuft im Container): der Abgleich selbst. Ob Ledger und
 *      Verzeichnis uebereinstimmen, weiss nur die Datenbank.
 *
 * Schicht 2 ueberspringt sich ohne `DB_HOST` — aber LAUT (CLAUDE.md §0.9).
 *
 * Run: node --test --test-force-exit test/migrationsRegistryWaechter.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Pfade IMMER relativ zur Testdatei aufloesen, nie zu process.cwd() — sonst
 * skippt der Waechter je nach Startverzeichnis lautlos (CLAUDE.md §0.9). */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const MIGRATIONS_DIR = path.join(REPO, "sql/migrations");
const MIGRATE_SH = path.join(REPO, "sql/migrate.sh");

const migrationsDateien = () =>
  fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

/**
 * Die 13 Ledger-Eintraege ohne Datei. Sie stammen aus Umbenennungen der
 * Fruehzeit und sind wirkungslos: `migrate.sh` iteriert ueber DATEIEN, ein
 * ueberzaehliger Ledger-Eintrag laesst sich nie auf etwas anwenden.
 * Festgenagelt, damit NEUE Waisen auffallen — nicht, um diese zu beschoenigen.
 */
const BEKANNTE_WAISEN = new Set([
  "002_marketplace.sql",
  "003_usage_counters.sql",
  "004_email_verification.sql",
  "006_add_users_verification_token.sql",
  "007_fix_plans_and_requests.sql",
  "008_create_payment_sessions.sql",
  "009_add_company_profile_fields.sql",
  "013_agency_integration_api_keys.sql",
  "023_search_platform_layer",
  "027_timesheets.sql",
  "045_reputation_visibility.sql",
  "sql_005_reviews.sql",
  "sql_005_reviews_pgcrypto.sql",
]);

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 1 — migrate.sh behaelt seine Schutzmechanik (laeuft immer)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Migrations-Registry — die Schreibmechanik", () => {
  const quelle = fs.readFileSync(MIGRATE_SH, "utf8");

  it("bricht bei einem SQL-Fehler ab, statt ihn zu verschlucken", () => {
    assert.match(quelle, /ON_ERROR_STOP=1/,
      "ohne ON_ERROR_STOP=1 liefert psql auch bei SQL-Fehlern Exit 0 — eine " +
      "gescheiterte Migration wuerde als 'applied' verbucht (Ursache der Mig-122-Drift)");
  });

  it("verbucht eine Migration NUR, wenn sie durchgelaufen ist", () => {
    /* Das INSERT muss im Erfolgszweig stehen. Stuende es daneben, waere jeder
     * Fehlschlag sofort eine Luege im Ledger — und zwar in der gefaehrlichen
     * Richtung: verbucht, aber nicht angewandt. */
    assert.match(
      quelle,
      /if\s+run_psql[^\n]*-f\s+"\$migration";\s*then\s*\r?\n\s*run_psql\s+-c\s+"INSERT INTO _migrations/,
      "der INSERT in _migrations steht nicht mehr im Erfolgszweig von psql — " +
      "damit verbucht migrate.sh Migrationen, die nie durchliefen"
    );
  });

  it("entscheidet am Ledger, ob eine Datei laufen muss", () => {
    /* Der Grund, warum ein fehlender Eintrag eine erneute Anwendung bedeutet —
     * und damit der Grund fuer Schicht 2. */
    assert.match(quelle, /SELECT COUNT\(\*\) FROM _migrations WHERE name=/,
      "migrate.sh fragt das Ledger nicht mehr ab — dann sagt Schicht 2 nichts mehr aus");
  });

  it("es gibt ueberhaupt Migrationsdateien zu bewachen", () => {
    const dateien = migrationsDateien();
    assert.ok(dateien.length > 150,
      `nur ${dateien.length} Migrationsdateien gefunden — stimmt der Pfad ${MIGRATIONS_DIR}?`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 2 — der Abgleich gegen die laufende Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

const hatDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe("Migrations-Registry — der Abgleich", { skip: !hatDb }, () => {
  let pool = null;
  let verbucht = null;

  before(async () => {
    const { default: pg } = await import("pg");
    pool = new pg.Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
          }
    );
    const { rows } = await pool.query("SELECT name FROM _migrations");
    verbucht = new Set(rows.map((r) => r.name));
  });

  after(async () => { if (pool) await pool.end(); });

  it("prueft ueberhaupt etwas — sonst ist der Abgleich wertlos", () => {
    assert.ok(verbucht.size > 150,
      `nur ${verbucht.size} Ledger-Eintraege — ist das die richtige Datenbank?`);
  });

  /*
   * WARUM HIER NICHT "jede Datei ist verbucht" STEHT — eine Korrektur am
   * eigenen Waechter, aufgefallen am 2026-08-24 an einer echten Migration.
   *
   * Der erste Entwurf verlangte fuer JEDE Datei einen Ledger-Eintrag. Das ist
   * die falsche Zusicherung: eine gerade geschriebene, noch nicht ausgerollte
   * Migration hat selbstverstaendlich keinen — der Waechter waere bei jeder
   * neuen Migration rot geworden, bis sie deployed ist. Ein Waechter, der im
   * Normalbetrieb rot leuchtet, wird abgeschaltet, und dann bewacht er nichts.
   *
   * Gefaehrlich ist nicht "unverbucht", sondern "unverbucht UND gegen den
   * heutigen Datenbestand nicht wiederholbar". Genau das lag hier vor: 189 und
   * 190 setzen CHECK-Constraints, die Migration 194 laengst geweitet hat.
   * Deshalb wird die Eigenschaft selbst geprueft, nicht ihr Stellvertreter —
   * jede unverbuchte Datei laeuft in einer zurueckgerollten Transaktion gegen
   * die echte Datenbank. Kommt sie durch, ist sie harmlos (entweder noch nicht
   * angewandt oder idempotent). Scheitert sie, bricht `migrate.sh` beim
   * naechsten Lauf genau dort ab — mit ON_ERROR_STOP=1 und exit 1, und reisst
   * jede spaetere Migration mit.
   *
   * ROLLBACK, nicht COMMIT: der Test darf nichts veraendern. Und er laeuft nur
   * ueber die unverbuchten Dateien, das sind im Normalfall null bis zwei.
   */
  it("ABNAHME: jede unverbuchte Migration ist gegen den heutigen Bestand wiederholbar", async () => {
    const unverbucht = migrationsDateien().filter((f) => !verbucht.has(f));
    console.log(`    ℹ ${unverbucht.length} unverbuchte Migration(en)${unverbucht.length ? ": " + unverbucht.join(", ") : ""}`);

    const gescheitert = [];
    for (const datei of unverbucht) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, datei), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        gescheitert.push(null);           // Platzhalter, gleich wieder entfernt
      } catch (err) {
        gescheitert.push(`${datei}\n      ${err.message}`);
      } finally {
        /* IMMER zurueckdrehen — auch im Erfolgsfall. Der Waechter prueft, ob es
         * ginge, er wendet nichts an. */
        try { await client.query("ROLLBACK"); } catch { /* Verbindung schon hin */ }
        client.release();
      }
    }

    const echte = gescheitert.filter(Boolean);
    assert.deepEqual(echte, [],
      `${echte.length} unverbuchte Migration(en) scheitern an der heutigen Datenbank:\n  ${echte.join("\n  ")}\n\n` +
      "migrate.sh wendet unverbuchte Dateien beim naechsten Lauf ERNEUT an und " +
      "bricht dort ab (ON_ERROR_STOP=1 + exit 1) — jede spaetere Migration wird " +
      "nie mehr erreicht, bei jedem Lauf aufs Neue.\n" +
      "Der Fix ist fast nie, die Migration umzuschreiben (fuer eine frische " +
      "Datenbank ist sie meist korrekt), sondern den Ledger-Eintrag nachzutragen — " +
      "sie ist ja offensichtlich schon angewandt."
    );
  });

  it("keine NEUEN Ledger-Eintraege ohne Datei", () => {
    /* Die andere Richtung. Waisen sind fuer sich harmlos (migrate.sh iteriert
     * ueber Dateien), aber eine NEUE Waise heisst: jemand hat eine angewandte
     * Migration aus dem Repo entfernt oder umbenannt — dann laesst sich eine
     * frische Umgebung nicht mehr auf denselben Stand bringen. */
    const dateien = new Set(migrationsDateien());
    const neueWaisen = [...verbucht]
      .filter((n) => !dateien.has(n) && !BEKANNTE_WAISEN.has(n))
      .sort();
    assert.deepEqual(neueWaisen, [],
      `${neueWaisen.length} verbuchte Migration(en) ohne Datei im Repo:\n  ${neueWaisen.join("\n  ")}\n\n` +
      "Eine frische Umgebung kaeme damit nie auf denselben Stand wie diese. " +
      "Wenn die Umbenennung gewollt ist, gehoert der Name in BEKANNTE_WAISEN — " +
      "mit einem Satz, warum."
    );
  });

  it("die Reparatur vom 2026-08-24 haelt: 181-196 sind verbucht", () => {
    /* Der konkrete Befund, festgenagelt. Faellt einer dieser Eintraege wieder
     * heraus (Datenbank-Reset ohne migrate.sh, Restore eines alten Dumps),
     * sagt es dieser Test — und nicht erst der naechste Deploy. */
    const namen = [...verbucht];
    const fehlend = [];
    for (let n = 181; n <= 196; n++) {
      if (!namen.some((name) => name.startsWith(`${n}_`))) fehlend.push(n);
    }
    assert.deepEqual(fehlend, [],
      `Migration(en) ${fehlend.join(", ")} sind wieder unverbucht. ` +
      "189 und 190 sind gegen den heutigen Datenbestand NICHT wiederholbar " +
      "(CHECK-Constraints, die Migration 194 geweitet hat) — die Kette bricht dort ab."
    );
  });
});

if (!hatDb) {
  describe("Migrations-Registry — Hinweis", () => {
    it("der Abgleich wurde NICHT geprueft (keine Datenbank)", () => {
      console.log(
        "    ℹ Schicht 2 (Ledger vs. Verzeichnis) uebersprungen — " +
        "DB_HOST ist nicht gesetzt. Im Container laeuft sie mit."
      );
      assert.ok(true);
    });
  });
}

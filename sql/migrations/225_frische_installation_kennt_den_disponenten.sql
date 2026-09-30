-- Migration 225: Eine frische Installation kennt den Disponenten (Welle Z, Z8)
-- =============================================================================
-- DIESE MIGRATION AENDERT AN DER LAUFENDEN DATENBANK NICHTS. Sie ist fuer die
-- NAECHSTE Installation geschrieben — und genau das ist der Befund.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WIE DAS AUFGEFALLEN IST
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Beim Nachverfolgen einer einzelnen unsauberen Saatgut-Zeile (Welle Z, Z9) kam
-- ein VERZEICHNIS zum Vorschein, das niemand anwendet:
--
--   db/031_einsatzportal.sql              14 ADD COLUMN, ausserhalb sql/migrations
--   db/migrations/030_demo_worker_seed.sql Demo-Saatgut
--
-- `sql/migrate.sh` liest `/migrations` — gemountet aus `sql/migrations`. Kein
-- compose-Dienst, kein Skript und kein Code nennt `db/` (gemessen am
-- 2026-09-27: 0 Fundstellen). Die beiden Dateien sind also irgendwann von Hand
-- gelaufen; in der laufenden Datenbank stehen ihre Spalten, im angewandten
-- Migrationsbestand nicht.
--
-- FOLGE: eine frische Installation aus dem heutigen Stand legt sie nicht an, und
-- der Code, der sie liest, wirft. Gemessen wurde das in drei Richtungen, weil
-- eine erste, schlampigere Messung an derselben Frage schon einmal einen
-- Blocker behauptet hat, den es nicht gab:
--
--   (1) die Spalte steht im Schnappschuss der laufenden Datenbank,
--   (2) KEINE Datei, die `migrate.sh` anwendet, nennt sie,
--   (3) Produktionscode liest oder schreibt sie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WAS NACHGETRAGEN WIRD — UND WAS AUSDRUECKLICH NICHT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Von 31 Spalten der laufenden Datenbank, die keine angewandte Migration nennt,
-- erfuellen genau NEUN alle drei Bedingungen. (Es waren zuerst 22 und vier —
-- die Zahl stieg zweimal: als der Erkenner aufhoerte, KOMMENTARE mitzulesen, und als er aufhoerte, COMMENT-ON-Anweisungen als Deklaration zu zaehlen. Eine Spalte,
-- die nur in einem Kommentar einer anderen Migration steht, ist nicht
-- deklariert; siehe Messfalle 4 in `api/test/migrationenGegenBestand.test.js`.)
--
--   worker_assignment_links.dispatcher_name / _phone / _email
--     Gelesen in `services/workerService.js` (zwei Abfragen), beschreibbar ueber
--     `routes/workers.js` (Zod-Schema + Spalten-Erlaubnisliste), und angezeigt
--     auf DREI Seiten des Einsatzportals (`einsatzportal-kontakt.html`,
--     `-einsaetze.html`, `-dashboard.html`). Auf einer frischen Installation
--     saehe die Kraft nicht, WER ihr Disponent ist — bei einem Einsatz, zu dem
--     sie Fragen hat, ist das die wichtigste Zeile der Seite.
--
--   worker_assignment_links.location_address / meeting_point
--     Dieselbe Waisen-Datei. Diese zwei galten zunaechst als deklariert, weil
--     `178_montage_gehoert_zum_einsatzort.sql` sie in einem `COMMENT ON` NENNT —
--     eine Beschreibung ist keine Deklaration (Messfalle 5). Gelesen werden sie
--     in `workerService` an VIER Stellen und in
--     `workerProfileGovernanceService`; ohne sie wuesste die Kraft nicht, WOHIN
--     sie gehen und wo sie sich melden soll.
--
--   worker_assignment_links.client_name / dress_code / instructions
--     Dieselbe Waisen-Datei, dieselbe Tabelle, und ebenfalls in Gebrauch:
--     `client_name` wird von `assignmentStaffingService` GESCHRIEBEN (INSERT mit
--     ON CONFLICT … client_name=EXCLUDED.client_name) und von
--     `timesheetService.prefillFromAssignment` gelesen; `dress_code` und
--     `instructions` liest `workerService` in denselben zwei Abfragen und
--     beschreibt `routes/workers.js` ueber das Zod-Schema. Ohne sie wuesste die
--     Kraft auf einer frischen Installation nicht, bei WELCHEM Kunden sie
--     eingesetzt ist und was sie anziehen soll.
--
--   users.email_verified_at
--     Gelesen in `services/dataGovernanceService.js` in der DSGVO-AUSKUNFT.
--     Der Aufruf laeuft durch `safeQuery`: auf einer frischen Installation
--     wuerde die Auskunft nicht mit einem Fehler abbrechen, sondern LEER
--     antworten. Genau diese Klasse war am 2026-09-15 schon einmal behoben
--     worden (`users.plan`/`is_active` liessen die Auskunft fuer JEDEN Nutzer
--     null liefern). Eine Auskunft, die still nichts sagt, ist die schlechteste
--     Form des Fehlers auf einem Compliance-Pfad.
--
-- NICHT nachgetragen werden die uebrigen 22, und der Grund steht hier, damit
-- niemand sie spaeter "vergessen" nennt. Dass die Namen in diesem Kommentar
-- stehen, ist unschaedlich: der Waechter liest fuer die Erkennung nur
-- AUSFUEHRBARES SQL. Vor dieser Korrektur war es schaedlich — die erste Fassung
-- dieses Kopfes hat genau dadurch sieben echte Befunde verdeckt:
--
--   session.sess/sid, staff_session.sess/sid   gehoeren `connect-pg-simple`; der
--     Sitzungsspeicher legt Tabelle UND Spalten selbst an
--     (`api/app.js`, createTableIfMissing: true).
--   reviews.reviewee_id/reviewer_id/visible_at,
--   usage_counters.broadcasts_sent/notdienst_requests_sent/requests_sent
--     Spalten von WAISEN-Tabellen: 0 Zeilen, 0 Fundstellen im Produktionscode.
--     Sie verschwinden mit der Tabelle, wenn aufgeraeumt wird.
--   users.company_street/_zip/_city/_country/_vat_id/_register_court/_register_number,
--   capacities.external_id
--     0 Fundstellen im Produktionscode (gemessen). Die Rechnungsanschrift der
--     E-Rechnungspflicht liegt an `organizations` (Migration 202), nicht hier —
--     diese `users.company_*` sind Reste eines aelteren Wegs.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM `IF NOT EXISTS` UND WARUM DAS KEIN WIDERSPRUCH IST
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Auf der laufenden Datenbank sind alle vier Spalten vorhanden; dort ist diese
-- Migration ein No-Op und wird trotzdem sauber verbucht (ehrliche
-- `_migrations`-Buchhaltung, wie 052 auf Prod). Auf einer frischen Installation
-- legt sie sie an. Typen und Nullbarkeit sind aus der laufenden Datenbank
-- uebernommen, damit beide Wege dieselbe Tabelle beschreiben.
--
-- DAS VERZEICHNIS `db/` WIRD HIER NICHT ANGETASTET. Ob es geloescht oder
-- eingeordnet wird, ist eine Aufraeum-Entscheidung des Owners; was diese
-- Migration leistet, ist die Wirkung: der angewandte Bestand enthaelt jetzt,
-- was der Code braucht. Dass so etwas nicht wieder unentdeckt entsteht,
-- erzwingt `api/test/migrationenGegenBestand.test.js`.
--
-- ROLLBACK / RUECKNAHME:
--   ALTER TABLE worker_assignment_links
--     DROP COLUMN IF EXISTS dispatcher_name,
--     DROP COLUMN IF EXISTS dispatcher_phone,
--     DROP COLUMN IF EXISTS dispatcher_email;
--   ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
--   -- ACHTUNG: auf der laufenden Datenbank waere das ein echter Datenverlust —
--   -- die Spalten sind dort gefuellt. Diese Ruecknahme gilt nur fuer eine
--   -- Installation, die sie ueber DIESE Migration bekommen hat.
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- Der Disponent am Einsatz und die drei Angaben, die die Kraft sonst nirgends
-- bekommt: alle NULL erlaubt (nicht jeder Einsatz hat einen benannten
-- Disponenten, eine Kleiderordnung oder besondere Hinweise). Typen aus der
-- laufenden Datenbank uebernommen (alle `text`), damit beide Wege dieselbe
-- Tabelle beschreiben.
ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS dispatcher_name  TEXT,
  ADD COLUMN IF NOT EXISTS dispatcher_phone TEXT,
  ADD COLUMN IF NOT EXISTS dispatcher_email TEXT,
  ADD COLUMN IF NOT EXISTS client_name      TEXT,
  ADD COLUMN IF NOT EXISTS dress_code       TEXT,
  ADD COLUMN IF NOT EXISTS instructions     TEXT,
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS meeting_point    TEXT;

-- Zeitpunkt der E-Mail-Bestaetigung. NULL = nicht bestaetigt; die DSGVO-Auskunft
-- gibt den Wert aus.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN worker_assignment_links.dispatcher_name IS
  'Z8: zustaendiger Disponent, angezeigt im Einsatzportal. Nachgetragen aus der nicht angewandten Datei db/031_einsatzportal.sql.';
COMMENT ON COLUMN users.email_verified_at IS
  'Z8: Zeitpunkt der E-Mail-Bestaetigung, gelesen von der DSGVO-Auskunft. Nachgetragen, damit eine frische Installation die Auskunft nicht leer liefert.';

COMMIT;

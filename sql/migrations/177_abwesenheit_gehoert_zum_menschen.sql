-- 177_abwesenheit_gehoert_zum_menschen.sql
-- P10 Spur E / Welle E2 — Abwesenheit haengt am Menschen, nicht am Auftrag
--
-- WARUM DIESE MIGRATION
-- Welle E1 hat gemessen statt vermutet (docs/features/E_LIVE_BELEGSCHAFT.md).
-- Ergebnis: von den vier Zustaenden, die die Live-Belegschaft fuehren soll, hat
-- "krank" nur eine halbe Quelle. Migration 073 legte `unavailable_from`,
-- `unavailable_reason` und `unavailable_reported_at` an — aber auf
-- `worker_assignment_links`, also am EINSATZ. Zwei Folgen:
--
--   1. Der Grund ist Freitext. Krank, Urlaub und Arzttermin sind nicht
--      unterscheidbar, ohne in Text zu raten.
--   2. Wer gerade KEINEN Einsatz hat, kann sich ueberhaupt nicht abmelden — die
--      Abwesenheit haengt an einem Auftrag, den es nicht gibt.
--
-- Der Owner hat am 2026-08-13 entschieden (E-E2): Abwesenheit gehoert zum
-- Menschen. Eine Zeitarbeitsfirma will wissen, wer naechste Woche krank ist —
-- auch fuer jemanden, der gerade auf der Bank sitzt. Genau diese Person ist die
-- teuerste, denn fuer sie wird disponiert.
--
-- WAS DIESE MIGRATION NICHT TUT
-- Sie ruehrt die Felder auf `worker_assignment_links` NICHT an. Die beantworten
-- eine andere Frage — "diese Kraft faellt fuer DIESEN Auftrag aus, stell Ersatz"
-- — und steuern den Ersatz-Flow (P1.1) sowie die Stundenzettel-Sperre. Sie sind
-- kein schlechteres Duplikat, sondern ein anderer Sachverhalt.
--
-- MIGRATIONSPFAD UND STICHTAG (vom Plan gefordert)
--   heute            Beide Wege bestehen nebeneinander. Neu erfasste
--                    PERSONEN-Abwesenheiten laufen ausschliesslich hier herein.
--   Stichtag = E4    Mit der Auslieferung der Reiter (Welle E4) ist diese
--                    Tabelle die einzige Quelle der Live-Belegschaft fuer den
--                    Zustand "abwesend". Die Einsatz-Felder behalten ihre
--                    Aufgabe (Ersatz + Stundenzettel-Sperre) und werden dort
--                    NICHT abgeloest.
--   kein Backfill    Bewusst. Ein Freitext-Grund liesse sich nur raten
--                    ("krankgeschrieben bis Fr" -> krank? termin?), und eine
--                    geratene Krankmeldung in einer Personalakte ist schlimmer
--                    als eine fehlende. Wer den Bestand dennoch uebernehmen
--                    will, tut das ausdruecklich und einmalig:
--
--     INSERT INTO worker_absences
--            (worker_profile_id, supplier_org_id, art, von, notiz, erfasst_von)
--     SELECT wp.id, wal.supplier_org_id, 'sonstiges', wal.unavailable_from,
--            'Uebernommen aus Einsatz-Abmeldung: ' || COALESCE(wal.unavailable_reason, ''),
--            NULL
--       FROM worker_assignment_links wal
--       JOIN worker_profiles wp ON wp.user_id = wal.worker_user_id
--                              AND wp.supplier_org_id = wal.supplier_org_id
--      WHERE wal.unavailable_from IS NOT NULL
--     ON CONFLICT DO NOTHING;   -- die Ueberlappungssperre unten faengt Dubletten
--
--   'sonstiges' ist dabei die ehrliche Wahl: der Freitext bleibt als Notiz
--   lesbar, aber das System behauptet nicht, es wisse den Grund.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS worker_absences;
--   ALTER TABLE worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_id_org_uniq;
--   -- btree_gist bleibt stehen: eine Erweiterung zu entfernen, die eine andere
--   -- Migration spaeter ebenfalls braucht, waere ein teurer Nebeneffekt.

SET client_min_messages TO WARNING;

BEGIN;

/* ── 0. Voraussetzung fuer die Ueberlappungssperre ───────────────────────────
 * btree_gist erlaubt Gleichheits-Vergleiche (worker_profile_id WITH =) im
 * selben GiST-Index wie den Bereichs-Vergleich. Ohne die Erweiterung liesse
 * sich "eine Person, zwei sich ueberschneidende Zeitraeume" nicht in der
 * Datenbank verbieten, sondern nur im Anwendungscode — und ein zweiter
 * gleichzeitiger Aufruf schluepft an jedem Anwendungs-Check vorbei.
 * pg_trgm und unaccent (Mig 135) belegen, dass contrib in diesem Image da ist. */

CREATE EXTENSION IF NOT EXISTS btree_gist;

/* ── 1. Die Org-Zugehoerigkeit soll nicht driften koennen ────────────────────
 * `supplier_org_id` steht redundant in der Abwesenheit — jede Abfrage der
 * Live-Belegschaft ist org-gebunden, und ein Join nur zur Mandantenpruefung
 * waere auf dem heissen Pfad. Redundanz ohne Sicherung ist aber genau die
 * Sorte Datenmuell, die spaeter niemand mehr aufloest: wechselt ein Profil den
 * Betrieb, zeigte die Abwesenheit weiter auf den alten.
 *
 * Deshalb ein ZUSAMMENGESETZTER Fremdschluessel statt eines Kommentars, der um
 * Disziplin bittet. Er braucht diese Eindeutigkeit — fachlich sagt sie nichts
 * Neues (id ist bereits Primaerschluessel), technisch ist sie der Anker. */

ALTER TABLE worker_profiles
  DROP CONSTRAINT IF EXISTS worker_profiles_id_org_uniq;
ALTER TABLE worker_profiles
  ADD CONSTRAINT worker_profiles_id_org_uniq UNIQUE (id, supplier_org_id);

COMMENT ON CONSTRAINT worker_profiles_id_org_uniq ON worker_profiles IS
  'Technischer Anker fuer zusammengesetzte Fremdschluessel (id, supplier_org_id). Erlaubt es abhaengigen Tabellen, die Mandantengrenze redundant zu fuehren, ohne dass sie driften kann.';

/* ── 2. Die Tabelle ──────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS worker_absences (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Am PROFIL, nicht am Einsatz und nicht am Konto: Migration 175 hat Profile
  -- ohne Benutzerkonto moeglich gemacht (Import ohne E-Mail). Haenge die
  -- Abwesenheit an user_id, koennte sich genau die importierte Belegschaft
  -- nicht abmelden — also die, fuer die diese Welle gebaut wird.
  worker_profile_id UUID        NOT NULL,
  supplier_org_id   UUID        NOT NULL,

  -- CHECK-Liste, kein Freitext. Freitext war der Grund, warum die vorhandenen
  -- Felder fuer die Tafel nichts hergeben.
  art               TEXT        NOT NULL,

  von               DATE        NOT NULL,
  bis               DATE,                       -- NULL = offenes Ende
  notiz             TEXT,

  erfasst_von       UUID        REFERENCES users(id) ON DELETE SET NULL,
  erfasst_am        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Aufheben statt loeschen: eine zurueckgenommene Krankmeldung ist ein
  -- Vorgang, kein Nichts. Welle E5 baut den Zeitstrahl darauf auf, und eine
  -- geloeschte Zeile hinterliesse dort eine Luecke, die niemand erklaeren kann.
  aufgehoben_am     TIMESTAMPTZ,
  aufgehoben_von    UUID        REFERENCES users(id) ON DELETE SET NULL,
  aufhebung_grund   TEXT,

  CONSTRAINT worker_absences_profil_org_fk
    FOREIGN KEY (worker_profile_id, supplier_org_id)
    REFERENCES worker_profiles (id, supplier_org_id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT worker_absences_art_chk
    CHECK (art IN ('krank', 'urlaub', 'termin', 'sonstiges')),

  -- Ein Zeitraum, der frueher endet als er beginnt, ist keine Eingabe, sondern
  -- ein Tippfehler. Er wuerde in jeder Auswertung als "nie abwesend" erscheinen.
  CONSTRAINT worker_absences_zeitraum_chk
    CHECK (bis IS NULL OR bis >= von),

  -- Ein Aufhebungsgrund ohne Aufhebung ist ein Widerspruch in der Akte.
  CONSTRAINT worker_absences_aufhebung_chk
    CHECK (aufgehoben_am IS NOT NULL OR (aufgehoben_von IS NULL AND aufhebung_grund IS NULL))
);

/* ── 3. Zwei Zustaende gleichzeitig darf es nicht geben ──────────────────────
 * Der Plan verlangt "hoechstens eine aktive Abwesenheit je Mensch und Tag".
 * Ein Teil-Index auf (worker_profile_id, von) leistet das NICHT: er verhindert
 * denselben Starttag, nicht die Ueberschneidung. 10.–20. und 15.–25. haben
 * verschiedene Starttage und ueberlappen trotzdem — die Tafel zeigte den
 * Menschen dann gleichzeitig als krank und im Urlaub.
 *
 * EXCLUDE loest genau das: gleicher Mensch UND sich schneidende Zeitraeume =
 * abgewiesen. `[]` ist beidseitig einschliessend, weil `bis` der letzte
 * Abwesenheitstag ist, nicht der erste Arbeitstag danach. Ein offenes Ende
 * (bis IS NULL) wird zu einem nach oben unbegrenzten Bereich — richtig so:
 * "krank ab Montag, Ende offen" sperrt alles danach, bis jemand ein Ende setzt.
 *
 * Aufgehobene Zeilen sind ausgenommen, sonst blockierte ein zurueckgenommener
 * Eintrag fuer immer den Zeitraum, den er gar nicht mehr belegt. */

ALTER TABLE worker_absences
  ADD CONSTRAINT worker_absences_keine_ueberlappung
  EXCLUDE USING gist (
    worker_profile_id WITH =,
    daterange(von, bis, '[]') WITH &&
  ) WHERE (aufgehoben_am IS NULL);

/* ── 4. Der eine Zugriff, den die Tafel wirklich macht ──────────────────────
 * "Wer aus diesem Betrieb ist HEUTE abwesend" — org-gebunden, nur gueltige
 * Zeilen. Teil-Index, weil aufgehobene Eintraege den heissen Pfad nie
 * interessieren und die Bestandsmenge sonst mitwaechst.
 * Skalierung mitgedacht: bei 300 Kunden x 200 Kraeften x wenigen Abwesenheiten
 * im Jahr bleibt die Tabelle klein — der Index haelt sie auch dann klein,
 * wenn der Bestand nach Jahren zum Archiv wird. */

CREATE INDEX IF NOT EXISTS worker_absences_org_zeitraum_idx
  ON worker_absences (supplier_org_id, von, bis)
  WHERE aufgehoben_am IS NULL;

/* Zweiter Zugriff: die Akte eines einzelnen Menschen (Welle E5, Zeitstrahl).
 * Absteigend, weil die Liste immer neueste-zuerst gelesen wird. */
CREATE INDEX IF NOT EXISTS worker_absences_profil_idx
  ON worker_absences (worker_profile_id, von DESC);

/* ── 5. Was die Spalten bedeuten ─────────────────────────────────────────── */

COMMENT ON TABLE worker_absences IS
  'Abwesenheit eines Mitarbeiters — am MENSCHEN, nicht am Einsatz (Owner-Entscheidung E-E2, 2026-08-13). Quelle des Zustands "abwesend" in der Live-Belegschaft. Die gleichnamigen Felder auf worker_assignment_links bleiben bestehen und beantworten eine andere Frage: "faellt fuer DIESEN Auftrag aus, stell Ersatz".';
COMMENT ON COLUMN worker_absences.worker_profile_id IS
  'Zeigt auf das Profil, nicht auf das Konto — damit sich auch importierte Mitarbeiter ohne Benutzerkonto (Mig 175) abmelden lassen.';
COMMENT ON COLUMN worker_absences.supplier_org_id IS
  'Mandantengrenze, redundant gefuehrt fuer org-gebundene Abfragen ohne Join. Kann nicht driften: zusammengesetzter Fremdschluessel auf (worker_profiles.id, supplier_org_id) mit ON UPDATE CASCADE.';
COMMENT ON COLUMN worker_absences.art IS
  'krank | urlaub | termin | sonstiges. Bewusst eine geschlossene Liste: der Freitext der Alt-Felder war der Grund, warum sich Krankheit und Urlaub nicht trennen liessen.';
COMMENT ON COLUMN worker_absences.bis IS
  'Letzter Abwesenheitstag (einschliesslich). NULL = offenes Ende, typisch fuer eine Krankmeldung ohne absehbare Rueckkehr.';
COMMENT ON COLUMN worker_absences.aufgehoben_am IS
  'Zuruecknahme statt Loeschung — eine zurueckgezogene Krankmeldung ist ein Vorgang und gehoert in den Zeitstrahl (Welle E5).';
COMMENT ON CONSTRAINT worker_absences_keine_ueberlappung ON worker_absences IS
  'Ein Mensch kann an einem Tag nur einen Abwesenheitsgrund haben. Als EXCLUDE und nicht als Anwendungspruefung, weil zwei gleichzeitige Anfragen an jeder Anwendungspruefung vorbeikommen.';

COMMIT;

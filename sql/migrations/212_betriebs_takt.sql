-- Migration 212: Der Betriebstakt bekommt einen Herzschlag
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Owner-Entscheid 2026-09-01 (M-E8): "ja" — der Takt wird eingerichtet.
-- Leitentscheidung M-L9: "Kein Automatismus gilt als geliefert, solange nicht
-- messbar ist, wann er zuletzt lief."
--
-- DER BEFUND, DER DAS AUSGELOEST HAT (M0, gemessen 2026-09-01):
-- `sweepMarktpraesenz` hat genau EINEN Aufrufer im Produktionscode, und der ist
-- ein HTTP-Endpunkt: POST /internal/staffing-maintenance. Im ganzen Stack ruft
-- den niemand — docker-compose.yml fuehrt db, mailpit, redis, migrate, api,
-- frontend; die Produktionsdatei fuehrt migrate, redis, api, frontend. Redis
-- ist da, ein Arbeiterprozess nicht.
--
-- An derselben nie eingerichteten Zeile haengen ausserdem: der Hard-Lock bei
-- Zahlungsausfall, das automatische Nachruecken und der Verfall von
-- Einladungen. Die eigene Betriebsakte haelt zum 2026-08-24 fest: "der Weg ist
-- jetzt offen, aber es ruft ihn noch niemand."
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM EINE TABELLE UND KEIN PROTOKOLLEINTRAG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ein `logger.info` beantwortet "lief es gerade?" — aber nicht "wann lief es
-- ZULETZT?". Genau das ist die Frage, an der die Marktplatz-Automatik ein Jahr
-- lang gescheitert ist: es gab keinen Ort, an dem ihr Schweigen sichtbar wurde.
-- Ein Protokoll rotiert, eine Tabelle nicht.
--
-- Und sie muss ABFRAGBAR sein: die Kachel im Staff Control Center und der
-- Waechter lesen dieselbe Zeile. Zwei Wahrheiten ueber denselben Takt waeren
-- schlimmer als keine.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM EINE ZEILE JE AUFGABE UND KEIN LAUFPROTOKOLL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ein Protokoll jedes Laufs waechst unbegrenzt: 28 interne Endpunkte plus vier
-- BullMQ-Takte, davon einer alle zehn Minuten. Das sind rund 4 300 Zeilen am
-- Tag, 1,5 Millionen im Jahr — fuer eine Frage, die immer nur den LETZTEN Lauf
-- betrifft.
--
-- Deshalb: eine Zeile je Aufgabe, per UPSERT fortgeschrieben. Die Zaehler
-- (`laeufe`, `fehler_in_folge`) tragen die Geschichte, die man wirklich braucht.
-- Wer je einen vollstaendigen Verlauf will, bekommt ihn aus dem Audit — dort
-- gehoert er hin.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WAS DIESE MIGRATION BEWUSST NICHT TUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sie legt KEINE Soll-Intervalle in der Datenbank ab. Das Soll steht im Code
-- (`api/services/betriebsTaktService.js`, Registratur TAKTE), weil es dort
-- neben dem Takt steht, den es beschreibt — und weil ein Waechter, der sein
-- Soll aus derselben Tabelle liest, die er bewacht, nichts bewacht.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS betriebs_takt;
--
-- Gefahrlos: die Tabelle ist reine Beobachtung. Kein Fachdatensatz haengt an
-- ihr, kein Fremdschluessel zeigt auf sie. Was verloren geht, ist die Antwort
-- auf "wann lief das zuletzt?" — und die war vor dieser Migration ohnehin
-- nirgends zu haben.
--
-- Die Verdrahtung im Code (`routes/internal.js`, `utils/metrics.js`) darf
-- stehen bleiben: `taktNotieren` wirft nie und protokolliert einen fehlenden
-- Tabellenzugriff als Warnung.

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS betriebs_takt (
  -- Der Name der Aufgabe. Fuer interne Endpunkte der Pfad ohne Praefix
  -- ("staffing-maintenance"), fuer BullMQ "<queue>:<jobname>"
  -- ("capacity:ersatz-frist"). Ein Name, eine Zeile.
  aufgabe           TEXT        PRIMARY KEY,

  -- Wann zuletzt gelaufen — die eine Frage, wegen der es diese Tabelle gibt.
  zuletzt_um        TIMESTAMPTZ NOT NULL,

  -- Wie lange der letzte Lauf dauerte. Eine Aufgabe, die von 200 ms auf 40 s
  -- waechst, ist ein Befund, bevor sie ausfaellt.
  dauer_ms          INTEGER,

  -- 'ok' | 'fehler'. Bewusst Text und kein Boolean: ein dritter Zustand
  -- ("uebersprungen", "kein Redis") ist absehbar, und ein Boolean waere dann
  -- eine Migration statt eines Wertes.
  ergebnis          TEXT        NOT NULL DEFAULT 'ok',

  -- Die Meldung des letzten Fehlschlags. Bleibt stehen, bis ein Lauf gelingt —
  -- sonst waere der Grund genau dann weg, wenn jemand nachsieht.
  fehler            TEXT,

  -- Wie oft die Aufgabe insgesamt lief, und wie viele Fehlschlaege AM STUECK.
  -- Der zweite Zaehler unterscheidet "einmal gestolpert" von "seit Tagen tot".
  laeufe            BIGINT      NOT NULL DEFAULT 0,
  fehler_in_folge   INTEGER     NOT NULL DEFAULT 0,

  -- Wer den Lauf ausgeloest hat: 'intern' (HTTP-Endpunkt) oder 'takt' (BullMQ).
  -- Trennt "jemand hat es von Hand angestossen" von "es laeuft von selbst" —
  -- genau die Unterscheidung, die in der Marktplatz-Automatik gefehlt hat.
  quelle            TEXT        NOT NULL DEFAULT 'intern',

  erstellt_am       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aktualisiert_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT betriebs_takt_ergebnis_chk CHECK (ergebnis IN ('ok', 'fehler')),
  CONSTRAINT betriebs_takt_quelle_chk   CHECK (quelle   IN ('intern', 'takt'))
);

-- Die Kachel im Staff CC sortiert nach "am laengsten still" — das ist die
-- Reihenfolge, in der ein Mensch sie lesen will.
CREATE INDEX IF NOT EXISTS betriebs_takt_zuletzt_idx
  ON betriebs_takt (zuletzt_um ASC);

COMMENT ON TABLE betriebs_takt IS
  'Ein Herzschlag je Aufgabe (M1.1). Beantwortet: wann lief sie ZULETZT? '
  'Soll-Intervalle stehen im Code (betriebsTaktService.js), nicht hier.';

COMMIT;

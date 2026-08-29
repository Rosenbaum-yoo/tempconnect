-- Migration 204: Der Marktplatz-Feed faellt nie auf eine leere Liste zurueck
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Am 26.08. warf `GET /capacity-exchange/feed` fuer JEDEN angemeldeten
-- Betrachter einen 500er (ein ueberzaehliger Bind-Parameter, Postgres 08P01;
-- behoben in `e845c2d`). Der Betrachter sah eine leere Flaeche — und die ist
-- ununterscheidbar von "es gibt gerade keine Angebote".
--
-- Das ist die schlimmere Lesart: sie ist falsch UND sie alarmiert niemanden.
-- Ein Marktplatz, der leer aussieht, verliert Vertrauen; ein Marktplatz, der
-- sagt "Stand von 14:20", verliert nur Aktualitaet.
--
-- Owner-Entscheid 2026-08-27: bei einem Fehler nicht leer anzeigen, sondern
-- die letzte gute Liste — dauerhaft vorgehalten.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM EINE TABELLE UND NICHT REDIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Der Owner sagt "dauerhaft". Eine Kopie, die beim Neustart verschwindet, ist
-- genau dann weg, wenn man sie braucht — nach einem Absturz. Redis ist in
-- diesem Aufbau ausserdem optional (`getConnectionOpts()` kann null liefern);
-- ein Rueckfall, der selbst optional ist, ist kein Rueckfall.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM NICHT MEHRERE SERVER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Wovor diese Kopie schuetzt, ist ein FEHLER IN EINER ABFRAGE — genau das ist
-- passiert. Dagegen wirkt eine Kopie in derselben Datenbank vollstaendig, weil
-- sie ueber eine andere, viel einfachere Abfrage gelesen wird.
--
-- Gegen einen Serverausfall wirkt sie nicht — aber dann ist die ganze
-- Plattform weg (keine Anmeldung, keine Sitzung), und niemand kaeme bis zur
-- Liste. Hochverfuegbarkeit ist eine plattformweite Entscheidung an einer
-- Skalierungsstufe, nicht Teil einer Feed-Funktion. Ausgearbeitet in
-- `docs/features/L_TRAGFAEHIGKEIT.md`.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--
--   DROP TABLE IF EXISTS marktplatz_feed_kopie;
--
-- Gefahrlos: die Tabelle haelt ausschliesslich eine WIEDERHERSTELLBARE Kopie
-- des Feeds, keine Primaerdaten. Nach dem Entfernen faellt der Endpunkt auf
-- sein altes Verhalten zurueck — im Fehlerfall 500 statt der letzten guten
-- Liste. `feedKopieService` wirft in keinem Pfad; eine fehlende Tabelle wird
-- dort protokolliert und mit `null` beantwortet, nicht mit einem Absturz.
--
-- Der Code muss also NICHT gleichzeitig zurueckgerollt werden. Diese Reihenfolge
-- ist Absicht: ein Rollback, der zwei Dinge gleichzeitig verlangt, wird im
-- Ernstfall halb ausgefuehrt.

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS marktplatz_feed_kopie (
  -- Genau EINE Zeile. Der Primaerschluessel ist eine Konstante, damit ein
  -- UPSERT ohne Suchen auskommt und nie zwei Kopien nebeneinander stehen.
  id            SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Die Antwort, wie sie der Endpunkt ausgeliefert hat: { items, total, ... }.
  -- Bewusst als Ganzes und nicht in Spalten zerlegt — wir wollen exakt das
  -- wiedergeben, was zuletzt funktioniert hat, nicht es neu zusammensetzen.
  inhalt        JSONB        NOT NULL,

  -- Wie viele Eintraege die Kopie traegt. Redundant zum Inhalt, aber so laesst
  -- sich der Bestand pruefen, ohne das JSONB zu entpacken.
  eintraege     INTEGER      NOT NULL DEFAULT 0,

  -- Der Stand, den die Oberflaeche anzeigt. Eine Kopie ohne sichtbares Datum
  -- waere gefaehrlicher als gar keine: man haelt sie fuer aktuell.
  erstellt_am   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE marktplatz_feed_kopie IS
  'Letzte erfolgreich ausgelieferte Feed-Seite (ungefiltert, Seite 1). Wird NUR '
  'im Fehlerfall ausgeliefert, nie im Normalbetrieb — sonst gaebe es eine zweite '
  'Wahrheit ueber den Marktplatz. Owner-Entscheid 2026-08-27, Welle K4.';

COMMENT ON COLUMN marktplatz_feed_kopie.erstellt_am IS
  'Wird der Oberflaeche als "Stand von ..." angezeigt. Kopien aelter als 24 h '
  'werden nicht mehr ausgeliefert — ab da ist Schweigen ehrlicher.';


-- ═══════════════════════════════════════════════════════════════════════════
-- DER RUECKFALL WIRD GEZAEHLT — WEIL ES KEINEN KANAL GIBT, DER IHN MELDET
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Der Plan (K4.3) sah eine Meldung an das Team vor. Beim Bauen zeigte sich:
-- einen solchen Kanal gibt es nicht.
--
--   * `notificationMatrix.dispatch()` kennt NUR org- und vorgangsbezogene
--     Empfaenger — keine Strategie erreicht das Team. Ein unbekannter
--     Ereignis-Schluessel wird dort still uebersprungen (`sent: 0`).
--   * `writeStaffAudit()` verlangt zwingend eine handelnde Person
--     (`actorId`) und wirft ohne sie. Ein Systemereignis hat keine.
--
-- Einen Kanal zu erfinden waere hier der falsche Ort. Also wird der Rueckfall
-- ZAEHLBAR festgehalten: die Zahl beantwortet "lebt der Marktplatz gerade aus
-- der Konserve, und seit wann?" — und sie ist abfragbar, sobald es eine
-- Betriebs-Flaeche im Staff Center gibt (Welle K1 legt sie an).
--
-- Die Luecke selbst ist in `docs/features/K_BOUNTY_AUSZAHLUNG_MONATSPLANUNG.md`
-- benannt, nicht verschwiegen.

ALTER TABLE marktplatz_feed_kopie
  ADD COLUMN IF NOT EXISTS rueckfaelle        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS letzter_rueckfall  TIMESTAMPTZ;

COMMENT ON COLUMN marktplatz_feed_kopie.rueckfaelle IS
  'Wie oft die Kopie schon ausgeliefert wurde. Steigt sie, laeuft der Feed aus '
  'der Konserve — das ist ein Betriebsereignis, kein Normalzustand.';

COMMIT;

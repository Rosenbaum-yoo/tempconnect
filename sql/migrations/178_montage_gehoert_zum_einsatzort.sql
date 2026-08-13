-- 178_montage_gehoert_zum_einsatzort.sql
-- P10 Spur E / Welle E3 — Montage ist eine Eigenschaft des Einsatzes
--
-- WARUM DIESE MIGRATION
-- Welle E1 hat gemessen: fuer "Montage" gibt es im Bestand KEINE Quelle. Der
-- Owner will den Zustand trotzdem (E-E1, voller Umfang) — also muss er zuerst
-- erfassbar werden. Ein Reiter ohne Datenquelle waere die naechste tote Flaeche,
-- und davon hat dieses Repo genug (docs/FRONTEND_REIFEGRAD_AUDIT.md).
--
-- WO ES HINGEHOERT — GEPRUEFT, NICHT GERATEN
-- Der Plan liess offen, ob das Feld an `assignments` oder an
-- `worker_assignment_links` gehoert. Das Schema beantwortet die Frage eindeutig:
--
--   assignments             kennt Auftraggeber, Zeitraum, Satz, Kopfzahl —
--                           aber KEINEN Ort. Kein location_*, kein Treffpunkt.
--   worker_assignment_links traegt die gesamte Ortswahrheit je Mensch:
--                           client_name, location_address, location_lat/lng,
--                           meeting_point, instructions, dress_code,
--                           contact_* und dispatcher_*.
--
-- Montage heisst "auswaerts mit Uebernachtung" — das ist eine Aussage ueber den
-- ORT, an den dieser Mensch faehrt. Sie gehoert neben location_address, nicht in
-- eine Tabelle, die keinen Ort kennt. Der Nebeneffekt ist fachlich richtig: zwei
-- Kraefte desselben Auftrags koennen auf verschiedene Baustellen gehen — dieses
-- Schema sieht das ausdruecklich vor, und nur hier laesst sich das abbilden.
--
-- WARUM NUR EIN SCHALTER UND KEIN ZWEITES FELD
-- Naheliegend waeren "Unterkunft" und "Auslöse". Beide waeren hier spekulativ:
-- die Unterkunft steht bereits in `meeting_point`/`instructions`, und die
-- Auslöse ist Abrechnung, nicht Disposition. Ein Feld, das niemand fuellt, ist
-- schlimmer als keins. Kommt die Lohnseite dazu, ist sie eine eigene Welle mit
-- eigenem Gate.
--
-- NOT NULL DEFAULT FALSE ist hier richtig und nicht faul: "keine Montage" ist
-- die wahre Aussage ueber jeden Bestandseinsatz. Ein NULL-Zustand ("wissen wir
-- nicht") wuerde eine Ungewissheit erfinden, die es nicht gibt — der Regelfall
-- der Zeitarbeit ist der taegliche Heimweg.
--
-- Kein Index: die Live-Belegschaft liest den Wert immer ueber den ohnehin
-- gefilterten Einsatz einer Kraft (wal_worker_active_idx). Ein eigener Index auf
-- ein boolesches Feld mit ueberwiegend FALSE brächte nichts und kostete bei
-- jedem Schreibvorgang.
--
-- ROLLBACK
--   ALTER TABLE worker_assignment_links DROP COLUMN IF EXISTS is_montage;

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE worker_assignment_links
  ADD COLUMN IF NOT EXISTS is_montage BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN worker_assignment_links.is_montage IS
  'Auswaertseinsatz mit Uebernachtung. Am Einsatz-Link, weil dort die Ortswahrheit steht (location_address, meeting_point) — assignments kennt keinen Ort. Quelle des Zustands "montage" in der Live-Belegschaft (Welle E3).';

COMMIT;

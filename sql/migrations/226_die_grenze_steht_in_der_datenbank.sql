-- Migration 226: Die Standortgrenze steht in der Datenbank, nicht nur im Dienst (U6.1)
-- =============================================================================
-- Owner-Freigabe 2026-10-01 (U6 im Standort-Plan, Punkt 9 der Sammelliste):
-- "Zusammengesetzte Fremdschluessel (id, org_id) jetzt oder spaeter? JETZT."
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RUECKNAHME / ROLLBACK (zuerst, weil sie zur Zusage gehoert)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Diese Migration VERBIETET nur; nichts baut auf ihr auf. Sie ist deshalb
-- vollstaendig rueckholbar, indem man je Tabelle den zusammengesetzten Schluessel
-- faellt und den alten einspaltigen wieder anlegt, zum Beispiel:
--
--   ALTER TABLE assignments DROP CONSTRAINT assignments_location_org_fkey;
--   ALTER TABLE assignments ADD  CONSTRAINT assignments_location_id_fkey
--     FOREIGN KEY (location_id) REFERENCES org_locations(id) ON DELETE SET NULL;
--
-- Und zuletzt die beiden Voraussetzungen:
--
--   ALTER TABLE org_locations   DROP CONSTRAINT org_locations_id_org_key;
--   ALTER TABLE org_departments DROP CONSTRAINT org_departments_id_org_key;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Welle U0.2 hat am 2026-09-20 gemessen, dass ein FREMDER Standort von drei
-- Wegen aus die Datenbank erreichte, und die Luecken im Dienst geschlossen. Der
-- Befund nannte damals schon den Rest, der jetzt dran ist:
--
--   "Der Fremdschluessel faengt das nicht: er zeigt auf org_locations(id), nicht
--    auf (id, org_id) - er prueft nur, dass es die Zeile IRGENDWO gibt."
--
-- Seitdem sind FUENF weitere Stellen derselben Klasse gefunden worden
-- (updateDepartment, updateRequisition, updateRateCard, contract_id in beiden
-- Haelften, timesheets.assignment_id). Jede einzelne war ein vergessener Riegel
-- im Dienst. Diese Migration beendet die Abhaengigkeit davon, dass kein
-- weiterer vergessen wird: ab hier weist die DATENBANK einen org-fremden
-- Verweis ab, unabhaengig davon, welcher Weg ihn schickt.
--
-- Das ist die zweite Verteidigungslinie, nicht ein Ersatz fuer die erste. Die
-- Pruefungen im Dienst bleiben - sie antworten mit 403 und einer Begruendung,
-- waehrend die Datenbank mit einem Fehler antwortet. Ein Nutzer soll das
-- Erstere sehen.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- GEMESSEN VOR DEM SCHREIBEN - und zweimal, mit Abstand
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Alle 13 Beziehungen in 7 Tabellen auf verletzende Zeilen geprueft:
-- am 2026-09-28 ueberall 0, und am 2026-10-01 unmittelbar vor dieser Migration
-- ERNEUT ueberall 0 (U6.0). Die zweite Messung ist keine Formalie: zwischen
-- beiden liegen drei Tage, mehrere volle Testlaeufe und sechs Commits, und jeder
-- davon kann Daten anlegen. Nur eine Beziehung ist ueberhaupt belegt
-- (org_departments.location_id, 3 Zeilen) - auch dort 0 Verstoesse.
--
-- Es gibt also nichts zu bereinigen. Haette die zweite Messung einen einzigen
-- Verstoss gezeigt, waere diese Migration NICHT geschrieben worden: eine
-- org-fremde Verknuepfung ist ein Befund, keine Altlast.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIE SPALTENAUSWAHL BEI "ON DELETE SET NULL" IST DER WICHTIGSTE TEIL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ein zusammengesetzter Fremdschluessel mit ON DELETE SET NULL nullt in
-- PostgreSQL ALLE referenzierenden Spalten - also auch org_id. Das waere hier
-- keine Unschoenheit, sondern Datenverlust:
--
--   In vier der sieben Tabellen ist die Org-Spalte NOT NULL (org_departments,
--   org_memberships, rate_cards, vendor_pool.client_org_id). Dort wuerde das
--   Loeschen eines Standorts mit einem Fehler abbrechen.
--
--   In den drei anderen (assignments, capacity_posts, requisitions) ist sie
--   NULLBAR. Dort wuerde es STILL durchgehen, und die Zeile verliert ihre
--   Organisation. Das ist der schlimmere Fall, weil ihn niemand merkt.
--
-- Deshalb steht hinter jedem ON DELETE SET NULL eine ausdrueckliche
-- Spaltenauswahl. Die Syntax gibt es seit PostgreSQL 15; hier laeuft 16.12
-- (gemessen), und sie ist am 2026-10-01 in Wegwerf-Tabellen gegen die laufende
-- Datenbank geprueft worden - samt der Gegenprobe, dass ein org-fremder
-- Verweis wirklich abgewiesen wird.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- JE TABELLE EINZELN, nicht in einem Block
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sieben Tabellen, dreizehn Schluessel. Wer sie in einer Anweisung umstellt,
-- bekommt bei einem Fehler eine Meldung ohne Ort. Einzeln umgestellt sagt der
-- Abbruch, welche Beziehung ihn ausgeloest hat.
--
-- ACHTUNG, EINE TABELLE WEICHT AB: vendor_pool hat kein org_id, sondern
-- client_org_id (und daneben supplier_org_id fuer die andere Seite). Wer hier
-- org_id einsetzt, bekommt einen Fehler - wer supplier_org_id einsetzt, bekommt
-- eine Grenze, die das Falsche bewacht.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIESE BAUART IST NICHT NEU - und das ist ein Argument, nicht eine Fussnote
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Vor dieser Migration gab es bereits zwei zusammengesetzte Fremdschluessel im
-- Baum: worker_absences und worker_status_events auf
-- worker_profiles(id, supplier_org_id). Diese Migration setzt also die Hausbauart
-- fort, sie erfindet keine.
--
-- Beide tragen ON DELETE CASCADE, und DORT GIBT ES DIE FALLE NICHT: CASCADE
-- loescht die ZEILE, es leert keine Felder. Wer die Regel aus dieser Migration
-- uebergeneralisiert und anfaengt, CASCADE-Schluessel "abzusichern", sucht ein
-- Problem, das sie nicht haben.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EINE VORWARNUNG, KEIN BEFUND: invoices.org_id ist ebenfalls nullbar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- invoices steht NICHT in den sieben Tabellen oben - die Tabelle hat weder
-- location_id noch department_id, es gibt dort also nichts zu binden. Heute ist
-- das harmlos.
--
-- Sollte eine Rechnung jemals einen Standort bekommen, wartet dort genau diese
-- Falle - und dann auf GELD. Wer das Feld hinzufuegt, braucht die Spaltenauswahl
-- beim ON DELETE SET NULL vom ersten Tag an. Diese Zeilen stehen hier und nicht
-- in einem Ticket, weil der Naechste die Migration liest und nicht das Ticket.
-- =============================================================================

BEGIN;

-- ── 1. Die Voraussetzung: ohne UNIQUE (id, org_id) kann kein ──────────────────
--       zusammengesetzter Schluessel darauf zeigen.

ALTER TABLE org_locations
  ADD CONSTRAINT org_locations_id_org_key UNIQUE (id, org_id);

ALTER TABLE org_departments
  ADD CONSTRAINT org_departments_id_org_key UNIQUE (id, org_id);

-- ── 2. assignments ───────────────────────────────────────────────────────────

ALTER TABLE assignments DROP CONSTRAINT assignments_location_id_fkey;
ALTER TABLE assignments ADD CONSTRAINT assignments_location_org_fkey
  FOREIGN KEY (location_id, org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE assignments DROP CONSTRAINT assignments_department_id_fkey;
ALTER TABLE assignments ADD CONSTRAINT assignments_department_org_fkey
  FOREIGN KEY (department_id, org_id) REFERENCES org_departments(id, org_id)
  ON DELETE SET NULL (department_id);

-- ── 3. capacity_posts ────────────────────────────────────────────────────────

ALTER TABLE capacity_posts DROP CONSTRAINT capacity_posts_location_id_fkey;
ALTER TABLE capacity_posts ADD CONSTRAINT capacity_posts_location_org_fkey
  FOREIGN KEY (location_id, org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE capacity_posts DROP CONSTRAINT capacity_posts_department_id_fkey;
ALTER TABLE capacity_posts ADD CONSTRAINT capacity_posts_department_org_fkey
  FOREIGN KEY (department_id, org_id) REFERENCES org_departments(id, org_id)
  ON DELETE SET NULL (department_id);

-- ── 4. org_departments (eine Abteilung liegt an einem Standort DERSELBEN Org) ─

ALTER TABLE org_departments DROP CONSTRAINT org_departments_location_id_fkey;
ALTER TABLE org_departments ADD CONSTRAINT org_departments_location_org_fkey
  FOREIGN KEY (location_id, org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

-- ── 5. org_memberships ───────────────────────────────────────────────────────

ALTER TABLE org_memberships DROP CONSTRAINT org_memberships_location_id_fkey;
ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_location_org_fkey
  FOREIGN KEY (location_id, org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE org_memberships DROP CONSTRAINT org_memberships_department_id_fkey;
ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_department_org_fkey
  FOREIGN KEY (department_id, org_id) REFERENCES org_departments(id, org_id)
  ON DELETE SET NULL (department_id);

-- ── 6. rate_cards ────────────────────────────────────────────────────────────

ALTER TABLE rate_cards DROP CONSTRAINT rate_cards_location_id_fkey;
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_location_org_fkey
  FOREIGN KEY (location_id, org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE rate_cards DROP CONSTRAINT rate_cards_department_id_fkey;
ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_department_org_fkey
  FOREIGN KEY (department_id, org_id) REFERENCES org_departments(id, org_id)
  ON DELETE SET NULL (department_id);

-- ── 7. requisitions ──────────────────────────────────────────────────────────

ALTER TABLE requisitions DROP CONSTRAINT requisitions_location_id_fkey;
ALTER TABLE requisitions ADD CONSTRAINT requisitions_location_org_fkey
  FOREIGN KEY (location_id, org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE requisitions DROP CONSTRAINT requisitions_department_id_fkey;
ALTER TABLE requisitions ADD CONSTRAINT requisitions_department_org_fkey
  FOREIGN KEY (department_id, org_id) REFERENCES org_departments(id, org_id)
  ON DELETE SET NULL (department_id);

-- ── 8. vendor_pool — HIER HEISST DIE SPALTE client_org_id ────────────────────
--
--      Die Lieferantenbeziehung gehoert dem KUNDEN; sein Standort ist der, der
--      gelten muss. supplier_org_id steht daneben und ist hier absichtlich NICHT
--      gemeint: der Standort des Lieferanten hat mit dieser Zeile nichts zu tun.

ALTER TABLE vendor_pool DROP CONSTRAINT vendor_pool_location_id_fkey;
ALTER TABLE vendor_pool ADD CONSTRAINT vendor_pool_location_org_fkey
  FOREIGN KEY (location_id, client_org_id) REFERENCES org_locations(id, org_id)
  ON DELETE SET NULL (location_id);

ALTER TABLE vendor_pool DROP CONSTRAINT vendor_pool_department_id_fkey;
ALTER TABLE vendor_pool ADD CONSTRAINT vendor_pool_department_org_fkey
  FOREIGN KEY (department_id, client_org_id) REFERENCES org_departments(id, org_id)
  ON DELETE SET NULL (department_id);

COMMIT;

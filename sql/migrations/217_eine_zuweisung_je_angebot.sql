-- Migration 217: Ein Angebot traegt hoechstens eine Zuweisung
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `assignments.offer_id` war nicht eindeutig (Migration 087 legte nur einen
-- gewoehnlichen Index an). Welle N2.8 hat die Folge gemessen: traegt ein
-- Angebot zwei Zuweisungen, zaehlte der Handelsstand seine Zusage doppelt,
-- die freie Kopfzahl fiel auf null und `syncCapacityCommercialState` nahm das
-- Angebot als `reserved` aus dem Markt — obwohl Plaetze frei waren. Die Abfrage
-- rechnet seitdem richtig; das Schema liess den Zustand trotzdem zu.
--
-- Owner-Entscheid 2026-09-13: GENAU EINE Zuweisung je Angebot. Faellt eine
-- Kraft aus, rueckt die naechste aus der Warteliste in DENSELBEN Einsatz nach
-- (`assignment_staffing_waitlist`, Migration 089) — Vertrag, Stundensatz,
-- Stundenzettel und Rechnung bleiben eine Linie. Ein zweiter Einsatz am selben
-- Angebot waere ein zweiter Vertragsdatensatz fuer dieselbe Vereinbarung.
--
-- Der Code verhinderte das bisher an genau einer Stelle: `activateAgreement`
-- sperrt das Angebot (FOR UPDATE) und bricht bei gesetztem `assignment_id` ab.
-- Die manuelle Anlage (`POST /api/assignments`) nahm `offer_id` dagegen
-- ungeprueft entgegen — sie setzt es seit derselben Welle nicht mehr. Dieser
-- Index ist die Zusage auf der Ebene, die kein kuenftiger Pfad umgehen kann.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM TEILINDEX UND NICHT UNIQUE-CONSTRAINT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `offer_id` ist fuer die meisten Einsaetze NULL (Anlage ohne Marktplatz,
-- Vendor-Pool, Import). Ein Teilindex `WHERE offer_id IS NOT NULL` sagt genau
-- das: eindeutig, WO gesetzt — und haelt die NULL-Zeilen aus dem Index heraus.
-- Er ersetzt den bisherigen `assignments_offer_idx` vollstaendig (gleiche
-- Spalte, gleiche Bedingung), deshalb wird der alte entfernt: zwei Indizes auf
-- derselben Spalte kosten bei jedem Schreiben doppelt und helfen keinem Lesen.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VORBEDINGUNG — LAUT, NICHT STILL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Liegen bereits Doppelte vor, bricht die Migration mit ihrer Anzahl ab, statt
-- eine der Zeilen zu loeschen. Welche Zuweisung die richtige ist, weiss nur
-- der Mensch, der die Vereinbarung kennt; an einer Zuweisung haengen
-- Stundenzettel und Rechnungen (HGB §257). Gemessen 2026-09-13 auf der
-- Entwicklungsdatenbank: 5 Zuweisungen mit Angebot, 5 verschiedene Angebote.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--
--   CREATE INDEX IF NOT EXISTS assignments_offer_idx
--     ON assignments(offer_id) WHERE offer_id IS NOT NULL;
--   DROP INDEX IF EXISTS assignments_offer_eindeutig;
--
-- Gefahrlos in dieser Reihenfolge: erst der gewoehnliche Index zurueck, dann
-- der eindeutige weg — es gibt keinen Moment ohne Index auf der Spalte. Der
-- Code muss nicht mit zurueck: er verlaesst sich nicht auf den Index, er
-- verhindert Doppelte selbst; der Index ist die zweite Linie.

SET client_min_messages TO WARNING;

BEGIN;

DO $$
DECLARE
  doppelt INT;
BEGIN
  SELECT COUNT(*) INTO doppelt
    FROM (
      SELECT offer_id
        FROM assignments
       WHERE offer_id IS NOT NULL
       GROUP BY offer_id
      HAVING COUNT(*) > 1
    ) d;
  IF doppelt > 0 THEN
    RAISE EXCEPTION
      'Migration 217: % Angebot(e) tragen mehr als eine Zuweisung. Vor dem eindeutigen Index von Hand klaeren, welche Zuweisung gilt — nichts wird automatisch geloescht.',
      doppelt;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS assignments_offer_eindeutig
  ON assignments(offer_id)
  WHERE offer_id IS NOT NULL;

DROP INDEX IF EXISTS assignments_offer_idx;

COMMENT ON INDEX assignments_offer_eindeutig IS
  'Ein Angebot traegt hoechstens eine Zuweisung. Ausfaelle werden innerhalb des '
  'Einsatzes ueber die Warteliste nachbesetzt, nie ueber einen zweiten Einsatz. '
  'Owner-Entscheid 2026-09-13 (Welle N2.9); ersetzt assignments_offer_idx.';

COMMIT;

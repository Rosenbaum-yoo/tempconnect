-- =============================================================================
-- Migration 228: der Index, auf dem die AUEG-Frist nachschlaegt (M11.7)
--
-- Plan: docs/features/M_MARKTPLATZ_FLOW.md, M11.7 — "Index auf
-- worker_assignment_links(org_id) (Rang 10)", Nachweis "Lastprobe: 300 Kunden".
--
-- REINES LESEPFAD-ADD-ON: keine Schema-, keine Verhaltensaenderung, keine
-- Bestandsdaten beruehrt, vollstaendig rueckwaertskompatibel.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- GEMESSEN AM 2026-10-02, und die Messung hat die Begruendung des Plans
-- VERSCHOBEN
-- ─────────────────────────────────────────────────────────────────────────────
--
--   Indizes auf worker_assignment_links        11
--   davon mit org_id als fuehrender Spalte      0
--   davon mit org_id ueberhaupt                 0
--   seq_scan / seq_tup_read / n_live_tup    13 381 / 317 432 / 26
--
-- Die Zahl "1 Index mit org_id", die eine erste Messung meldete, war ein
-- TEILZEICHENKETTEN-TREFFER auf `supplier_org_id` (in `wal_supplier_idx`). Es
-- gibt keinen. Dieselbe Falle wie bei `/staff` gegen `/staffing-...`: wer einen
-- Namen irgendwo im Text sucht, findet den laengeren und meldet den kuerzeren
-- als vorhanden.
--
-- ZWEI BEGRUENDUNGEN WAREN IM UMLAUF. Die eine traegt, die andere nicht:
--
--   TRAEGT: `api/services/auegFristService.js` filtert an ZWEI Stellen
--   (`ladeZeitraeume`, `ladeAuegKontenFuerOrg`) mit genau dieser Form —
--
--       WHERE wal.org_id = $1
--         AND wal.worker_user_id = $2        (bzw. = ANY($2::uuid[]))
--         AND wal.start_date IS NOT NULL
--       ORDER BY wal.start_date ASC
--
--   Das ist die AUEG-Hoechstueberlassungsdauer: eine GESETZLICHE Frist, und
--   einer der drei Fristenpfade, die das Produkt verkaufen. Sie wird je Kraft je
--   Entleiher nachgeschlagen, also N-fach pro Uebersicht.
--
--   TRAEGT NICHT: "Migration 196 legt RLS auf diese Spalte, jede Zeile wertet sie
--   ohnehin aus." Gemessen: die Rolle, mit der die Anwendung verbindet
--   (`tempconnect`), hat `rolsuper = true` UND `rolbypassrls = true`. Die
--   Richtlinie `wal2_same_org` laeuft fuer sie NIE — ohne jeden Org-Kontext sind
--   alle 26 Zeilen sichtbar, und der Plan zeigt keinen RLS-Filter. Die
--   Begruendung waere richtig, SOBALD die Anwendung mit `rls_app`
--   (`rolsuper = false`) verbindet; das ist eine Owner-Entscheidung und steht in
--   `docs/UEBERGABE.md`. Hier wird sie deshalb NICHT als Grund gefuehrt.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WARUM DREI SPALTEN UND NICHT NUR `org_id`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Der Plan sagt `(org_id)`. Die gemessene Abfrageform verlangt mehr, und ein
-- breiterer Index kostet hier nichts Zusaetzliches, weil er den schmaleren
-- ENTHAELT:
--
--   `(org_id, worker_user_id, start_date)`
--      · org_id          Gleichheit   -> fuehrende Spalte
--      · worker_user_id  Gleichheit   -> zweite Spalte, auch fuer `= ANY(...)`
--      · start_date      ORDER BY     -> die Sortierung kommt aus dem Index,
--                                        der Sort faellt weg
--
-- Und weil `org_id` die FUEHRENDE Spalte ist, bedient derselbe Index auch jede
-- reine `org_id = $1`-Abfrage — einschliesslich der RLS-Bedingung, wenn sie
-- eines Tages greift. EIN Index statt zwei: die Tabelle hat 46 Spalten und wird
-- bei jeder Bestaetigung geschrieben, jeder weitere Index kostet dort
-- Schreibarbeit.
--
-- KEIN partieller Index (`WHERE start_date IS NOT NULL`), obwohl die Abfragen das
-- Praedikat tragen: ein partieller waere kleiner, aber fuer eine reine
-- `org_id`-Abfrage unbenutzbar. Der Vollindex deckt beide Faelle; das Praedikat
-- wird im Indexscan billig mitgefiltert.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SKALIERUNGS-DEFEKTKLASSE "LAEUFT BEI 10, BRICHT BEI 300"
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Die gescannte Menge waechst UNBEGRENZT: eine Zeile je Einsatz je Kraft, ohne
-- Obergrenze. Die Zahl der Abfragen waechst ebenfalls — die AUEG-Konten werden
-- je Uebersicht fuer alle gezeigten Kraefte geladen. Nach dem Diskriminator des
-- Projekts (Erkenntnis 2026-06-03) ist damit beides erfuellt, was einen echten
-- Befund von einem Fehlalarm trennt.
--
-- WAS DIE LASTPROBE DAZU SAGT (gefuehrt am 2026-10-02 in einer
-- zurueckgerollten Transaktion, damit die Probebuehne unberuehrt bleibt; Zahlen
-- im Plan M11.7 und in docs/UEBERGABE.md): bei 300 Kunden traegt der Index die
-- Abfrage von einem vollen Durchlauf auf einen Indexscan.
--
-- WAS EIN `EXPLAIN` AUF DER HEUTIGEN TABELLE NICHT BEWEIST: bei 26 Zeilen waehlt
-- Postgres den Durchlauf, mit Index oder ohne. Deshalb die Lastprobe und nicht
-- ein Plan auf dem Bestand.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK-STRATEGIE
-- ─────────────────────────────────────────────────────────────────────────────
--
--   DROP INDEX IF EXISTS wal_org_worker_start_idx;
--
-- Ein Drop stellt exakt den Zustand vor dieser Migration her. Die AUEG-Frist
-- rechnet danach weiter korrekt, nur langsamer — der Index ist reine
-- Lesepfad-Optimierung und wird von keiner Logik vorausgesetzt.
--
-- BETRIEBSHINWEIS: `CREATE INDEX` ohne `CONCURRENTLY` nimmt eine Schreibsperre
-- auf die Tabelle, fuer die Dauer des Aufbaus. Das ist das Hausmuster (vgl.
-- Mig 122) und bei der heutigen Groesse unmerklich. Auf einer grossen
-- Produktionstabelle gehoert stattdessen `CREATE INDEX CONCURRENTLY` in ein
-- EIGENES Skript ausserhalb jeder Transaktion — es ist in `BEGIN ... COMMIT`
-- nicht erlaubt.
--
-- Welle M, M11.7 — 2026-10-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

CREATE INDEX IF NOT EXISTS wal_org_worker_start_idx
  ON worker_assignment_links (org_id, worker_user_id, start_date);

COMMENT ON INDEX wal_org_worker_start_idx IS
  'Stuetzt die AUEG-Hoechstueberlassungsdauer (auegFristService.ladeZeitraeume / '
  'ladeAuegKontenFuerOrg): org_id + worker_user_id als Gleichheit, start_date als '
  'Sortierung. Fuehrende Spalte org_id bedient zusaetzlich jede reine '
  'org_id-Abfrage und die RLS-Bedingung wal2_same_org, sobald die Anwendung mit '
  'einer Rolle ohne BYPASSRLS verbindet. M11.7.';

-- Die Notbremse dieser Migration: ohne den Index waere sie wirkungslos
-- durchgelaufen, und das faellt erst in der Lastprobe auf.
DO $nachweis$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'worker_assignment_links'
       AND indexname = 'wal_org_worker_start_idx'
  ) THEN
    RAISE EXCEPTION '228: wal_org_worker_start_idx wurde nicht angelegt.';
  END IF;
  /* Und er muss mit org_id FUEHREN - genau das ist der Punkt der Migration.
     Ein Index auf (worker_user_id, org_id, ...) waere fuer die AUEG-Abfrage
     brauchbar und fuer die RLS-Bedingung wertlos. */
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'worker_assignment_links'
       AND indexname = 'wal_org_worker_start_idx'
       AND indexdef ~ 'USING btree \(org_id,'
  ) THEN
    RAISE EXCEPTION '228: wal_org_worker_start_idx fuehrt nicht mit org_id.';
  END IF;
  RAISE NOTICE '228: wal_org_worker_start_idx steht - AUEG-Frist schlaegt nicht mehr im Durchlauf nach.';
END $nachweis$;

COMMIT;

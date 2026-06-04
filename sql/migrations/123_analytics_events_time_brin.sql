-- =============================================================================
-- Migration 123: BRIN-Zeitindex für product_analytics_events (Phase Q — Index-Review)
--
-- Fortsetzung des Cron-Sweep-Index-Reviews (Mig 122). Nach der Prüfung ALLER
-- ~20 internen Sweeps (api/routes/internal.js) gegen den Skalierungs-
-- Diskriminator „wächst die gescannte Menge unbegrenzt mit Kunden/Daten?" bleibt
-- genau EINE echte Lücke übrig, die Mig 122 (btree-Partials auf Status-Prädikate)
-- bewusst NICHT abdeckt: die zeitreihenbasierten Scans auf der einzigen
-- *event-cardinality* Tabelle product_analytics_events.
--
-- Zwei Cron-Sweeps scannen diese Tabelle ausschließlich über occurred_at:
--   - product-analytics-retention -> cleanupAnalyticsRetention:
--       DELETE … WHERE occurred_at < NOW() - retention   (alter Bereich)
--   - product-analytics-rollup    -> runDailyAnalyticsRollup:
--       SELECT … WHERE occurred_at >= NOW() - days_back   (junger Bereich, mehrfach)
-- Bestand (Mig 066/068): 8 Indizes, ALLE mit occurred_at als ZWEITER Spalte
--   ((event_name, occurred_at), (org_id, occurred_at), …) — KEINER führt mit der
--   Zeit. Beide Sweeps fallen daher auf Full-Table-Scan zurück. Bei 300 Kunden
--   ist diese Tabelle (Event-Volumen, nicht Kunden-Volumen) die mit Abstand
--   größte der gesweepten — der tägliche Full-Scan wird zur CPU/IO-Spitze.
--
-- WARUM BRIN statt btree (Blueprint-relevantes Muster für 20 Folgeprojekte):
--   - occurred_at ist APPEND-ONLY und physisch zeitkorreliert (Events werden in
--     Zeitreihenfolge eingefügt). Genau der Fall, für den BRIN gebaut ist:
--     winziger Index (Block-Range-Summaries statt Per-Zeile-Einträge), der dem
--     DELETE/Rollup erlaubt, nicht passende Block-Bereiche zu überspringen.
--   - Entscheidend: BRIN belastet den HEISSEN Insert-Pfad NICHT. product_analytics_
--     events ist die volumenstärkste Insert-Tabelle; ein btree(occurred_at) würde
--     bei JEDEM Event-Insert Index-Wartung kosten (Write-Amplification). BRIN
--     aktualisiert nur Range-Summaries → praktisch kostenlos beim Insert. Ein
--     btree wäre hier die falsche Wahl, nur um einen täglichen Wartungs-Scan zu
--     beschleunigen.
--
-- Reines Performance-Add-on: KEINE Schema-/Verhaltensänderung, add-only,
-- IF NOT EXISTS (idempotent), vollständig rückwärtskompatibel.
--
-- Rollback-Strategie:
--   DROP INDEX IF EXISTS product_analytics_events_occurred_brin_idx;
--   (Reine Lesepfad-/Wartungs-Optimierung; ein Drop stellt exakt den Vorzustand
--    her. Beide Sweeps funktionieren danach korrekt, nur langsamer.)
--
-- Phase 5 Finalisierung — Phase Q (Index-Review, Gate 100) — 2026-06-03
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- BRIN auf occurred_at: stützt BEIDE zeitbasierten Sweeps (Retention-DELETE alt,
-- Rollup-SELECT jung) auf der event-cardinality Tabelle, ohne den Insert-Pfad zu
-- belasten. pages_per_range bleibt Default (128) — für append-only-Zeitreihen gut.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS product_analytics_events_occurred_brin_idx
  ON product_analytics_events USING BRIN (occurred_at);
COMMENT ON INDEX product_analytics_events_occurred_brin_idx
  IS 'BRIN-Zeitindex für die Cron-Sweeps product-analytics-retention (DELETE occurred_at<cutoff) + product-analytics-rollup (SELECT occurred_at>=NOW()-N). BRIN statt btree, da append-only/zeitkorreliert und Insert-Pfad heiß (keine Write-Amplification).';

COMMIT;

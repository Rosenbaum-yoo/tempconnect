-- 151: Instant-Matching (P4.1) — Paar-Dedup als Datenbank-Wahrheit.
--
-- Warum: bisher wurde "schon alarmiert?" per Applikationslogik ueber ein Zeitfenster
-- (user_id, source_type, source_id, 4h) entschieden. Das verhindert keine Doppel-
-- Benachrichtigung fuer dasselbe Paar (Angebot x Auftrag): wird der Auftrag zuerst
-- angelegt und das Angebot spaeter, ist die Quelle eine andere -> zweiter Alarm fuer
-- exakt dieselbe Paarung. Ein richtungsunabhaengiger, kanonischer pair_key mit UNIQUE
-- Index macht das strukturell unmoeglich, unabhaengig davon, welcher Erstellungspfad
-- feuert und wie oft.
--
-- pair_key-Format (kanonisch sortiert, in instantMatchService.buildPairKey erzeugt):
--   "capacity_post:<uuid>|demand_request:<uuid>"
--   "capacity_post:<uuid>|requisition:<uuid>"
--
-- Rollback:
--   DROP INDEX IF EXISTS match_alerts_pair_unique_idx;
--   DROP INDEX IF EXISTS match_alerts_counterpart_idx;
--   ALTER TABLE match_alerts DROP COLUMN IF EXISTS pair_key;
--   ALTER TABLE match_alerts DROP COLUMN IF EXISTS counterpart_id;
--   ALTER TABLE match_alerts DROP COLUMN IF EXISTS counterpart_type;
-- (Additiv: Bestandszeilen bleiben gueltig, pair_key ist dort NULL und faellt aus
--  dem partiellen UNIQUE-Index heraus — Altverhalten bleibt unveraendert.)

ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS counterpart_type TEXT;
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS counterpart_id UUID;
ALTER TABLE match_alerts ADD COLUMN IF NOT EXISTS pair_key TEXT;

-- Ein Empfaenger wird pro Paarung genau einmal alarmiert. Partiell, damit Altzeilen
-- ohne pair_key (SLA-Suchauftraege, Bestand vor P4.1) nicht kollidieren.
CREATE UNIQUE INDEX IF NOT EXISTS match_alerts_pair_unique_idx
  ON match_alerts (user_id, pair_key)
  WHERE pair_key IS NOT NULL;

-- Rueckrichtung: "welche Alarme verweisen auf dieses Gegenstueck?" (Activity Center 4.4)
CREATE INDEX IF NOT EXISTS match_alerts_counterpart_idx
  ON match_alerts (counterpart_type, counterpart_id)
  WHERE counterpart_id IS NOT NULL;

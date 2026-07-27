-- 153: KI-Ranking (P4.3) — Ergebnis-Cache und Kostenspur.
--
-- Warum ein Cache und keine reine Laufzeit-Berechnung: die Modellantwort fuer ein Paar
-- (Auftrag x Angebot) haengt nur vom Inhalt beider Seiten ab. Aendert sich keine Seite,
-- ist die Antwort dieselbe — sie erneut zu bezahlen waere reine Verschwendung. Der
-- `input_fingerprint` ist der Hash genau der Felder, die ins Modell gehen: aendert sich
-- eines, entsteht ein neuer Eintrag, der alte verfaellt von selbst.
--
-- `cost_micro_cents` ist bewusst mitgefuehrt: ohne gemessene Kosten pro Match ist
-- "wirtschaftlich optimal" eine Meinung (Owner-Vorgabe 2026-07-25). Zusammen mit
-- `match_logs` (Mig 152) laesst sich damit beantworten, was das KI-Ranking kostet und
-- ob es gegenueber der deterministischen Baseline aus 4.2 ueberhaupt besser rankt.
--
-- Rollback: DROP TABLE IF EXISTS ai_match_rankings;

CREATE TABLE IF NOT EXISTS ai_match_rankings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pair_key           TEXT NOT NULL,
  input_fingerprint  TEXT NOT NULL,
  model              TEXT NOT NULL,
  rank_position      INT,
  rank_score         INT,
  reason             TEXT,
  baseline_score     INT,
  input_tokens       INT NOT NULL DEFAULT 0,
  cache_read_tokens  INT NOT NULL DEFAULT 0,
  output_tokens      INT NOT NULL DEFAULT 0,
  cost_micro_cents   BIGINT NOT NULL DEFAULT 0,
  latency_ms         INT,
  org_id             UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cache-Treffer = dieselbe Paarung, derselbe Inhalt, dasselbe Modell.
CREATE UNIQUE INDEX IF NOT EXISTS ai_match_rankings_lookup_idx
  ON ai_match_rankings (pair_key, input_fingerprint, model);

-- Append-only und zeitkorreliert auf dem heissen Pfad: BRIN statt btree.
CREATE INDEX IF NOT EXISTS ai_match_rankings_created_brin_idx
  ON ai_match_rankings USING BRIN (created_at);

-- Kostenauswertung je Modell ueber die Zeit.
CREATE INDEX IF NOT EXISTS ai_match_rankings_model_idx
  ON ai_match_rankings (model, created_at DESC);

-- Migration 219: ein Faehigkeits-Vorschlag kann ZUGEORDNET werden, nicht nur
--                angenommen oder abgelehnt (N8.1b-7).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 160 hat den Vorschlagsweg gebaut: ein Arbeiter traegt eine
-- Faehigkeit ein, die der Katalog nicht kennt, und sie wartet als
-- `status='proposed'` auf Kuratierung. Die Spalte `merged_into_skill_id` steht
-- seitdem ebenfalls da — sie sollte den haeufigsten Fall tragen: der Vorschlag
-- ist keine neue Faehigkeit, sondern eine SCHREIBVARIANTE einer vorhandenen.
--
-- GEMESSEN AM 2026-09-22, und deshalb gibt es diese Migration:
--
--   * `status` erlaubt bisher nur 'approved', 'proposed', 'rejected'.
--     Fuer "gehoert zu einem bestehenden Eintrag" gab es keinen Wert.
--   * `merged_into_skill_id` wird von KEINER Zeile im ganzen Stack
--     geschrieben oder gelesen.
--   * Und niemand liest `status='proposed'` — kein Endpunkt, keine Flaeche.
--     Der Arbeiter hoert "wird geprueft", und geprueft wird nie.
--
-- Der Unterschied zwischen 'rejected' und 'merged' ist keine Feinheit: ein
-- abgelehnter Vorschlag sagt dem Arbeiter "das ist keine Faehigkeit", ein
-- zugeordneter sagt "die gibt es schon, sie heisst Lagerhelfer:in". Wer beides
-- auf denselben Wert abbildet, luegt einen der beiden Faelle an — und der
-- haeufigere ist der zweite: 20 der 54 katalogfremden Eintraege im Markt sind
-- allein "Lagerhelfer" gegen "Lagerhelfer:in".
--
-- WAS DIESE MIGRATION NICHT TUT: sie ordnet nichts zu. Sie macht nur den
-- Zustand moeglich, den die Kuratierung setzt.
--
-- ROLLBACK / RUECKNAHME (falls noetig):
--   ALTER TABLE platform_skills DROP CONSTRAINT platform_skills_status_check;
--   ALTER TABLE platform_skills ADD CONSTRAINT platform_skills_status_check
--     CHECK (status IN ('approved', 'proposed', 'rejected'));
--   -- Vorher pruefen, ob Zeilen mit status='merged' existieren; sie muessten
--   -- auf 'rejected' gesetzt werden, sonst schlaegt die Einschraenkung fehl.

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE platform_skills
  DROP CONSTRAINT IF EXISTS platform_skills_status_check;

ALTER TABLE platform_skills
  ADD CONSTRAINT platform_skills_status_check
  CHECK (status IN ('approved', 'proposed', 'rejected', 'merged'));

COMMENT ON COLUMN platform_skills.merged_into_skill_id IS
  'Bei status=''merged'': der Katalogeintrag, zu dem dieser Vorschlag gehoert. '
  'Der Name des Vorschlags wird dabei als Alias am Ziel hinterlegt, damit '
  'dieselbe Schreibweise beim naechsten Mal sofort trifft (N8.1b-7).';

-- Die Kuratier-Liste liest ausschliesslich offene Vorschlaege, aelteste zuerst.
-- Ohne diesen Index waere das ein Seq-Scan ueber den ganzen Katalog — heute
-- 162 Zeilen, aber der Katalog waechst mit jedem zugelassenen Vorschlag.
CREATE INDEX IF NOT EXISTS platform_skills_offene_vorschlaege_idx
  ON platform_skills (created_at)
  WHERE status = 'proposed';

COMMIT;

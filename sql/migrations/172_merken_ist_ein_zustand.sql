-- 172_merken_ist_ein_zustand.sql
-- P9 Spur B / Welle B1 — aus dem Merken-Knopf wird ein Schalter
--
-- WARUM DIESE MIGRATION
-- "Merken" liegt in `capacity_interactions` neben Ereignissen wie `question`
-- oder `contact`. Fuer Ereignisse ist das richtig: sie passieren, werden gezaehlt
-- und wiederholen sich. "Merken" ist aber ein ZUSTAND — entweder ein Eintrag
-- steht auf meiner Liste oder nicht.
--
-- Der Unterschied ist heute ein Defekt: `createInteraction` entdoppelt ueber ein
-- 10-Minuten-Fenster. Wer merkt, wieder entfernt und im selben Zeitraum erneut
-- merkt, bekommt KEINEN neuen Eintrag — der Schalter liesse sich nicht wieder
-- einschalten. Ein eindeutiger Schluessel dreht das um: mehrfaches Merken ist
-- dann folgenlos statt gefaehrlich, und der Gegenweg (Entfernen) wird moeglich.
--
-- ZWEI INDIZES, WEIL ES ZWEI ZIELE GIBT
-- Die Tabelle erlaubt genau eines von beiden (`capacity_interactions_one_target_chk`):
-- eine Kapazitaet ODER einen Bedarf. Beide Richtungen sollen merkbar sein — ein
-- Unternehmen merkt Kapazitaeten, eine Zeitarbeitsfirma Bedarfe.
--
-- BESTAND: keine doppelten Merkungen vorhanden (geprueft), der Index kann direkt
-- angelegt werden. Die DELETE-Vorstufe bleibt trotzdem stehen: sie ist idempotent
-- und macht die Migration auf einer Datenbank mit Altlasten nicht rot.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS capacity_interactions_merken_kapazitaet_idx;
--   DROP INDEX IF EXISTS capacity_interactions_merken_bedarf_idx;

BEGIN;

-- Sicherheitsnetz: falls irgendwo doch Dubletten liegen, bleibt die aelteste
-- (sie traegt das urspruengliche Merk-Datum).
DELETE FROM capacity_interactions a
 USING capacity_interactions b
 WHERE a.interaction_type = 'save'
   AND b.interaction_type = 'save'
   AND a.company_user_id = b.company_user_id
   AND a.capacity_post_id IS NOT NULL
   AND a.capacity_post_id = b.capacity_post_id
   AND a.created_at > b.created_at;

DELETE FROM capacity_interactions a
 USING capacity_interactions b
 WHERE a.interaction_type = 'save'
   AND b.interaction_type = 'save'
   AND a.company_user_id = b.company_user_id
   AND a.demand_request_id IS NOT NULL
   AND a.demand_request_id = b.demand_request_id
   AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS capacity_interactions_merken_kapazitaet_idx
  ON capacity_interactions (capacity_post_id, company_user_id)
  WHERE interaction_type = 'save' AND capacity_post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS capacity_interactions_merken_bedarf_idx
  ON capacity_interactions (demand_request_id, company_user_id)
  WHERE interaction_type = 'save' AND demand_request_id IS NOT NULL;

COMMENT ON INDEX capacity_interactions_merken_kapazitaet_idx IS
  'Merken ist ein Zustand, kein Ereignis: hoechstens eine Merkung je Kapazitaet und Nutzer. Macht das Setzen idempotent und das Entfernen eindeutig.';
COMMENT ON INDEX capacity_interactions_merken_bedarf_idx IS
  'Gegenstueck fuer Bedarfe — eine Zeitarbeitsfirma merkt sich Bedarfe wie ein Unternehmen Kapazitaeten.';

COMMIT;

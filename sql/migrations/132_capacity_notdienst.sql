-- 132_capacity_notdienst.sql — Notdienst-Stufe fuer Agentur-Personalangebote (USP).
-- demand_requests.urgency kennt 'notdienst' seit Mig 014 — capacity_posts.priority_level
-- erlaubte bisher nur normal/elevated/urgent. Der Feed-Ranker (capacityExchangeService)
-- behandelt priority_level='notdienst' bereits generisch (+12 Boost, NOTDIENST-Badge,
-- 'Notdienst'-Label) — es fehlte nur der erlaubte DB-Wert. Add-only/idempotent.
-- Rollback: Constraint wieder auf ('normal','elevated','urgent') setzen (vorher
-- UPDATE capacity_posts SET priority_level='urgent' WHERE priority_level='notdienst').

ALTER TABLE capacity_posts DROP CONSTRAINT IF EXISTS capacity_posts_priority_level_check;
ALTER TABLE capacity_posts ADD CONSTRAINT capacity_posts_priority_level_check
  CHECK (priority_level IN ('normal', 'elevated', 'urgent', 'notdienst'));

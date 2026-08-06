-- Migration 161: Mobilnummer an der Einladung — zweiter Zustellweg
-- =============================================================================
-- Die Einladung ins Einsatzportal ging bisher ausschliesslich per E-Mail. Genau
-- die Zielgruppe, die den Marktplatz fuellt — gewerbliche Einsatzkraefte — liest
-- aber zuverlaessiger eine SMS als ein Postfach, das sie alle paar Wochen oeffnet.
-- Jede nicht angenommene Einladung ist ein Arbeiter, der nie im Katalog steht,
-- und damit ein Angebot, das der Plattform fehlt.
--
-- WARUM EINE EIGENE SPALTE UND NICHT worker_profiles.phone
-- Die Einladung geht oft an jemanden, der noch KEIN Profil hat (Direkteinladung
-- per E-Mail, bevor ein Datensatz existiert). Die Nummer gehoert deshalb an den
-- Vorgang, nicht an das Profil. Bei der 1-Klick-Einladung aus der
-- Mitarbeiterliste wird sie aus dem vorhandenen Profil uebernommen.
--
-- BEWUSST NULLABLE: Ohne Nummer bleibt es beim E-Mail-Weg. Eine Pflichtangabe
-- wuerde den Bestandsablauf brechen, ohne irgendetwas besser zu machen.
--
-- Rollback:
--   ALTER TABLE worker_invites DROP COLUMN IF EXISTS phone;
--   ALTER TABLE worker_invites DROP COLUMN IF EXISTS sms_sent_at;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE worker_invites
  ADD COLUMN IF NOT EXISTS phone TEXT,
  -- Wann ging die SMS raus? Ohne diesen Stempel liesse sich nicht unterscheiden,
  -- ob der zweite Weg nicht versucht wurde oder fehlgeschlagen ist — und genau
  -- das will man wissen, wenn eine Einladung nicht angenommen wird.
  ADD COLUMN IF NOT EXISTS sms_sent_at TIMESTAMPTZ;

COMMIT;

-- =============================================================================
-- 190_melden_nur_was_man_sieht.sql — die dritte Zielart (Plan I, 10)
-- =============================================================================
-- BEFUND, im Browser gefunden und nicht im Quelltext:
--
--   Migration 189 hat `ziel_art` fuer `profil` und `angebot` angelegt. Beim
--   Nachpruefen der Oberflaeche fiel auf, dass "Angebot" im Produkt ZWEI Dinge
--   meint — und dass die wichtigere Haelfte fehlte:
--
--     `offers`         Ein Gebot auf einen konkreten Bedarf. Sehen nur die ZWEI
--                      Parteien; `/marketplace/offers/:id/detail` antwortet
--                      jedem anderen mit 403 (marketplace.js:1414).
--
--     `capacity_posts` Die Personalangebote im Vermittlungs-Feed.
--                      `GET /marketplace/capacity-posts` steht hinter
--                      `requireAuth` + `slaAccess` und filtert NICHT nach
--                      Anbieter (marketplace.js:296-302) — JEDER angemeldete
--                      Nutzer mit SLA-Zugang sieht sie alle.
--
--   "Freche oder betruegerische Inhalte" (Owner-Vorgabe Abschnitt 10) trifft
--   damit vor allem `capacity_posts`: das ist die Flaeche, auf der Fremde die
--   Inhalte von Fremden sehen. Bei `offers` kann nur eine der beiden Parteien
--   ueberhaupt etwas sehen — und genau die soll melden koennen.
--
--   Statt zu raten, welche der beiden gemeint war, tragen jetzt beide.
--
-- `capacity_posts` hat `org_id` DIREKT (gemessen: 30 von 33 gefuellt). Die drei
-- ohne kommen ueber die Mitgliedschaft des Anbieters; Anbieter ohne aktive
-- Organisation gibt es keine (gemessen: 0 von 33).
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: DROP CONSTRAINT IF EXISTS vor ADD CONSTRAINT.
-- ROLLBACK: Der CHECK laesst sich auf ('profil','angebot') zuruecksetzen —
--   vorher pruefen, ob Zeilen mit ziel_art='kapazitaet' existieren; diese waeren
--   dann Meldungen, die niemand mehr sieht. Im Zweifel stehen lassen: ein
--   zusaetzlich erlaubter Wert schadet nicht.
-- =============================================================================

SET client_min_messages TO WARNING;

DO $zielart$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN
    RAISE NOTICE '190: profile_abuse_reports fehlt — uebersprungen.'; RETURN;
  END IF;

  ALTER TABLE profile_abuse_reports DROP CONSTRAINT IF EXISTS par_ziel_art_check;
  ALTER TABLE profile_abuse_reports ADD CONSTRAINT par_ziel_art_check
    CHECK (ziel_art IN ('profil', 'angebot', 'kapazitaet'));

  COMMENT ON COLUMN profile_abuse_reports.ziel_art IS
    'profil = die Organisation selbst (reported_org_id), angebot = eine Zeile aus `offers` '
    '(sehen nur die zwei Parteien), kapazitaet = eine Zeile aus `capacity_posts` (sieht jeder '
    'angemeldete Nutzer mit SLA-Zugang — die Flaeche, auf der Fremde die Inhalte von Fremden sehen). '
    'Alle drei laufen in DENSELBEN Posteingang im Staff Control Center; ein vierter Meldeweg neben '
    'reports/profile_abuse_reports/flagged_search_queries waere die naechste halb gebaute Flaeche.';

  RAISE NOTICE '190: ziel_art kennt jetzt auch kapazitaet.';
END $zielart$;

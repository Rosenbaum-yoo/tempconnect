-- 171_bounty_anstupser.sql
-- P9 Spur A / Welle A5 — selbstlaufende Anstupser zum Bounty-Status
--
-- WARUM DIESE MIGRATION
-- Drei Anlaesse sollen den Nutzer erreichen: kurz davor, verdient, entfallen.
-- Dafuer braucht es (1) die neuen Typen im CHECK von `notifications.type` und
-- (2) ein Gedaechtnis, damit derselbe Anstupser nicht mehrfach rausgeht.
--
-- DIE LEHRE AUS MIGRATION 139 — und warum diese hier anders gebaut ist
-- 139 hat die Drift geschlossen, dass vier Typen dispatched wurden, aber im CHECK
-- fehlten: die INSERTs scheiterten STILL. Der Fix dort schrieb die vollstaendige
-- Typliste neu. Genau das ist die naechste Falle: die Liste in 139 ist inzwischen
-- veraltet (spaetere Migrationen haben Typen ergaenzt). Wer sie kopiert, loescht
-- die neueren wieder — ein stiller Rueckschritt, der erst auffaellt, wenn eine
-- Benachrichtigung ausbleibt.
--
-- Deshalb wird hier NICHT abgeschrieben, sondern aus dem Bestand ERWEITERT: die
-- Migration liest die geltende Liste, haengt die drei neuen Werte an und setzt den
-- CHECK neu. Sie kann per Konstruktion nichts verlieren — und prueft am Ende
-- zusaetzlich nach, dass die Liste nicht geschrumpft ist.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS bounty_nudges;
--   -- Typen aus dem CHECK entfernen (nur noetig, wenn keine Zeilen sie nutzen):
--   -- DELETE FROM notifications WHERE type IN ('bounty_near','bounty_earned','bounty_lost');
--   -- danach den CHECK ohne die drei Werte neu setzen.

BEGIN;

/* ── 1. Neue Benachrichtigungstypen, additiv aus dem Bestand ───────────── */

DO $$
DECLARE
  bestand   TEXT[];
  neu       TEXT[] := ARRAY['bounty_near','bounty_earned','bounty_lost'];
  gesamt    TEXT[];
  vorher    INT;
  nachher   INT;
  def       TEXT;
  roh       TEXT;
BEGIN
  /*
   * NACHGEBESSERT (2026-08-10) — der Lese-Teil war nicht mehrfach lauffaehig.
   *
   * Urspruenglich stand hier das Muster '''([a-z_]+)''::text'. Es setzte die
   * Form ARRAY['a'::text, 'b'::text] voraus — genau die, die vorgefunden wurde.
   * Nur schreibt der Block unten die Bedingung ueber format(%L::text[]) neu,
   * und PostgreSQL rendert sie danach als EINE Zeichenkette:
   *     CHECK (type = ANY ('{a,b,c}'::text[]))
   * Darin gibt es keine Anfuehrungszeichen um die einzelnen Werte mehr. Das
   * Muster fand nichts, `bestand` wurde NULL, und die Migration brach mit
   * "nicht gefunden" ab — obwohl die Bedingung da war und alle Typen enthielt.
   *
   * Die Folge war kein Schoenheitsfehler: der Runner bricht die GANZE Kette ab
   * (exit 1), der api-Dienst wartet auf service_completed_successfully und
   * startet gar nicht mehr. Genau so ist diese Umgebung stehengeblieben.
   *
   * Jetzt werden BEIDE Darstellungen gelesen — die Literal-Form zuerst, die
   * ARRAY[]-Form als Rueckfall. Der Block ist damit wirklich mehrfach
   * lauffaehig, wie sein Kommentar es ohnehin behauptet.
   */
  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass
     AND conname  = 'notifications_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check nicht gefunden — Migration abgebrochen, '
                    'lieber laut scheitern als eine Typliste raten';
  END IF;

  -- Form 1: '{a,b,c}'::text[] — so rendert PostgreSQL nach einem format(%L).
  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    -- Form 2: ARRAY['a'::text, 'b'::text] — die urspruengliche Schreibweise.
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION 'Typliste aus notifications_type_check nicht lesbar (%) — abgebrochen, '
                    'lieber laut scheitern als eine Typliste raten', left(def, 120);
  END IF;

  vorher := array_length(bestand, 1);

  -- Nur wirklich fehlende Werte anhaengen (idempotent bei Mehrfachlauf).
  gesamt := bestand;
  FOR i IN 1 .. array_length(neu, 1) LOOP
    IF NOT (neu[i] = ANY (gesamt)) THEN
      gesamt := gesamt || neu[i];
    END IF;
  END LOOP;

  nachher := array_length(gesamt, 1);
  IF nachher < vorher THEN
    RAISE EXCEPTION 'Typliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE 'notifications.type: % Typen (vorher %)', nachher, vorher;
END $$;

/* ── 2. Gedaechtnis der Anstupser ──────────────────────────────────────── */

-- Ohne dieses Gedaechtnis wuerde jeder Lauf dieselbe Nachricht erneut schicken.
-- Der Schluessel ist bewusst (Nutzer, Bounty, Anlass, Woche, Kanal):
--   * die Woche begrenzt die Wiederholung, ohne sie fuer immer zu verbieten —
--     ein "noch 2 Abschluesse" darf naechsten Monat wieder erinnern;
--   * der Kanal ist Teil des Schluessels, weil In-App oefter darf als E-Mail.
CREATE TABLE IF NOT EXISTS bounty_nudges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bounty_key  TEXT NOT NULL,
  anlass      TEXT NOT NULL CHECK (anlass IN ('near','earned','lost')),
  woche       TEXT NOT NULL,
  kanal       TEXT NOT NULL CHECK (kanal IN ('in_app','email')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bounty_nudges_einmal_je_woche UNIQUE (user_id, bounty_key, anlass, woche, kanal)
);

COMMENT ON TABLE bounty_nudges IS
  'Gedaechtnis der Bounty-Anstupser. Der UNIQUE-Schluessel macht den Versand idempotent; die Woche begrenzt Wiederholungen, ohne sie dauerhaft zu verbieten.';
COMMENT ON COLUMN bounty_nudges.woche IS
  'ISO-Woche in der Form JJJJ-Wnn, gebildet in Europe/Berlin — nicht aus rohem UTC.';

-- Fuer das Wochenlimit des Mailkanals: "wie viele Mails hat dieser Nutzer diese
-- Woche schon bekommen?" muss billig zu beantworten sein.
CREATE INDEX IF NOT EXISTS bounty_nudges_user_kanal_woche_idx
  ON bounty_nudges (user_id, kanal, woche);

COMMIT;

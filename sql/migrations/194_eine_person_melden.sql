-- =============================================================================
-- 194_eine_person_melden.sql — die vierte Zielart (Plan I, 10)
-- =============================================================================
-- OWNER-ENTSCHEID (2026-08-24): Personen-Meldungen bleiben im Produkt und
-- wandern in DENSELBEN Posteingang wie Profil-, Angebots- und
-- Kapazitaetsmeldungen.
--
-- VORGESCHICHTE, ehrlich benannt: Am 2026-08-23 fiel die Entscheidung anders —
-- `191_ein_meldeweg_weniger.sql` hat Tabelle, Route und Dienst entfernt, mit
-- der Begruendung, eine ungenutzte Flaeche nicht gegen zwei ungeloeste Fragen
-- einzutauschen. Die Fragen bleiben dieselben; diese Migration beantwortet sie,
-- statt ihnen auszuweichen. Der Weg dorthin ist jetzt SAUBERER als er es am
-- 23.08. gewesen waere: keine Alttabelle mit 7 Spalten ohne Lebenszyklus, kein
-- Verschmelzen zweier fast disjunkter Grund-Vokabulare, kein Datenumzug.
-- `profile_abuse_reports` traegt bereits Status, Zeitstempel, Bearbeiter und
-- seit 189/190 `ziel_art`/`ziel_id`.
--
-- ── BLOCKER 1: `reported_org_id` ist NOT NULL, der Posteingang verbindet mit
--    INNER JOIN (profileVisibilityService.js:424). Gemessen am 2026-08-24:
--    144 von 395 Nutzern haben KEINE aktive Mitgliedschaft. Eine Meldung ueber
--    einen von ihnen waere unsichtbar — schlimmer als keine Meldung, weil der
--    Melder eine Bestaetigung bekaeme.
--
--    GELOEST AN DER WURZEL, nicht per Rueckfall: Eine Meldung ueber eine PERSON
--    hat als Gegenstand die Person, nicht ihre Organisation. Dass
--    `reported_org_id` bisher NOT NULL war, ist ein Erbe aus der Zeit, als
--    diese Tabelle ausschliesslich Org-PROFILE meldete. Seit `ziel_art`/
--    `ziel_id` traegt die Zeile ihren Gegenstand selbst; die Organisation ist
--    ab jetzt KONTEXT ("zu welcher Firma gehoert die Person"), kein Traeger.
--    Die Spalte wird nullable, und der Posteingang stellt auf LEFT JOIN um.
--
--    Ein CHECK haelt fest, dass sie fuer die drei ORGANISATIONS-Zielarten
--    weiterhin Pflicht ist — sonst waere aus der Lockerung ein Loch geworden,
--    durch das eine Profilmeldung ohne Organisation rutscht.
--
-- ── BLOCKER 2: Das Grund-Vokabular kennt weder Betrug noch Belaestigung.
--    `betrug` ist nicht `fake_profile` (eine Firma kann echt sein und trotzdem
--    betruegen) und nicht `misleading_info` (das ist eine Angabe, kein Vorsatz).
--    `belaestigung` ist ein VERHALTEN zwischen Personen, `inappropriate_content`
--    ein INHALT. Beides in `other` einzuschmelzen loescht genau die
--    Unterscheidung, wegen der jemand meldet — und `other` ist der Eimer, den
--    ein Bearbeiter zuletzt oeffnet.
--
--    GELOEST: zwei echte Werte, englisch wie die uebrigen fuenf Langformen.
--
-- RESILIENZ: kein umschliessendes BEGIN; to_regclass vor jedem Schritt.
-- IDEMPOTENZ: DROP CONSTRAINT IF EXISTS; die CHECK-Erweiterung liest den
--   Bestand und haengt nur Fehlendes an (Muster 184, bricht laut ab statt eine
--   Liste zu raten).
-- ROLLBACK:
--   1. UPDATE profile_abuse_reports SET reason='other' WHERE reason IN ('fraud','harassment');
--   2. DELETE FROM profile_abuse_reports WHERE ziel_art='nutzer';   -- sonst schlaegt 3. fehl
--   3. ALTER TABLE profile_abuse_reports ALTER COLUMN reported_org_id SET NOT NULL;
--   4. CHECKs auf die alten Listen zuruecksetzen, par_org_pflicht_check droppen.
--   Der Posteingang muss dabei auf INNER JOIN zurueck, sonst zeigt er eine
--   Spalte an, die es nicht mehr gibt.
-- =============================================================================

SET client_min_messages TO WARNING;

-- ── 1. Die Organisation wird Kontext statt Traeger ──────────────────────────

DO $org_optional$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN
    RAISE NOTICE '194: profile_abuse_reports fehlt — uebersprungen.'; RETURN;
  END IF;

  ALTER TABLE profile_abuse_reports ALTER COLUMN reported_org_id DROP NOT NULL;

  COMMENT ON COLUMN profile_abuse_reports.reported_org_id IS
    'Die Organisation, um die es geht — bei ziel_art profil/angebot/kapazitaet PFLICHT '
    '(par_org_pflicht_check). Bei ziel_art=''nutzer'' optional: Gegenstand der Meldung ist die '
    'PERSON, die Organisation ist nur Kontext, und 144 von 395 Nutzern haben keine (gemessen '
    '2026-08-24). Der Staff-Posteingang verbindet deshalb per LEFT JOIN — ein INNER JOIN machte '
    'genau diese Meldungen unsichtbar.';

  RAISE NOTICE '194: reported_org_id ist jetzt optional.';
END $org_optional$;

-- Die Lockerung darf kein Loch werden: fuer die drei Organisations-Zielarten
-- bleibt die Organisation Pflicht.
DO $org_pflicht$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;

  ALTER TABLE profile_abuse_reports DROP CONSTRAINT IF EXISTS par_org_pflicht_check;
  ALTER TABLE profile_abuse_reports ADD CONSTRAINT par_org_pflicht_check
    CHECK (ziel_art = 'nutzer' OR reported_org_id IS NOT NULL);

  RAISE NOTICE '194: par_org_pflicht_check — nur nutzer darf ohne Organisation.';
END $org_pflicht$;

-- ── 2. Die vierte Zielart ───────────────────────────────────────────────────

DO $zielart$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;

  ALTER TABLE profile_abuse_reports DROP CONSTRAINT IF EXISTS par_ziel_art_check;
  ALTER TABLE profile_abuse_reports ADD CONSTRAINT par_ziel_art_check
    CHECK (ziel_art IN ('profil', 'angebot', 'kapazitaet', 'nutzer'));

  COMMENT ON COLUMN profile_abuse_reports.ziel_art IS
    'profil = die Organisation selbst, angebot = eine Zeile aus `offers` (sehen nur die zwei '
    'Parteien), kapazitaet = eine Zeile aus `capacity_posts` (sieht jeder angemeldete Nutzer), '
    'nutzer = eine PERSON (ziel_id = users.id; reported_org_id ist dann optionaler Kontext). '
    'Alle vier laufen in DENSELBEN Posteingang im Staff Control Center.';

  RAISE NOTICE '194: ziel_art kennt jetzt auch nutzer.';
END $zielart$;

-- ── 3. Zwei Gruende, die es bisher nicht gab (additiv, Muster 184) ──────────

DO $gruende$
DECLARE
  bestand TEXT[];
  neu     TEXT[] := ARRAY['fraud', 'harassment'];
  gesamt  TEXT[];
  vorher  INT;
  nachher INT;
  def     TEXT;
  roh     TEXT;
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;

  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'profile_abuse_reports'::regclass
     AND conname  = 'profile_abuse_reports_reason_check';

  IF def IS NULL THEN
    RAISE EXCEPTION '194: reason-CHECK nicht gefunden — abgebrochen, lieber laut '
                    'scheitern als eine Grundliste raten';
  END IF;

  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION '194: Grundliste nicht lesbar (%) — abgebrochen', left(def, 120);
  END IF;

  vorher := array_length(bestand, 1);
  gesamt := bestand;
  FOR i IN 1 .. array_length(neu, 1) LOOP
    IF NOT (neu[i] = ANY (gesamt)) THEN
      gesamt := gesamt || neu[i];
    END IF;
  END LOOP;
  nachher := array_length(gesamt, 1);

  IF nachher < vorher THEN
    RAISE EXCEPTION '194: Grundliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE profile_abuse_reports DROP CONSTRAINT profile_abuse_reports_reason_check';
  EXECUTE format(
    'ALTER TABLE profile_abuse_reports ADD CONSTRAINT profile_abuse_reports_reason_check CHECK (reason = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE '194: reason kennt jetzt % Gruende (vorher %).', nachher, vorher;
END $gruende$;

-- ── 4. Teilindex fuer den Posteingang ───────────────────────────────────────
-- Der Posteingang liest `status IN ('open','under_review')` und sortiert nach
-- `created_at`. Teilindex, weil erledigte Meldungen die grosse Mehrheit werden.
DO $index$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;
  CREATE INDEX IF NOT EXISTS idx_par_offen
    ON profile_abuse_reports (created_at)
    WHERE status IN ('open', 'under_review');
  RAISE NOTICE '194: Teilindex idx_par_offen angelegt.';
END $index$;

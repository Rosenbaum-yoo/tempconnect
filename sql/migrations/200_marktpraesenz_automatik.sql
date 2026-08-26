-- =============================================================================
-- 200_marktpraesenz_automatik.sql — Verfuegbarkeit IST das Angebot
-- =============================================================================
-- OWNER-ENTSCHEID (J_LIVE_BELEGSCHAFT_MARKTPLATZ.md §0, Freigabe 2026-08-26):
--   Unternehmen sollen "direkt ein Abbild aller verfuegbaren Kraefte aus der
--   Live-Belegschaft der gesamten Plattform" sehen — ohne dass eine
--   Zeitarbeitsfirma dafuer ein Angebot pflegen muss.
--
-- DER BEFUND DAHINTER (Plan J §1, gemessen 2026-08-26): 24 von 33 aktiven
--   Kraeften waren frei — im Marktplatz stand EIN aktives Einzelangebot. Der
--   Marktplatz war nicht leer, weil Kapazitaet fehlte, sondern weil ihn niemand
--   fuetterte. Die Automatik erzeugt die Angebote aus der Live-Belegschaft;
--   diese Migration liefert die zwei Spalten, die sie steuerbar machen.
--
-- SPALTE 1 — worker_profiles.marktpraesenz_deaktiviert:
--   Ein AUSSCHALTER, kein Einschalter (Plan J §3.2): waere Praesenz opt-in,
--   haette der Marktplatz wieder das Pflegeproblem, das er gerade verliert.
--   Default FALSE = jede aktive Kraft ist am Markt, bis ihre Zeitarbeitsfirma
--   es fuer sie abstellt.
--
-- SPALTE 2 — capacity_posts.quelle:
--   Die Automatik darf beim Abschalten NUR zuruecknehmen, was sie selbst
--   erzeugt hat — ein von Hand gepflegtes Angebot der Agentur ist deren
--   Entscheidung und bleibt stehen. Ohne Herkunftsspalte waere das nicht
--   unterscheidbar. 'manuell' ist der Default und beschreibt den gesamten
--   Bestand korrekt: alles bisher Existierende hat ein Mensch angelegt.
--
-- WAECHTER: capacity_posts bekommt eine neue Spalte — der Marktplatz-Feld-
--   Waechter (marktplatzFeldWaechter.test.js) verlangt ihre Einordnung in
--   OEFFENTLICH oder NUR_INTERN. `quelle` ist OEFFENTLICH: dass ein Angebot
--   automatisch aus der Live-Belegschaft stammt, ist fuer den Betrachter eine
--   ehrliche und nuetzliche Auskunft, keine Personenkennung.
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS; der CHECK haengt an der neuen Spalte
--   und entsteht mit ihr.
-- ROLLBACK:
--   ALTER TABLE worker_profiles DROP COLUMN marktpraesenz_deaktiviert;
--   ALTER TABLE capacity_posts  DROP COLUMN quelle;
--   (Die Automatik selbst faellt damit auf "tut nichts" zurueck — sie prueft
--   ihre Spalten ueber den Schema-Waechter, nicht zur Laufzeit.)
-- =============================================================================

SET client_min_messages TO WARNING;

DO $$
BEGIN
  IF to_regclass('public.worker_profiles') IS NOT NULL THEN
    ALTER TABLE worker_profiles
      ADD COLUMN IF NOT EXISTS marktpraesenz_deaktiviert BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN worker_profiles.marktpraesenz_deaktiviert IS
      'Ausschalter der automatischen Marktpraesenz (Welle J2b): TRUE = diese Kraft erscheint nicht als automatisches Einzelangebot im Marktplatz. Default FALSE — Praesenz ist der Grundzustand, sonst kehrt das Pflegeproblem zurueck (Plan J §3.2).';
  END IF;

  IF to_regclass('public.capacity_posts') IS NOT NULL THEN
    ALTER TABLE capacity_posts
      ADD COLUMN IF NOT EXISTS quelle TEXT NOT NULL DEFAULT 'manuell';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.capacity_posts'::regclass
         AND conname = 'capacity_posts_quelle_check'
    ) THEN
      ALTER TABLE capacity_posts
        ADD CONSTRAINT capacity_posts_quelle_check
        CHECK (quelle IN ('manuell', 'live_belegschaft'));
    END IF;
    COMMENT ON COLUMN capacity_posts.quelle IS
      'Herkunft des Angebots (Welle J2b): manuell = von einem Menschen angelegt (gesamter Altbestand), live_belegschaft = automatisch aus der freien Kapazitaet erzeugt. Die Automatik nimmt beim Abschalten NUR live_belegschaft-Zeilen zurueck.';
  END IF;
END $$;

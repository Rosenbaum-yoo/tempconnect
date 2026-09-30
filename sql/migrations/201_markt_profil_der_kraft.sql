-- =============================================================================
-- 201_markt_profil_der_kraft.sql — der Status-Vermerk des Zeitarbeitschefs
-- =============================================================================
-- OWNER-ENTSCHEID (Plan J Welle J9, Freigabe 2026-08-26/27): Der Chef vermerkt
--   je Kraft, was ein Unternehmen bei der Skill-Suche wissen muss — damit alle
--   drei Seiten planen koennen (Monatsplanung der Agentur, Einsatzplanung des
--   Unternehmens, Selbstauskunft der Kraft).
--
-- DIE TRAGENDE TRENNUNG (Plan J §J9, rechtlich zwingend) — drei Spalten fuer
-- drei Klassen von Auskunft:
--
--   markt_merkmale   FESTER KATALOG positiver, sachlicher Merkmale (kein
--                    Freitext!). Faehrt in die automatischen Angebote und ist
--                    filterbar. Der Katalog steht ALS CHECK IN DER DATENBANK:
--                    ein siebtes Merkmal erreicht den Markt erst, wenn es hier
--                    bewusst ergaenzt wird — dieselbe Ratsche wie beim
--                    Marktplatz-Feld-Waechter.
--   einsetzbar_bis   Der Horizont ("laengerfristig einsetzbar"): NULL =
--                    unbefristet. Der Sweep spiegelt ihn in availability_to
--                    der Auto-Angebote — EINE Wahrheit, die vorhandene
--                    Ablauf-/Buchungslogik rechnet einfach mit.
--   dispo_notiz      Die INTERNE Einschaetzung ("seit einer Woche abwesend
--                    ohne Rueckmeldung"). Geht NIE an fremde Unternehmen —
--                    ein Beschaeftigten-Urteil an Dritte waere ein DSGVO-/
--                    AGG-Risiko (Auskunftsrecht Art. 15). Ihre Markt-Wirkung
--                    ist der Markt-aus-Schalter (Mig 200), nicht ein Text.
--                    Der Feld-Waechter erzwingt, dass sie den Feed nie
--                    erreicht (marktplatzFeldWaechter, Quelltext-Schnitt).
--
-- WARUM DER KATALOG SO HEISST WIE ER HEISST: Sechs Merkmale, vom Owner
--   freigegeben ("zuverlaessig, sehr fleissig, sauber, laengerfristig
--   einsetzbar" + die zwei planungsrelevanten Ergaenzungen). Schluessel sind
--   sprachneutral (kebab/snake) — die Anzeige uebersetzt das Frontend (DE/EN).
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS; der CHECK wird nur angelegt, wenn er
--   fehlt (pg_constraint-Pruefung, Muster 200).
-- ROLLBACK:
--   ALTER TABLE worker_profiles DROP COLUMN markt_merkmale;
--   ALTER TABLE worker_profiles DROP COLUMN einsetzbar_bis;
--   ALTER TABLE worker_profiles DROP COLUMN dispo_notiz;
--   (Feed-Join und Sweep-Spiegel fallen damit auf "keine Merkmale, kein
--   Horizont" zurueck — der Schema-Waechter macht die Diskrepanz rot.)
-- =============================================================================

SET client_min_messages TO WARNING;

DO $$
BEGIN
  IF to_regclass('public.worker_profiles') IS NOT NULL THEN
    ALTER TABLE worker_profiles
      ADD COLUMN IF NOT EXISTS markt_merkmale TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE worker_profiles
      ADD COLUMN IF NOT EXISTS einsetzbar_bis DATE;
    ALTER TABLE worker_profiles
      ADD COLUMN IF NOT EXISTS dispo_notiz TEXT;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.worker_profiles'::regclass
         AND conname = 'worker_profiles_markt_merkmale_check'
    ) THEN
      ALTER TABLE worker_profiles
        ADD CONSTRAINT worker_profiles_markt_merkmale_check
        CHECK (markt_merkmale <@ ARRAY[
          'zuverlaessig',
          'sehr_fleissig',
          'arbeitet_sauber',
          'langfristig_einsetzbar',
          'kurzfristig_startklar',
          'schicht_flexibel'
        ]::text[]);
    END IF;

    COMMENT ON COLUMN worker_profiles.markt_merkmale IS
      'Positive Merkmale aus dem festen Katalog (Welle J9, Owner-Freigabe 2026-08-26). Kein Freitext: der CHECK ist die Ratsche — ein neues Merkmal erreicht den Markt erst nach bewusster Erweiterung hier UND im Katalog-Modul (api/services/workerMerkmalKatalog.js). Faehrt per Lese-Join in die automatischen Angebote.';
    COMMENT ON COLUMN worker_profiles.einsetzbar_bis IS
      'Planungshorizont des Chefs (Welle J9): bis wann ist die Kraft einsetzbar, NULL = unbefristet. Der Marktpraesenz-Sweep spiegelt den Wert in availability_to der eigenen Auto-Angebote (quelle=live_belegschaft) — eine Wahrheit fuer Ablauf, Anzeige und Buchungspruefung.';
    COMMENT ON COLUMN worker_profiles.dispo_notiz IS
      'INTERNE Dispositions-Notiz der Agentur (Welle J9). Verlaesst die Agenturflaeche NIE — kein Feed, kein Angebot, keine Kundensicht (Beschaeftigtendatenschutz; erzwungen vom Marktplatz-Feld-Waechter). Markt-Wirkung einer negativen Einschaetzung ist der Markt-aus-Schalter, nicht dieser Text.';
  END IF;
END $$;

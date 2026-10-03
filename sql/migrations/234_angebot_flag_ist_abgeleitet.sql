-- ============================================================================
-- 234 — capacity_posts.is_active ist ein ABGELEITETER SPIEGEL, und zwei Zeilen
--       haben das nicht eingehalten
-- ============================================================================
--
-- FEHLERKLASSE: zwei Spalten beschreiben denselben Sachverhalt, keine von beiden
-- ist als die abhaengige gekennzeichnet, und die Leseseite hat sich die
-- bequemere ausgesucht. Das faellt nicht auf, solange sie uebereinstimmen.
--
-- GEMESSEN an der Entwicklungsdatenbank am 2026-10-03, 52 Angebote:
--
--     status = 'active' UND is_active = TRUE    10
--     status = 'active' ABER is_active = FALSE   2   <-- der Widerspruch
--     is_active = TRUE  ABER status <> 'active'  0   <-- nie, in keiner Zeile
--
-- Die dritte Zeile ist der Beweis: das Flag traegt keine Information, die
-- status nicht schon traegt. Und die Festlegung stand laengst im Code —
-- capacityWorkflow.isEffectivelyActive sagt woertlich "for backward
-- compatibility. Active capacity posts = status 'active'."
--
-- WAS DER CODE-TEIL DIESER WELLE SCHON ERLEDIGT HAT: alle Filter lesen jetzt
-- status, ueber ein gemeinsames Modul (services/angebotAktivSql.js), bewacht
-- von api/test/eineWahrheitAktiv.test.js. Damit ist der SCHADEN behoben: die
-- zwei Angebote sind wieder matchbar, die Preisfindung rechnet sie mit, der
-- Disponent sieht die sechs reservierten Angebote wieder.
--
-- WAS DIESE MIGRATION NOCH ZU TUN HAT: die Spalte wird ueber die oeffentliche
-- Spaltenliste (capacityPostOeffentlicheSpalten) weiter AUSGELIEFERT. Solange
-- die zwei Zeilen falsch darin stehen, meldet die Schnittstelle fuer ein
-- aktives Angebot is_active = false. Das wird hier richtiggestellt, mit genau
-- der Ableitung, die der Code nennt.
--
-- ----------------------------------------------------------------------------
-- WAS HIER ABSICHTLICH NICHT PASSIERT, UND WARUM — GEMESSEN
-- ----------------------------------------------------------------------------
--
-- 1) KEIN CHECK auf das Paar (is_active = (status = 'active')).
--    Verlockend, weil es die Abweichung unmoeglich machen wuerde. Gemessen
--    schreiben aber mindestens VIER Stellen des Reservierungs-Sweeps
--    (workerOfferReservationService: RESERVE/RELEASE, je personengebunden und
--    Sammelangebot) nur status und lassen das Flag unberuehrt; weitere
--    allgemeine Schreibpfade kommen hinzu. Ein CHECK braechte diese Schreibe
--    sofort — der Sweep koennte ein Angebot nicht mehr pausieren, und eine
--    gebundene Kraft bliebe im Markt buchbar. Das ist genau der Zustand, den
--    der Owner Betrug nennt. Ein Riegel, der eine Doppelbuchung erzwingt, um
--    ein Anzeigefeld zu schuetzen, ist der schlechtere Tausch.
--
-- 2) KEINE generierte Spalte (GENERATED ALWAYS AS). In eine generierte Spalte
--    kann nicht geschrieben werden; sechs vorhandene Schreibstellen setzen das
--    Flag ausdruecklich mit und wuerden werfen.
--
-- 3) KEIN DROP COLUMN. Die Spalte steht in der oeffentlichen Spaltenliste und
--    in zwei Projektionen (searchService, routes/profileVisibility) — sie zu
--    entfernen aendert die ANTWORT der Schnittstelle. Das ist eine eigene
--    Entscheidung mit eigener Abnahme, nicht ein Nebeneffekt dieser Welle.
--    Festgenagelt ist sie in api/test/eineWahrheitAktiv.test.js, damit ihre
--    Entfernung eine absichtliche Handlung bleibt.
--
-- 4) updated_at wird NICHT angefasst. Es waere der naheliegende Reflex und ein
--    Fehler: isStale faellt auf updated_at zurueck, wenn last_confirmed_at
--    leer ist. Ein NOW() hier liesse jeden ueberfaelligen der beiden Eintraege
--    frisch aussehen — die Erinnerung, die fallen soll, fiele aus. Die
--    Korrektur eines abgeleiteten Feldes ist keine inhaltliche Aenderung am
--    Angebot und darf dessen Zeitstempel nicht verschieben.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK-STRATEGIE
-- ----------------------------------------------------------------------------
-- Der Datenteil braucht keinen: is_active ist nach dieser Migration eine
-- Funktion von status, und dieselbe Anweisung erneut auszufuehren aendert
-- nichts (idempotent). Wer den Zustand VON VORHER wiederherstellen will,
-- braucht die beiden Kennungen — sie stehen in der WARNUNG, die dieser Lauf
-- ausgibt. Den Spaltenkommentar nimmt
--     COMMENT ON COLUMN capacity_posts.is_active IS NULL;
-- zurueck.
--
-- FRISCHINSTALL: auf einer leeren Tabelle findet die Reparatur null Zeilen.
-- Das ist ERFUELLT, nicht verletzt — die Notbremse unten prueft, dass danach
-- keine widerspruechliche Zeile MEHR da ist, nicht dass vorher eine war.
-- ============================================================================

BEGIN;

DO $flag_ist_abgeleitet$
DECLARE
  vorher_abweichend  integer;
  danach_abweichend  integer;
  betroffene         text;
BEGIN
  SELECT count(*) INTO vorher_abweichend
    FROM capacity_posts
   WHERE is_active IS DISTINCT FROM (status = 'active');

  IF vorher_abweichend = 0 THEN
    -- Auch die ehrliche Meldung ist eine WARNUNG und keine NOTICE: unter
    -- client_min_messages = WARNING verschluckt der Laeufer sonst genau die
    -- Zeile, die sagt, dass nichts zu tun war.
    RAISE WARNING '234: keine abweichende Zeile — Flag und status stimmen bereits ueberein (auf einer leeren Tabelle der Normalfall).';
  ELSE
    SELECT string_agg(left(id::text, 8) || '=' || status || '/' || is_active, ', ' ORDER BY id)
      INTO betroffene
      FROM capacity_posts
     WHERE is_active IS DISTINCT FROM (status = 'active');

    -- Die Ableitung ist WOERTLICH die aus capacityWorkflow.isEffectivelyActive.
    -- Steht sie hier anders, ist der Widerspruch nur umgezogen.
    UPDATE capacity_posts
       SET is_active = (status = 'active')
     WHERE is_active IS DISTINCT FROM (status = 'active');

    RAISE WARNING '234: % Zeile(n) richtiggestellt. Zustand VORHER (fuer einen Rueckbau): %',
      vorher_abweichend, betroffene;
  END IF;

  SELECT count(*) INTO danach_abweichend
    FROM capacity_posts
   WHERE is_active IS DISTINCT FROM (status = 'active');

  IF danach_abweichend <> 0 THEN
    RAISE EXCEPTION '234: nach der Reparatur weichen noch % Zeile(n) ab — die Ableitung greift nicht, Abbruch.',
      danach_abweichend;
  END IF;
END
$flag_ist_abgeleitet$;

-- Der Hinweis gehoert ins Schema, nicht nur in eine Migration, die niemand
-- mehr liest: wer die Spalte im Schema sieht, soll sofort wissen, dass sie
-- abgeleitet ist und nicht gefiltert werden darf.
COMMENT ON COLUMN capacity_posts.is_active IS
  'ABGELEITET aus status (= (status = ''active'')), nur fuer Abwaertskompatibilitaet. NICHT danach filtern — dafuer services/angebotAktivSql.js benutzen. Bewacht von api/test/eineWahrheitAktiv.test.js. Mig 234.';

COMMIT;

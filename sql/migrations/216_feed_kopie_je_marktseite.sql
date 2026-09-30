-- Migration 216: Die Feed-Kopie bekommt eine Marktseite
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 204 legte EINE Zeile an (`CHECK (id = 1)`) mit der Begruendung:
-- "genau das, was ein beliebiger Besucher sehen wuerde".
--
-- Der Marktplatz hat aber keinen beliebigen Besucher. Er hat ZWEI SEITEN, und
-- `browseFeed` entscheidet anhand von `viewer_role`, welche davon ueberhaupt
-- in der Liste steht (capacityExchangeService.js, "GEGENSEITENLOGIK"):
--
--   Unternehmen      sehen ausschliesslich `supply`  (Angebote der Agenturen)
--   Zeitarbeitsfirma sieht  ausschliesslich `demand` (Bedarfe der Unternehmen)
--
-- `istKopierwuerdig()` prueft jedoch nur die 15 Query-Filter aus der URL. Am
-- 2026-09-06 gemessen: ALLE drei Betrachter-Situationen gelten als
-- kopierwuerdig — auch die Agentur-Anfrage und auch die Unternehmens-Anfrage,
-- die zusaetzlich nach der Sperrliste filtert.
--
-- Zwei Fehler folgen daraus, beide live:
--
--   1. FALSCHE MARKTSEITE. Die eine Zeile wird von dem geschrieben, dessen
--      unfilterte Seite-1-Anfrage zuletzt lief. War das eine Agentur, enthaelt
--      die Kopie BEDARFE — und ein Unternehmen bekommt im Fehlerfall die
--      Einkaufsliste anderer Unternehmen serviert statt der Angebote.
--
--   2. FREMDE SPERREN. Ein Unternehmensabruf ist nie neutral: sobald die Org
--      jemanden gesperrt hat, ist seine Liste beschnitten. Diese beschnittene
--      Liste wurde zur Kopie fuer alle — ein Kunde trug damit sein Urteil ueber
--      einen Menschen in die Ansicht aller anderen. Genau das schliesst der
--      Plan N ausdruecklich aus ("der Filter gehoert hinter die Kopie").
--
-- Owner-Entscheid 2026-09-06 (Welle N4.4): eine Kopie JE MARKTSEITE. Damit
-- behalten beide Seiten den K4-Schutz, und die Vermischung ist strukturell
-- unmoeglich statt nur unwahrscheinlich.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM 1 UND 2 UND NICHT EIN TEXT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Die Spalte heisst `id` und ist SMALLINT; sie zum Text zu machen waere ein
-- Typwechsel am Primaerschluessel fuer nichts. Die Zuordnung steht dafuer an
-- genau einer Stelle im Code (`feedKopieService.SEITEN`) und hier als
-- Spaltenkommentar — nicht als Zahl, die man sich merken muss.
--
--   1 = supply  (was ein UNTERNEHMEN sieht: Angebote der Zeitarbeitsfirmen)
--   2 = demand  (was eine ZEITARBEITSFIRMA sieht: Bedarfe der Unternehmen)
--
-- Die 1 behaelt ihre bisherige Bedeutung nicht zufaellig: die vorhandene Zeile
-- stammt aus der Zeit ohne Marktseite und kann alles Moegliche enthalten.
-- Deshalb wird sie GELEERT statt uminterpretiert — siehe unten.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--
--   DELETE FROM marktplatz_feed_kopie WHERE id <> 1;
--   ALTER TABLE marktplatz_feed_kopie DROP CONSTRAINT marktplatz_feed_kopie_id_check;
--   ALTER TABLE marktplatz_feed_kopie ADD CONSTRAINT marktplatz_feed_kopie_id_check CHECK (id = 1);
--
-- Gefahrlos: die Tabelle haelt ausschliesslich eine WIEDERHERSTELLBARE Kopie
-- des Feeds, keine Primaerdaten. Der Code muss nicht gleichzeitig zurueck —
-- `feedKopieService` wirft in keinem Pfad; ein fehlgeschlagener Schreibversuch
-- auf id = 2 wird dort protokolliert, nicht geworfen. Diese Reihenfolge ist
-- Absicht: ein Rollback, der zwei Dinge gleichzeitig verlangt, wird im
-- Ernstfall halb ausgefuehrt.

SET client_min_messages TO WARNING;

BEGIN;

-- Der alte CHECK erlaubt nur die 1. Der Name folgt der Postgres-Konvention
-- fuer inline deklarierte Spalten-Constraints (<tabelle>_<spalte>_check);
-- IF EXISTS, damit die Migration auch auf einer Datenbank laeuft, in der er
-- anders heisst oder bereits entfernt wurde.
ALTER TABLE marktplatz_feed_kopie
  DROP CONSTRAINT IF EXISTS marktplatz_feed_kopie_id_check;

ALTER TABLE marktplatz_feed_kopie
  ADD CONSTRAINT marktplatz_feed_kopie_id_check CHECK (id IN (1, 2));

-- Die bestehende Zeile stammt aus der Zeit OHNE Marktseite: niemand weiss, ob
-- sie Angebote oder Bedarfe traegt, und im schlechteren Fall traegt sie die
-- Sperrliste eines einzelnen Kunden. Sie zu behalten hiesse, genau den Fehler
-- weiterzureichen, den diese Migration beendet.
--
-- Geloescht statt umgeschrieben: die naechste erfolgreiche Feed-Anfrage je
-- Seite legt binnen Sekunden eine neue an. Bis dahin antwortet der Endpunkt im
-- Fehlerfall ehrlich mit 500 — was er ohne die Kopie ohnehin taete.
DELETE FROM marktplatz_feed_kopie;

COMMENT ON COLUMN marktplatz_feed_kopie.id IS
  'Marktseite der Kopie: 1 = supply (was ein Unternehmen sieht), '
  '2 = demand (was eine Zeitarbeitsfirma sieht). Die Seiten sind getrennt, weil '
  'browseFeed die Liste anhand von viewer_role zusammenstellt — eine gemeinsame '
  'Zeile lieferte im Fehlerfall die falsche Marktseite. Welle N4.4, 2026-09-06.';

COMMENT ON TABLE marktplatz_feed_kopie IS
  'Letzte erfolgreich ausgelieferte Feed-Seite JE MARKTSEITE (ungefiltert, Seite 1, '
  'betrachter-neutral). Wird NUR im Fehlerfall ausgeliefert, nie im Normalbetrieb — '
  'sonst gaebe es eine zweite Wahrheit ueber den Marktplatz. Owner-Entscheid '
  '2026-08-27 (Welle K4), je Marktseite getrennt 2026-09-06 (Welle N4.4).';

COMMIT;

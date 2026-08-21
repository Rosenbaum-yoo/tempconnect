-- 186_guthaben_nur_gegen_zahlung.sql
-- Befund P1-22 — die Gutschrift bekommt einen Riegel in der Datenbank
--
-- WARUM DIESE MIGRATION
-- `POST /credits/purchase` schrieb ein BEPREISTES Guthabenpaket gut, ohne jeden
-- Bezahlschritt (9,99 / 39,99 / 129,99 EUR stehen in `credit_packages`). Die
-- Owner-Entscheidung vom 2026-08-21 lautet: Stripe. Ab jetzt erzeugt die Route
-- eine Stripe-Sitzung, und gutgeschrieben wird erst im signaturgepruefte
-- Webhook — derselbe Weg, den die Abos seit jeher gehen.
--
-- WARUM DAS NICHT IM CODE GENUEGT
-- Stripe stellt Webhooks WIEDERHOLT zu; das ist kein Fehler, sondern die
-- Zusicherung des Anbieters ("at least once"). Eine Idempotenz, die nur aus
-- "erst SELECT, dann INSERT" besteht, haelt zwei gleichzeitige Zustellungen
-- nicht auf — beide sehen nichts und schreiben beide. Bei Guthaben heisst das:
-- doppelt bezahlt bekommen, einmal bezahlt.
--
-- Der Riegel gehoert deshalb dorthin, wo Gleichzeitigkeit entschieden wird: in
-- die Datenbank. Ein eindeutiger Index ueber die Kauf-Referenz laesst die zweite
-- Zustellung auflaufen, egal wie viele Instanzen gleichzeitig arbeiten.
--
-- WARUM PARTIELL
-- `reference_id` traegt bei anderen Quellen (`bounty`, `referral`, `admin`)
-- ganz andere Bedeutungen und darf sich dort wiederholen. Nur fuer `purchase`
-- ist sie die Kennung EINES Bezahlvorgangs und damit eindeutig.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS credit_transactions_kauf_referenz_uniq;
-- Gefahrlos: ohne den Index gilt wieder die alte, schwaechere Zusicherung.
-- Wer ihn faellen laesst, muss die Idempotenz im Code selbst sicherstellen —
-- und das geht bei gleichzeitigen Zustellungen nicht zuverlaessig.

BEGIN;

-- Sicherheitsnetz: gaebe es bereits doppelte Kauf-Referenzen, koennte der Index
-- nicht angelegt werden. Dann soll die Migration sagen, WAS im Weg steht.
DO $$
DECLARE
  doppelte INT;
BEGIN
  SELECT COUNT(*) INTO doppelte FROM (
    SELECT reference_id
      FROM credit_transactions
     WHERE source = 'purchase' AND reference_id IS NOT NULL
     GROUP BY reference_id
    HAVING COUNT(*) > 1
  ) x;
  IF doppelte > 0 THEN
    RAISE EXCEPTION
      'Migration 186: % Kauf-Referenz(en) kommen mehrfach vor. Das sind bereits '
      'doppelt gutgeschriebene Kaeufe — erst klaeren und bereinigen, dann diese '
      'Migration erneut fahren.', doppelte;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_kauf_referenz_uniq
  ON credit_transactions (reference_id)
  WHERE source = 'purchase' AND reference_id IS NOT NULL;

COMMIT;

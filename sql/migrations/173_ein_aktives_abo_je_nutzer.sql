-- 173_ein_aktives_abo_je_nutzer.sql
-- P9 Spur C / Welle C2 — nach der Zahlung genau EIN gueltiger Zustand
--
-- WARUM DIESE MIGRATION
-- `activatePlan` hat bei jeder Planaenderung eine neue Zeile EINGEFUEGT, ohne die
-- alte zu schliessen. Im Bestand: 341 Abo-Zeilen fuer 312 Nutzer, alle auf
-- 'active'. Dasselbe Muster im Pilotpfad.
--
-- Sichtbar war der Fehler nirgends: die Plan-Aufloesung nimmt ueberall die
-- NEUESTE Zeile, der Kunde sah also immer den richtigen Plan. Die monatliche
-- Folgerechnung waehlt aber nach `status = 'active'` — sie haette 290 Zeilen bei
-- 263 Nutzern aufgegriffen und 27 Kunden ZWEI Rechnungen fuer denselben Monat
-- geschickt. Ein Defekt, den erst der erste echte Abrechnungslauf gezeigt haette,
-- und dann beim Kunden.
--
-- ZWEI SCHRITTE
--   1. Bestand bereinigen: je Nutzer bleibt die neueste Zeile aktiv, alle
--      aelteren werden auf 'canceled' gesetzt. Nichts wird geloescht — die
--      Historie bleibt lesbar, `cancel_source` sagt warum.
--   2. Die Invariante strukturell sichern: ein partieller eindeutiger Index
--      erlaubt hoechstens EIN aktives Abo je Nutzer. Damit kann kein kuenftiger
--      Schreibpfad die Dublette wieder einfuehren — auch keiner, den niemand mehr
--      auf dem Schirm hat.
--
-- WARUM DAS SICHER IST
-- `subscriptions` hat keine Org-Dimension (kein org_id), und kein einziger Nutzer
-- besitzt heute mehr als eine Organisation (geprueft). Ein Abo je Nutzer ist
-- damit die fachlich richtige Regel. Sollte spaeter ein Nutzer mehrere Orgs mit
-- eigenen Plaenen haben, braucht die Tabelle ohnehin eine org_id — dann wird
-- dieser Index mitgedacht.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS subscriptions_ein_aktives_je_nutzer_idx;
--   -- Die Bereinigung ist bewusst NICHT umkehrbar: sie stellt einen korrekten
--   -- Zustand her. Wer sie ruecknehmen will, braucht ein Backup.

BEGIN;

-- 1. Bestand bereinigen — je Nutzer gewinnt die neueste Zeile.
--    Dieselbe Regel, nach der die Anwendung den Plan ohnehin schon aufloest
--    (ORDER BY created_at DESC LIMIT 1) — der Kunde behaelt also genau den Plan,
--    den er bisher gesehen hat.
UPDATE subscriptions s
   SET status = 'canceled',
       canceled_at = COALESCE(s.canceled_at, NOW()),
       cancel_source = COALESCE(s.cancel_source, 'plan_replaced'),
       updated_at = NOW()
 WHERE s.status IN ('active', 'past_due', 'canceling')
   AND s.id <> (
     SELECT s2.id FROM subscriptions s2
      WHERE s2.user_id = s.user_id
        AND s2.status IN ('active', 'past_due', 'canceling')
      ORDER BY s2.created_at DESC, s2.id DESC
      LIMIT 1
   );

-- 2. Invariante sichern.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_ein_aktives_je_nutzer_idx
  ON subscriptions (user_id)
  WHERE status = 'active';

COMMENT ON INDEX subscriptions_ein_aktives_je_nutzer_idx IS
  'Hoechstens ein aktives Abo je Nutzer. Verhindert doppelte Folgerechnungen: der Rechnungslauf waehlt nach status = active, und zwei Zeilen bedeuteten zwei Rechnungen fuer denselben Monat.';

COMMIT;

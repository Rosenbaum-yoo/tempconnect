-- Migration 209: Die Werbepraemie erreicht die Rechnung (Welle K2.4-K2.7)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gemessen am 2026-08-30: die Werbe-Mechanik ist verdrahtet — nur nicht ans
-- Geld. `qualifyReferralReward` wird aus `routes/payment.js:683` gerufen, sobald
-- der geworbene Kunde zahlt, und schreibt eine `referral_rewards`-Zeile. Aber
-- KEINE EINZIGE DATEI DES GELDPFADS (invoiceService, recurringBillingService,
-- paymentService, planCatalog) erwaehnt `referral` ueberhaupt.
--
-- Die Praemie wurde gebucht und nie angewandt. Dieselbe Fehlerklasse wie der
-- Treue-Rabatt vor Migration 170: ein Preisversprechen ohne Wirkung.
--
-- Migration 208 hat die fehlende Haelfte am Buch angelegt (`faellig_ab`,
-- `angewandt_am`, `rechnung_id`). Diese Migration legt die KONFIGURATION an,
-- aus der der Abrechnungslauf den Satz nimmt.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM EIN KATALOGEINTRAG UND KEINE KONSTANTE IM CODE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `const WERBE_CASHBACK_PCT = 100` waere kuerzer. Der Katalogeintrag kann drei
-- Dinge, die eine Konstante nicht kann:
--
--   1. NOT-AUS. `is_active = FALSE` stoppt das Programm sofort, ohne Deployment.
--      Genau der Hebel, den das Staff Control Center fuer jedes andere Bounty
--      schon hat.
--   2. SATZ AENDERBAR. Aus 100 % kann 90 % werden, ohne Codeaenderung.
--   3. `deckel_frei` STEHT AN DER SACHE, nicht im Code. Ein
--      `if (key === 'werbe_cashback')` waere der Sonderfall, den der naechste
--      Anlass kopiert und der uebernaechste vergisst.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM DER EINTRAG KEINE `user_bounties`-ZEILEN ERZEUGT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Das waere der naheliegende Weg gewesen: Praemie verdient → Bounty aktiv →
-- `getUserDiscount` summiert es mit. Er hat einen Fehler, der Geld kostet.
--
-- `user_bounties` wird von `evaluateBounties` gepflegt, und das laeuft, wenn der
-- KUNDE SEINE BOUNTY-SEITE BESUCHT. Zwischen dem Faelligwerden einer Praemie und
-- dem naechsten Besuch koennen Wochen liegen — der Abrechnungslauf saehe einen
-- veralteten Stand. Fuer eine Anzeige ist das hinnehmbar (die Stufen heilen im
-- Bestand genauso), fuer eine Rechnung nicht.
--
-- Deshalb ist `referral_rewards` die Wahrheit fuer das Geld, und der
-- Abrechnungslauf fragt sie DIREKT — frisch, im selben Moment, in dem die
-- Rechnung entsteht. Genau wie der Eingriff aus Welle K1.4: einmalig, vor der
-- Transaktion gelesen, darin verbraucht.
--
-- `threshold_type = 'referral_cashback'` sorgt dafuer, dass die Kachel auf der
-- Bounty-Seite des Kunden erklaert, wie man sie verdient, statt als
-- "gesperrt, 0 %" ohne ein Wort dazustehen.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIE OWNER-ENTSCHEIDE (2026-08-27), die hier sichtbar werden
-- ═══════════════════════════════════════════════════════════════════════════
--   * 100 % — die naechste Rechnung ist frei, keine Rueckerstattung
--   * der Geworbene muss 30 Tage Bestand haben  (Karenz, Code)
--   * hoechstens 3 Monate insgesamt             (Deckel, Code)
--   * der Geworbene bekommt nichts extra        (kein zweiter Eintrag)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DELETE FROM user_bounties WHERE bounty_id IN (SELECT id FROM bounties WHERE key = 'werbe_cashback');
--   DELETE FROM bounties WHERE key = 'werbe_cashback';

SET client_min_messages TO WARNING;

BEGIN;

-- `category` muss einer der vier erlaubten Werte sein (bounties_category_check).
-- 'loyalty' passt: es ist eine Praemie fuer Bindung, keine Leistungsmessung.
--
-- `is_recurring = FALSE`: die Praemie wird nicht dauerhaft gehalten, sondern je
-- geworbenem Kunden einmal verdient und von einer Rechnung verbraucht.
INSERT INTO bounties (
  key, name_de, description_de, category, icon,
  discount_pct, deckel_frei, threshold_type, threshold_value,
  is_recurring, sort_order, is_active
)
VALUES (
  'werbe_cashback',
  'Werbe-Praemie',
  'Wer ein Unternehmen wirbt, das 30 Tage bleibt, bekommt die naechste Monatsrechnung geschenkt — bis zu dreimal. Die Praemie steht neben der Obergrenze deiner Stufe, wird also nicht gekuerzt.',
  'loyalty',
  '🎁',
  100,          -- Owner-Entscheid: die naechste Rechnung ist FREI
  TRUE,         -- steht NEBEN der Stufen-Obergrenze, nicht darunter
  'referral_cashback',
  '{"karenz_tage": 30, "max_praemien": 3}'::jsonb,
  FALSE,
  95,           -- weit hinten: es ist keine Treuestufe, sondern eine Praemie
  TRUE
)
ON CONFLICT (key) DO UPDATE
  SET name_de         = EXCLUDED.name_de,
      description_de  = EXCLUDED.description_de,
      deckel_frei     = EXCLUDED.deckel_frei,
      threshold_type  = EXCLUDED.threshold_type,
      threshold_value = EXCLUDED.threshold_value,
      updated_at      = NOW();
-- Bewusst OHNE `discount_pct` und `is_active` im UPDATE: wer den Satz im Staff
-- Control Center gesenkt oder das Programm abgeschaltet hat, will nicht, dass
-- ein erneuter Migrationslauf das zuruecksetzt.

COMMIT;

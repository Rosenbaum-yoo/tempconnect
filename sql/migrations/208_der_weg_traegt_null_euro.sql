-- Migration 208: Der Abrechnungsweg traegt eine 0-EUR-Rechnung (Gate K2.2)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM — DAS ERGEBNIS DES GATES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Welle K2 will einen Werbe-Cashback: 100 % Rabatt, die naechste Rechnung ist
-- frei. Der Arbeitsplan macht daraus ausdruecklich ein GATE, keine Phase —
-- "vertraegt der Abrechnungsweg das ueberhaupt?" musste VOR dem Bau feststehen.
--
-- Am 2026-08-30 gemessen, nicht hergeleitet. Ergebnis:
--
--   RECHENKETTE          ✓  berechneRabatt(netto, 100) → Abzug = netto, Rest 0.
--                           createInvoice schreibt amount 0, Steuer 0, gesamt 0,
--                           brutto 15000, Rabatt 15000 — und `invoices_rabatt_
--                           stimmig` geht auf. Alle CHECKs sind `>= 0`, keiner
--                           verlangt einen positiven Betrag.
--
--   TIER-DECKELUNG       ✗  Ein Diamant-Kunde bekam gemessene 25 % statt 100 %.
--                           Der Plan hatte das vorhergesagt (Abschnitt 2.3);
--                           jetzt ist es am laufenden Code belegt.
--
--   KATALOG-GRENZE       ✗  `bounties_discount_pct_check` laesst hoechstens
--                           20 % zu. Ein 100-%-Eintrag waere gar nicht erst
--                           anlegbar gewesen. Stand nicht im Plan.
--
--   LEBENSZYKLUS         ✗  DER SCHWERSTE. Der Lauf setzt das Abo auf
--                           `past_due`. Eine 0-EUR-Rechnung bezahlt niemand —
--                           es gibt nichts zu zahlen. `applyRenewalPayment`,
--                           das aus `past_due` zurueckfuehrt, hat KEINEN
--                           EINZIGEN AUFRUFER. Nach 14 Tagen greift
--                           `applyHardLocks`: Abo `canceled`, Organisation auf
--                           DEMO. Der Kunde, dem ein Freimonat versprochen
--                           wurde, wird ausgesperrt.
--
--   MAHNLAUF             ✗  `runDunningSweep` filtert nicht auf den Betrag.
--                           Der Kunde bekaeme eine Zahlungserinnerung ueber
--                           0,00 EUR.
--
-- Diese Migration raeumt die zwei SCHEMA-seitigen Befunde weg. Die beiden
-- anderen (Lebenszyklus, Mahnlauf) sind Code und liegen in
-- `recurringBillingService.js`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM DIE 20-%-GRENZE NICHT EINFACH FAELLT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sie ist ein Geld-Schutz: kein Katalogeintrag soll versehentlich die halbe
-- Rechnung verschenken. Sie pauschal auf 100 zu heben, um EINEN Eintrag zu
-- ermoeglichen, waere der falsche Tausch — dieselbe Ueberlegung, aus der
-- Migration 170 auf eine negative `invoice_items`-Zeile verzichtet hat.
--
-- Stattdessen wird die Regel GENAUER statt schwaecher: 100 % nur fuer einen
-- Eintrag, der ausdruecklich `deckel_frei` traegt. Fuer jeden normalen Eintrag
-- gilt weiterhin exakt dieselbe Grenze wie vorher.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM `deckel_frei` AM KATALOG UND NICHT AM SCHLUESSEL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Der naheliegende Weg waere `if (key === 'werbe_cashback')` im Code. Das ist
-- die Sorte Sonderfall, die beim zweiten Anlass kopiert wird und beim dritten
-- vergessen. Als Katalog-Eigenschaft ist es eine REGEL: "dieses Bounty steht
-- neben der Stufen-Obergrenze, nicht darunter" — pruefbar, sichtbar in der
-- Staff-Flaeche, und der naechste Fall braucht keine Codeaenderung.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   ALTER TABLE bounties DROP CONSTRAINT IF EXISTS bounties_discount_pct_check;
--   ALTER TABLE bounties ADD CONSTRAINT bounties_discount_pct_check
--     CHECK (discount_pct >= 0 AND discount_pct <= 20);
--   ALTER TABLE bounties DROP COLUMN IF EXISTS deckel_frei;
--   ALTER TABLE referral_rewards DROP COLUMN IF EXISTS rechnung_id;
--   ALTER TABLE referral_rewards DROP COLUMN IF EXISTS angewandt_am;
--   ALTER TABLE referral_rewards DROP COLUMN IF EXISTS faellig_ab;

SET client_min_messages TO WARNING;

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Der Katalog kennt Eintraege, die neben der Stufen-Obergrenze stehen
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS deckel_frei BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bounties.deckel_frei IS
  'TRUE: dieses Bounty wird NICHT von der Stufen-Obergrenze gedeckelt, sondern kommt daneben hinzu. Nur fuer Praemien gedacht, die eine Zusage sind statt einer Belohnung fuer Treue — der Werbe-Cashback waere sonst bei einem Bronze-Kunden von 100 % auf 8 % geschrumpft.';

-- Die Grenze wird GENAUER, nicht schwaecher: fuer jeden normalen Eintrag gilt
-- weiterhin 20 %. Nur ein ausdruecklich deckel-freier Eintrag darf darueber.
ALTER TABLE bounties DROP CONSTRAINT IF EXISTS bounties_discount_pct_check;
ALTER TABLE bounties
  ADD CONSTRAINT bounties_discount_pct_check
  CHECK (
    discount_pct >= 0
    AND discount_pct <= CASE WHEN deckel_frei THEN 100 ELSE 20 END
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Die Werbepraemie bekommt einen Verbrauchsvermerk
-- ───────────────────────────────────────────────────────────────────────────
--
-- `referral_rewards` ist seit jeher das BUCH der verdienten Praemien —
-- `qualifyReferralReward` schreibt dort eine Zeile, sobald ein geworbener Kunde
-- ein zahlendes Abo abschliesst. Was fehlte, ist die andere Haelfte: nichts im
-- Geldpfad hat diese Zeilen je GELESEN. Gemessen am 2026-08-30: keine einzige
-- Datei aus invoiceService / recurringBillingService / paymentService /
-- planCatalog erwaehnt `referral` ueberhaupt.
--
-- Damit war die Werbepraemie dieselbe Fehlerklasse wie der Treue-Rabatt vor
-- Migration 170: ein Preisversprechen ohne Wirkung. Der Kunde sah eine
-- Gutschrift und zahlte den vollen Preis.
--
-- Die drei Spalten schliessen den Kreis: WANN die Praemie faellig wird
-- (Karenz), WANN sie angewandt wurde und AUF WELCHER Rechnung.

ALTER TABLE referral_rewards
  -- Owner-Entscheid 2026-08-27: der Geworbene muss 30 Tage Bestand haben.
  -- Als Datum und nicht als Rechnung ueber `applied_at`, damit die Frist auch
  -- dann stimmt, wenn die Regel sich spaeter aendert — was einmal zugesagt war,
  -- bleibt zugesagt.
  ADD COLUMN IF NOT EXISTS faellig_ab   DATE,
  ADD COLUMN IF NOT EXISTS angewandt_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rechnung_id  UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Bestandszeilen: was vor dieser Migration gebucht wurde, ist sofort faellig.
-- Eine Karenz rueckwirkend zu erfinden, wuerde eine Zusage nachtraeglich
-- verschlechtern.
UPDATE referral_rewards
   SET faellig_ab = (applied_at AT TIME ZONE 'Europe/Berlin')::date
 WHERE faellig_ab IS NULL;

COMMENT ON COLUMN referral_rewards.faellig_ab IS
  'Ab wann die Praemie angewandt werden darf — Karenz von 30 Tagen (Owner-Entscheid 2026-08-27). Europe/Berlin, nie ein roher UTC-Schnitt.';
COMMENT ON COLUMN referral_rewards.angewandt_am IS
  'Wann die Praemie eine Rechnung guenstiger gemacht hat. NULL = noch offen. Vorher gab es diese Haelfte nicht: die Praemie wurde gebucht und nie angewandt.';
COMMENT ON COLUMN referral_rewards.rechnung_id IS
  'Die Rechnung, die durch diese Praemie frei wurde. Der Beleg, ohne den "angewandt" eine Behauptung waere.';

-- Die eine Abfrage, die der Abrechnungslauf je Kunde stellt: "hat er eine offene,
-- faellige Praemie?" Teilindex, weil angewandte Zeilen dabei nie interessieren
-- und das Buch mit den Jahren waechst.
CREATE INDEX IF NOT EXISTS idx_referral_rewards_offen
  ON referral_rewards (user_id, faellig_ab)
  WHERE angewandt_am IS NULL;

COMMIT;

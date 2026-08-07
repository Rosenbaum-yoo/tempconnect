-- Migration 165: Zuverlaessigkeits-Bounty (P8 Welle C)
-- =============================================================================
-- WARUM ES DIESE MIGRATION GIBT
-- P8 Leitentscheidung 3.2: keine Geldstrafen, sondern der VERLUST einer
-- Belohnung. Es wird niemandem Geld genommen, es wird nur nicht gegeben —
-- rechtlich sauber, und Verlustaversion wirkt staerker als eine gleich hohe
-- Strafe. Welle B hat gemessen, wer zuverlaessig ist; hier bekommt das eine
-- Folge, die man im Portemonnaie spuert.
--
-- Owner-Entscheidung E3: 3 %, Kategorie `performance`, Fenster 90 Tage ohne
-- gewichteten Storno.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DER TEURE BEFUND, DEN DIESE MIGRATION MITREPARIERT
--
-- Es gibt seit Migration 053 bereits ein Bounty `zero_complaint`
-- ("Null-Beschwerde-Streak", 3 %, "12 Monate ohne Beanstandung oder Storno").
-- Seine Bedingung zaehlt `requests.status = 'CANCELED'`.
--
-- Das misst den FALSCHEN STORNO-KANAL. `requests` ist der Alt-Pfad (Anfrage +
-- Reservierung); dort wird 'CANCELED' durchaus geschrieben, aber ausschliesslich
-- ueber `PATCH /api/requests/:id` -> `capacityService.releaseReservationAndSetStatus`
-- (routes/requests.js:421). Der heutige Deal-Flow laeuft dagegen ueber
-- `offers.agreement_status`, und `dealAgreementService.cancelAgreement` fasst
-- die Tabelle `requests` NIE an — nachgeprueft: es aendert `offers`,
-- `assignments`, `assignment_staffing_*`, `demand_requests`, `capacity_posts`.
--
-- Folge: Wer eine Einsatzvereinbarung zwoelf Stunden vor Beginn platzen laesst —
-- also genau das Verhalten, um das es in P8 geht — laesst `requests.status`
-- unberuehrt und behaelt die 3 % Rabatt fuer "null Stornos". Die Plattform
-- belohnt damit ausgerechnet den Kanal, den sie eindaemmen will.
--
-- (Aeltere Fassung dieses Kommentars behauptete, den Status schreibe "kein
-- Codepfad". Das war zu weit gegriffen und ist am Code widerlegt worden — die
-- Suche danach hatte parametrisierte Statements uebersehen. Der Defekt bleibt,
-- nur seine Beschreibung ist praeziser: falscher Kanal, nicht toter Status.)
--
-- Ein zweites Bounty danebenzustellen und das erste stehen zu lassen, waere die
-- schlechteste aller Varianten: zwei Kacheln, die dasselbe versprechen, eine
-- davon am falschen Kanal gemessen, zusammen 6 % Rabatt. Deshalb wird
-- `zero_complaint` hier auf dieselbe Quelle umgestellt und die beiden zu einer
-- Leiter verbunden.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DIE LEITER (und warum sie sich nicht stapelt)
--   zuverlaessiger_partner   90 Tage sauber   3 %   Einstieg
--   zero_complaint          365 Tage sauber   3 %   loest den Einstieg AB
--
-- `replaces` nutzt das bereits vorhandene Muster aus Migration 053
-- (`loyalty_2y` loest `loyalty_1y` ab). Ohne Ablsoung bekaeme derselbe saubere
-- Anbieter zweimal Rabatt fuer dieselbe Tugend.
--
-- Die Rabatthoehe von `zero_complaint` bleibt unveraendert bei 3 %: Preise sind
-- eine Owner-Entscheidung, und E3 hat nur den neuen Eintrag beziffert. Die
-- Leiter traegt heute also Prestige, nicht mehr Geld. Ob die lange Stufe
-- spaeter 5 % wert sein soll, entscheidet der Owner.
--
-- WARUM DIE SCHWELLE "MINDESTENS N VERBINDLICHE DEALS"
-- Ohne sie waere ein Konto, das nie etwas tut, dauerhaft "zuverlaessig" und
-- bekaeme 3 % Rabatt fuers Nichtstun. Das ist kein Preisentscheid, sondern
-- Missbrauchsschutz, und spiegelt die bereits bestehende Konvention von
-- `zero_complaint` (">= 3 abgeschlossene Deals").
--
-- Der Nachweis laeuft ueber ein FESTES Jahr, nicht ueber die Streak-Laenge.
-- Der erste Entwurf koppelte beides und war damit falsch: eine Zeitarbeitsfirma
-- mit ruhigem, aber verlaesslichem Geschaeft erreichte die 365-Tage-Stufe und
-- blieb bei der 90-Tage-Stufe gesperrt ("noch 2 Abschluesse") — die Leiter lief
-- rueckwaerts und sah kaputt aus. Am echten Datenbestand aufgefallen, nicht am
-- Reissbrett. Mit festem Nachweisfenster ist sie monoton: wer die lange Stufe
-- haelt, erfuellt die kurze zwangslaeufig mit.
--
-- Rollback:
--   DELETE FROM user_bounties WHERE bounty_id IN (SELECT id FROM bounties WHERE key = 'zuverlaessiger_partner');
--   DELETE FROM bounties WHERE key = 'zuverlaessiger_partner';
--   UPDATE bounties SET threshold_type = 'zero_complaints_12m',
--          threshold_value = '{"months": 12}',
--          description_de = '12 Monate ohne Beanstandung oder Storno'
--    WHERE key = 'zero_complaint';
--   -- Achtung: das stellt auch den Defekt wieder her.
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Neues Bounty: die 90-Tage-Stufe (E3)
-- ---------------------------------------------------------------------------
INSERT INTO bounties
  (key, name_de, description_de, category, icon, discount_pct,
   threshold_type, threshold_value, is_recurring, sort_order)
VALUES
  ('zuverlaessiger_partner',
   'Zuverlaessiger Partner',
   '90 Tage ohne gewichteten Storno, bei mindestens 3 verbindlichen Abschluessen im letzten Jahr. Kurzfristige Absagen zaehlen doppelt; Kundenabsagen und Krankmeldungen zaehlen nicht gegen die Zeitarbeitsfirma.',
   'performance', 'Z', 3.0,
   'reliability_streak',
   '{"days": 90, "min_binding_deals": 3}'::jsonb,
   TRUE, 0)
ON CONFLICT (key) DO UPDATE SET
  name_de         = EXCLUDED.name_de,
  description_de  = EXCLUDED.description_de,
  category        = EXCLUDED.category,
  discount_pct    = EXCLUDED.discount_pct,
  threshold_type  = EXCLUDED.threshold_type,
  threshold_value = EXCLUDED.threshold_value,
  is_recurring    = EXCLUDED.is_recurring,
  sort_order      = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 2. Reparatur: zero_complaint auf die echte Quelle umstellen
-- ---------------------------------------------------------------------------
-- Schluessel, Name und Rabatt bleiben — nur die Wahrheit dahinter aendert sich.
UPDATE bounties SET
  description_de  = '365 Tage ohne gewichteten Storno, bei mindestens 5 verbindlichen Abschluessen im letzten Jahr. Loest den Zuverlaessigen Partner ab.',
  threshold_type  = 'reliability_streak',
  threshold_value = '{"days": 365, "min_binding_deals": 5, "replaces": "zuverlaessiger_partner"}'::jsonb,
  is_recurring    = TRUE
WHERE key = 'zero_complaint';

-- ---------------------------------------------------------------------------
-- 3. Vergaben nach der alten Regel zuruecknehmen
-- ---------------------------------------------------------------------------
-- Jede bestehende `zero_complaint`-Vergabe wurde am falschen Storno-Kanal
-- gemessen und sagt ueber Agreement-Stornos nichts aus. Sie wird deaktiviert,
-- NICHT geloescht: die Zeile traegt `earned_at` und damit die Historie, und der
-- naechste `evaluateBounties`-Lauf vergibt sie sofort neu, wenn sie nach der
-- neuen Regel zusteht. Ohne diesen Schritt liefe der alte Rabatt weiter, bis
-- der Nutzer zufaellig seine Bounty-Seite oeffnet.
UPDATE user_bounties SET is_active = FALSE, progress = 0, updated_at = NOW()
 WHERE bounty_id = (SELECT id FROM bounties WHERE key = 'zero_complaint')
   AND is_active = TRUE;

COMMIT;

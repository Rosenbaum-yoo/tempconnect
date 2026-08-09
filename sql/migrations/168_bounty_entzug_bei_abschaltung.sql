-- 168_bounty_entzug_bei_abschaltung.sql
-- P9 Spur A / Welle A2 — der Not-Aus nimmt laufende Vergaben mit
--
-- WARUM DIESE MIGRATION
-- Migration 166 hat den Schalter gebracht, aber nur die LESENDEN Pfade dicht
-- gemacht: `getUserDiscount` filtert auf `b.is_active`, der Rabatt endet also
-- sofort. Die Zeile in `user_bounties` bleibt jedoch mit `is_active = TRUE`
-- stehen — und zwar fuer immer, denn `evaluateBounties` iteriert nur ueber den
-- gefilterten Katalog und sieht ein abgeschaltetes Bounty nie wieder.
--
-- Diese verwaisten Zeilen sind nicht harmlos:
--   * `bountyTierService` zaehlt `user_bounties WHERE is_active` OHNE Join auf
--     `bounties`. Die Zeile zaehlt also weiter fuer die Stufen-Beforderung und
--     hebt darueber die Rabatt-Obergrenze (`max_discount_pct`).
--   * `dealCommitmentService` warnt beim Storno mit "X % Rabatt in Gefahr" und
--     nennt dabei ein Bounty, das laengst nichts mehr auszahlt.
-- Beide Stellen werden im Code mitgezogen; hier wird die Ursache geschlossen.
--
-- WARUM EIN TRIGGER UND NICHT NUR DIENST-CODE
-- Gate A2 verlangt woertlich: "Ein Bounty abzuschalten ist ein UPDATE — kein
-- Deploy." Genau dann kann das Abschalten aber auch per Hand-SQL, per Migration
-- oder aus einem kuenftigen zweiten Bedienweg kommen. Ein Entzug, der nur im
-- Anwendungsdienst steht, greift in diesen Faellen nicht. Der Trigger haengt die
-- Folge an die Ursache, egal wer sie ausloest.
--
-- BEWUSST NICHT UMGEKEHRT: Wiedereinschalten stellt nichts wieder her. Ob ein
-- Nutzer das Bounty heute noch verdient, entscheidet die Bedingung bei der
-- naechsten Auswertung — nicht ein alter Datenbankzustand. Ein automatisches
-- Zurueckgeben waere eine Behauptung ueber Daten, die niemand geprueft hat.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_bounty_entzug_bei_abschaltung ON bounties;
--   DROP FUNCTION IF EXISTS bounty_entzug_bei_abschaltung();
--   ALTER TABLE bounties DROP COLUMN IF EXISTS updated_at;

BEGIN;

-- Fuer die Verwaltungssicht: "zuletzt geaendert am". Wer geaendert hat, steht im
-- Audit-Log; wann, soll ohne Audit-Abfrage in der Liste stehen.
ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION bounty_entzug_bei_abschaltung()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Nur die Flanke AN -> AUS. Ein UPDATE, das is_active nicht veraendert, und
  -- das Wiedereinschalten bleiben wirkungslos.
  IF OLD.is_active AND NOT NEW.is_active THEN
    UPDATE user_bounties
       SET is_active = FALSE,
           updated_at = NOW()
     WHERE bounty_id = NEW.id
       AND is_active;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION bounty_entzug_bei_abschaltung() IS
  'Entzieht laufende Vergaben, sobald ein Bounty abgeschaltet wird. Haengt am Trigger, damit die Folge auch bei Hand-SQL eintritt und nicht nur im Anwendungsdienst.';

DROP TRIGGER IF EXISTS trg_bounty_entzug_bei_abschaltung ON bounties;
CREATE TRIGGER trg_bounty_entzug_bei_abschaltung
AFTER UPDATE OF is_active ON bounties
FOR EACH ROW
EXECUTE FUNCTION bounty_entzug_bei_abschaltung();

-- Nachholen fuer den einen Fall, den Migration 166 bereits abgeschaltet hat:
-- damals gab es den Trigger noch nicht. `top_supplier` hatte zwar keine einzige
-- Vergabe (das Bounty war unerreichbar), aber die Migration darf sich nicht auf
-- diesen Zufall verlassen.
UPDATE user_bounties ub
   SET is_active = FALSE, updated_at = NOW()
  FROM bounties b
 WHERE b.id = ub.bounty_id
   AND NOT b.is_active
   AND ub.is_active;

COMMIT;
